import test from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import {
  DataEngine,
  compareCells,
  copyDelimiter,
  highlightPattern,
  parseProblem,
  searchTokens,
  serialiseRow,
  unformatNumber,
} from "../src/data.ts";

const base = {
  filter: "",
  phrase: false,
  headers: true,
  skipEmpty: true,
  sort: null,
  page: 0,
  pageSize: 100,
};

test("copying preserves ordinary text and precision while simplifying only valid numbers", () => {
  for (const value of ["Smith, Jane", "US$ value", "  hello  ", "1,23", "1.234,56", "=SUM(A1)"])
    assert.equal(unformatNumber(value), value);
  assert.equal(unformatNumber(" $1,234.50 "), "1234.50");
  assert.equal(unformatNumber("-$9,007,199,254,740,993.0001"), "-9007199254740993.0001");
  assert.equal(unformatNumber("00123"), "00123");
});

test("switching comma to tab and serialising quoted/multiline cells round trips", () => {
  const row = ["a\tb", "line1\r\nline2", 'say "hello"', "Smith, Jane", "", "  spaces  "];
  for (const delimiter of [copyDelimiter(","), copyDelimiter("\t")]) {
    const parsed = Papa.parse(serialiseRow(row, delimiter), { delimiter });
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(parsed.data, [row]);
  }
  assert.equal(copyDelimiter("invalid"), "\t");
});

test("delimiter warnings are recoverable, quoting failures include a record location", () => {
  const single = Papa.parse("Name\nAlice\nBob");
  assert.equal(parseProblem(single.errors, 0), null);
  const malformed = Papa.parse('Name,Note\nAlice,"unfinished', { delimiter: "," });
  assert.match(parseProblem(malformed.errors, 20), /record 22/);
});

test("tokens stay inside cells, phrase matching and regex metacharacters are literal", async () => {
  const engine = new DataEngine([
    ["a", "b"],
    ["red", "fox"],
    ["red fox", "C++"],
    ["concatenate", ""],
  ]);
  assert.deepEqual(
    (await engine.query({ ...base, filter: "red fox" })).rows.map((row) => row.id),
    [1, 2],
  );
  assert.deepEqual(
    (await engine.query({ ...base, filter: "red fox", phrase: true })).rows.map((row) => row.id),
    [2],
  );
  assert.equal((await engine.query({ ...base, filter: "d f", phrase: true })).matched, 1);
  assert.equal((await engine.query({ ...base, filter: "cat", phrase: true })).matched, 1);
  assert.deepEqual(searchTokens("  RED red\tfox  ", false), ["red", "fox"]);
  assert.deepEqual("C++ (a)".split(highlightPattern("C++ (a)", false)), [
    "",
    "C++",
    " ",
    "(a)",
    "",
  ]);
  assert.deepEqual("foobar".split(highlightPattern("foo foobar", false)), ["", "foobar", ""]);
});

test("empty records can be restored and source IDs survive sorting and filtering", async () => {
  const engine = new DataEngine([["name"], ["Bob"], [" "], [], ["Alice"]]);
  const sorted = await engine.query({
    ...base,
    sort: { key: 0, direction: "ascending", mode: "text" },
  });
  assert.deepEqual(
    sorted.rows.map((row) => row.id),
    [4, 1],
  );
  assert.equal(sorted.loaded, 4);
  assert.equal((await engine.query({ ...base, skipEmpty: false })).matched, 4);
  assert.equal((await engine.query({ ...base, headers: false })).matched, 3);
  assert.deepEqual(
    (await engine.query({ ...base, filter: "bob" })).rows.map((row) => row.id),
    [1],
  );
});

test("numeric sorting is exact for long integers, decimals, negatives and blanks", async () => {
  const engine = new DataEngine([
    ["value"],
    ["10"],
    ["2"],
    [],
    [""],
    ["word"],
    ["-2"],
    ["9007199254740993"],
    ["9007199254740992"],
    ["1.00000000000000002"],
    ["1.00000000000000001"],
  ]);
  const sort = { key: 0, direction: "ascending", mode: "numeric" };
  assert.deepEqual(
    (await engine.query({ ...base, skipEmpty: false, sort })).rows.map((row) => row.id),
    [6, 10, 9, 2, 1, 8, 7, 5, 3, 4],
  );
  assert.deepEqual(
    (
      await engine.query({ ...base, skipEmpty: false, sort: { ...sort, direction: "descending" } })
    ).rows.map((row) => row.id),
    [7, 8, 1, 2, 9, 10, 6, 5, 3, 4],
  );
  assert.equal(compareCells("-0.00", "+0", sort), 0);
  assert.ok(compareCells("-$1,234.50", "-2", sort) < 0);
});

test("ragged rows get headings and bounded pages, including requests beyond the end", async () => {
  const engine = new DataEngine([["name"], ["a", "extra"], ["b"]]);
  const page = await engine.query({ ...base, pageSize: 1, page: 99 });
  assert.deepEqual(page.headings, ["name", "Column 2"]);
  assert.equal(page.page, 1);
  assert.deepEqual(page.rows, [{ id: 2, cells: ["b", ""], lengths: [1, 0], offsets: [0, 0] }]);
  const wide = new DataEngine(Array.from({ length: 10 }, () => Array(1000).fill("x")));
  assert.equal((await wide.query(base)).rows.length, 2);
});

test("obsolete scans yield and cannot overwrite a newer query cache", async () => {
  const engine = new DataEngine([
    ["value"],
    ...Array.from({ length: 30_000 }, (_, i) => [String(i)]),
  ]);
  let current = true;
  const obsolete = engine.query({ ...base, filter: "1" }, () => current);
  current = false;
  const latest = await engine.query({
    ...base,
    filter: "29999",
    sort: { key: 0, mode: "numeric", direction: "descending" },
  });
  assert.equal(await obsolete, null);
  assert.deepEqual(
    latest.rows.map((row) => row.cells),
    [["29999"]],
  );
  assert.equal(
    (
      await engine.query({
        ...base,
        filter: "29999",
        sort: { key: 0, mode: "numeric", direction: "descending" },
      })
    ).matched,
    1,
  );
});

// These tests deliberately exercise the message payload, not just row counts.
test("pages carry bounded previews and on-demand details retain source contents", async () => {
  const long = "x".repeat(100000) + "needle" + "y".repeat(1000);
  const engine = new DataEngine([
    ["name", "note"],
    ["Alice", long],
  ]);
  const page = await engine.query({ ...base, filter: "needle" });
  assert.ok(page.rows[0].cells[1].includes("needle"));
  assert.ok(page.rows[0].cells[1].length <= 240);
  assert.equal(page.rows[0].lengths[1], long.length);
  assert.ok(page.rows[0].offsets[1] > 0);
  assert.equal(engine.detail(1, 1, ",", false), long);
  assert.deepEqual(Papa.parse(engine.detail(1, null, "\t", false), { delimiter: "\t" }).data, [
    ["Alice", long],
  ]);
});

test("wide long-cell pages have a character budget and preserve source column identities", async () => {
  const engine = new DataEngine(
    Array.from({ length: 30 }, () => Array(100).fill("x".repeat(10000))),
  );
  const page = await engine.query(base);
  assert.ok(page.rows.reduce((n, row) => n + row.cells.join("").length, 0) <= 200000);
  const subset = await engine.query({ ...base, visibleColumns: [99, 2] });
  assert.deepEqual(subset.columnIds, [99, 2]);
  assert.equal(subset.rows[0].cells.length, 2);
});

test("narrowing search caches preserve semantics across deletion, scope and phrase changes", async () => {
  const rows = [
    ["one", "two"],
    ["red fox", "blue"],
    ["red", "fox"],
    ["reddish", "blue"],
    ["blue", "red fox"],
    ["", ""],
  ];
  const engine = new DataEngine(rows);
  const queries = [
    { filter: "red" },
    { filter: "red fox" },
    { filter: "red fox", phrase: true },
    { filter: "red" },
    { filter: "red", searchColumn: 1 },
    { filter: "", skipEmpty: false },
    { filter: "blue", searchColumn: 0 },
    { filter: "blue", searchColumn: null },
  ];
  for (const options of queries) {
    const query = { ...base, ...options };
    const actual = await engine.query(query);
    const expected = await new DataEngine(rows).query(query);
    assert.deepEqual(actual.rows, expected.rows);
    assert.equal(actual.matched, expected.matched);
  }
});

test("randomised exact numeric sorting agrees with the comparator in both directions", async () => {
  let seed = 42;
  const rows = [
    ["value"],
    ...Array.from({ length: 2000 }, (_, i) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return [
        i % 17 === 0
          ? ""
          : i % 13 === 0
            ? "text"
            : `${i % 2 ? "-" : ""}${seed}000000000000000000.00${i % 9}`,
      ];
    }),
  ];
  const engine = new DataEngine(rows);
  for (const direction of ["ascending", "descending"]) {
    const sort = { key: 0, mode: "numeric", direction };
    const expected = rows
      .slice(1)
      .map((_, i) => i + 1)
      .sort((a, b) => compareCells(rows[a][0], rows[b][0], sort) || a - b);
    const page = await engine.query({ ...base, sort, skipEmpty: false });
    assert.deepEqual(
      page.rows.map((row) => row.id),
      expected.slice(0, page.pageSize),
    );
  }
});

test("sorting and long-cell searches yield and cancellation retains a usable dataset", async () => {
  let seed = 42;
  const engine = new DataEngine([
    ["value"],
    ...Array.from({ length: 80000 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return [String(seed)];
    }),
  ]);
  const initial = await engine.query(base);
  let current = true;
  const sorting = engine.query(
    { ...base, sort: { key: 0, mode: "numeric", direction: "ascending" } },
    () => current,
  );
  current = false;
  assert.equal(await sorting, null);
  assert.deepEqual((await engine.query(base)).rows, initial.rows);
  const large = new DataEngine([
    ["value"],
    ...Array.from({ length: 40 }, () => ["x".repeat(1024 * 1024)]),
  ]);
  current = true;
  const searching = large.query({ ...base, filter: "absent" }, () => current);
  current = false;
  assert.equal(await searching, null);
  assert.equal((await large.query(base)).matched, 40);
});

test("Unicode folds keep contextual casing and map expanded offsets back to the source", async () => {
  const sigma = new DataEngine([["value"], ["a".repeat(32768) + "Σa"]]);
  assert.equal((await sigma.query({ ...base, filter: "ς" })).matched, 0);
  assert.equal((await sigma.query({ ...base, filter: "σ" })).matched, 1);
  for (const length of [20000, 40000]) {
    const value = "İ".repeat(length) + "needle";
    const page = await new DataEngine([["value"], [value]]).query({ ...base, filter: "needle" });
    assert.equal(page.matched, 1);
    assert.ok(page.rows[0].cells[0].includes("needle"));
    assert.equal(page.rows[0].offsets[0], length - 24);
  }
});
