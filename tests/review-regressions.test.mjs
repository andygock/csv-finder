import test from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { DataEngine, compareCells, serialiseRow } from "../src/data.ts";
import { parseInput } from "../src/parseInput.ts";
import { columnOptions } from "../src/columnOptions.ts";
import { initialImportState, importReducer, prepareSource } from "../src/importState.ts";

const query = {
  filter: "",
  phrase: false,
  headers: true,
  skipEmpty: false,
  sort: null,
  page: 0,
  pageSize: 100,
};
const numeric = { key: 0, direction: "ascending", mode: "numeric" };

test("long zero runs sort exactly without regex backtracking or padded fractions", async () => {
  const tiny = "0." + "0".repeat(100_000) + "1";
  const larger = "0." + "0".repeat(99_999) + "1";
  assert.ok(compareCells(tiny, larger, numeric) < 0);
  assert.ok(compareCells("-" + tiny, "0", numeric) < 0);
  const rows = [["value"], [larger], [tiny], ["-" + tiny], ["0"], ["1.00000"]];
  const engine = new DataEngine(rows);
  assert.deepEqual(
    (await engine.query({ ...query, sort: numeric })).rows.map((r) => r.id),
    [3, 4, 2, 1, 5],
  );
});

test("compact numeric keys agree with independently scaled integers", async () => {
  let seed = 42;
  const values = Array.from({ length: 500 }, (_, i) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const integer = String(seed).padStart(12, "0");
    const fraction = String(i * 1999).padStart(6, "0");
    const grouped = i % 3 ? integer : integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return {
      text: ` ${i % 2 ? "-" : "+"}$${grouped}.${fraction}00 `,
      scaled: BigInt(seed) * 1_000_000n + BigInt(fraction),
      negative: i % 2 === 1,
    };
  });
  const engine = new DataEngine([["value"], ...values.map((v) => [v.text])]);
  for (const direction of ["ascending", "descending"]) {
    const expected = values
      .map((value, i) => ({ id: i + 1, number: value.negative ? -value.scaled : value.scaled }))
      .sort(
        (a, b) =>
          (a.number < b.number ? -1 : a.number > b.number ? 1 : 0) *
            (direction === "ascending" ? 1 : -1) || a.id - b.id,
      );
    const actual = await engine.query({ ...query, sort: { ...numeric, direction } });
    assert.deepEqual(
      actual.rows.map((r) => r.id),
      expected.slice(0, 100).map((r) => r.id),
    );
  }
});

test("numeric sorting handles rows beyond the old cache threshold and header changes", async () => {
  const count = 300_000;
  const engine = new DataEngine([
    ["0"],
    ...Array.from({ length: count }, (_, i) => [String(count - i)]),
  ]);
  const sorted = await engine.query({ ...query, sort: numeric });
  assert.equal(sorted.matched, count);
  assert.equal(sorted.rows[0].cells[0], "1");
  assert.equal(
    (await engine.query({ ...query, sort: numeric, headers: false })).rows[0].cells[0],
    "0",
  );
  assert.equal((await engine.query(query)).rows[0].cells[0], String(count));
});

test("blank prefixes spanning chunks preserve rows without selecting a fallback dialect", async () => {
  for (const delimiter of [",", "\t", ";", "|"]) {
    let count = 0,
      last;
    const prefix = "\n".repeat(1024 * 1024);
    const dialect = await parseInput(
      new File([prefix, `a${delimiter}b\nx${delimiter}y\n`], "data.csv"),
      "",
      (result) => {
        count += result.data.length;
        last = result.data.at(-1) ?? last;
      },
    );
    assert.equal(dialect.delimiter, delimiter);
    assert.equal(count, prefix.length + 2);
    assert.deepEqual(last, ["x", "y"]);
  }
  const rows = [];
  await parseInput(" \r\n\t\r\na;b\r\nx;y\r", "", (result) => rows.push(...result.data)).then(
    () => assert.fail("Mixed endings should fail"),
    (error) => assert.match(error.message, /Mixed/),
  );
  assert.deepEqual(rows[0], [" "]);
});

test("import previews preserve dataset counts and ragged columns outside the first five rows", async () => {
  const engine = new DataEngine([["a"], ["b"], ["c"], ["d"], ["e"], ["f", "g", "h"]]);
  const preview = await engine.importPreview();
  assert.equal(preview.loaded, 6);
  assert.equal(preview.matched, 6);
  assert.equal(preview.rows.length, 5);
  assert.deepEqual(preview.rows[0].cells, ["a", "", ""]);
  assert.equal((await engine.query({ ...query, headers: false })).matched, 6);
});

test("spreadsheet copies escape formulae without changing exact copies", () => {
  const cells = ["=1+1", "+42", "-42", "@SUM(A1)", "\tvalue", "\rvalue", "ordinary"];
  for (const delimiter of [",", "\t"]) {
    assert.deepEqual(Papa.parse(serialiseRow(cells, delimiter), { delimiter }).data, [cells]);
    const safe = Papa.parse(serialiseRow(cells, delimiter, true), { delimiter }).data[0];
    assert.deepEqual(
      safe,
      cells.map((v, i) => (i < 6 ? "'" + v : v)),
    );
  }
  const engine = new DataEngine([cells]);
  assert.equal(engine.detail(0, 0, ",", false), "=1+1");
  assert.equal(engine.detail(0, 0, ",", false, true), "'=1+1");
});

test("column lookup retains duplicate headings and can find their source numbers", () => {
  const headings = Array(1000).fill("Repeated heading");
  assert.equal(columnOptions(headings, "repeated").length, 1000);
  assert.deepEqual(
    columnOptions(headings, "999.").map((c) => c.id),
    [998],
  );
  assert.equal(columnOptions(headings, "1000")[0].id, 999);
});

test("import recovery preserves the accepted file through failed and cancelled replacements", () => {
  const file = prepareSource(new File(["a,b\nx,y"], "original.csv"), ",");
  const pasted = prepareSource("x;y\n1;2", ";");
  const info = { rows: 2, columns: 2, delimiter: ",", headings: ["a", "b"], preview: {} };
  let state = importReducer(initialImportState, { type: "start", source: file });
  state = importReducer(state, { type: "loaded", info, warning: "" });
  state = importReducer(state, { type: "confirm" });
  assert.equal(state.previousFile, file);
  const ready = importReducer(state, { type: "validationError", message: "Too large" });
  assert.equal(ready.phase, "ready");
  state = importReducer(state, { type: "start", source: pasted });
  state = importReducer(state, { type: "error", message: "Invalid input" });
  assert.equal(state.source.value, pasted.value);
  assert.equal(state.previousFile, file);
  state = importReducer(state, { type: "start", source: state.previousFile });
  assert.equal(state.source.delimiter, ",");
  state = importReducer(state, { type: "cancel" });
  assert.equal(state.previousFile, file);
  assert.equal(state.phase, "idle");
  assert.deepEqual(importReducer(state, { type: "clear" }), initialImportState);
});

test("accepted pastes reuse one File and do not replace previous-file recovery", async () => {
  const source = prepareSource("a;€\n1;2", ";");
  assert.ok(source.value instanceof File);
  assert.equal(source.bytes, Buffer.byteLength("a;€\n1;2"));
  assert.equal(await source.value.text(), "a;€\n1;2");
  let state = importReducer(initialImportState, { type: "start", source });
  state = importReducer(state, { type: "loaded", info: {}, warning: "" });
  state = importReducer(state, { type: "confirm" });
  assert.equal(state.source.value, source.value);
  assert.equal(state.previousFile, null);
  assert.equal(importReducer(state, { type: "preview" }).phase, "preview");
  assert.throws(() => prepareSource("", ""), /empty/);
});
