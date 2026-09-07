import test from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { DataEngine, compareCells, copyDelimiter, highlightPattern, parseProblem, searchTokens, serialiseRow, unformatNumber } from "../src/data.ts";

const base = { filter: "", phrase: false, headers: true, skipEmpty: true, sort: null, page: 0, pageSize: 100 };

test("copying preserves ordinary text and precision while simplifying only valid numbers", () => {
  for (const value of ["Smith, Jane", "US$ value", "  hello  ", "1,23", "1.234,56", "=SUM(A1)"]) assert.equal(unformatNumber(value), value);
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
  const engine = new DataEngine([["a", "b"], ["red", "fox"], ["red fox", "C++"], ["concatenate", ""]]);
  assert.deepEqual((await engine.query({ ...base, filter: "red fox" })).rows.map(row => row.id), [1, 2]);
  assert.deepEqual((await engine.query({ ...base, filter: "red fox", phrase: true })).rows.map(row => row.id), [2]);
  assert.equal((await engine.query({ ...base, filter: "d f", phrase: true })).matched, 1);
  assert.equal((await engine.query({ ...base, filter: "cat", phrase: true })).matched, 1);
  assert.deepEqual(searchTokens("  RED red\tfox  ", false), ["red", "fox"]);
  assert.deepEqual("C++ (a)".split(highlightPattern("C++ (a)", false)), ["", "C++", " ", "(a)", ""]);
  assert.deepEqual("foobar".split(highlightPattern("foo foobar", false)), ["", "foobar", ""]);
});

test("empty records can be restored and source IDs survive sorting and filtering", async () => {
  const engine = new DataEngine([["name"], ["Bob"], [" "], [], ["Alice"]]);
  const sorted = await engine.query({ ...base, sort: { key: 0, direction: "ascending", mode: "text" } });
  assert.deepEqual(sorted.rows.map(row => row.id), [4, 1]);
  assert.equal(sorted.loaded, 4);
  assert.equal((await engine.query({ ...base, skipEmpty: false })).matched, 4);
  assert.equal((await engine.query({ ...base, headers: false })).matched, 3);
  assert.deepEqual((await engine.query({ ...base, filter: "bob" })).rows.map(row => row.id), [1]);
});

test("numeric sorting is exact for long integers, decimals, negatives and blanks", async () => {
  const engine = new DataEngine([["value"], ["10"], ["2"], [], [""], ["word"], ["-2"], ["9007199254740993"], ["9007199254740992"], ["1.00000000000000002"], ["1.00000000000000001"]]);
  const sort = { key: 0, direction: "ascending", mode: "numeric" };
  assert.deepEqual((await engine.query({ ...base, skipEmpty: false, sort })).rows.map(row => row.id), [6, 10, 9, 2, 1, 8, 7, 5, 3, 4]);
  assert.deepEqual((await engine.query({ ...base, skipEmpty: false, sort: { ...sort, direction: "descending" } })).rows.map(row => row.id), [7, 8, 1, 2, 9, 10, 6, 5, 3, 4]);
  assert.equal(compareCells("-0.00", "+0", sort), 0);
  assert.ok(compareCells("-$1,234.50", "-2", sort) < 0);
});

test("ragged rows get headings and bounded pages, including requests beyond the end", async () => {
  const engine = new DataEngine([["name"], ["a", "extra"], ["b"]]);
  const page = await engine.query({ ...base, pageSize: 1, page: 99 });
  assert.deepEqual(page.headings, ["name", "Column 2"]);
  assert.equal(page.page, 1);
  assert.deepEqual(page.rows, [{ id: 2, cells: ["b"] }]);
  const wide = new DataEngine(Array.from({ length: 10 }, () => Array(1000).fill("x")));
  assert.equal((await wide.query(base)).rows.length, 2);
});

test("obsolete scans yield and cannot overwrite a newer query cache", async () => {
  const engine = new DataEngine([["value"], ...Array.from({ length: 30_000 }, (_, i) => [String(i)])]);
  let current = true;
  const obsolete = engine.query({ ...base, filter: "1" }, () => current);
  current = false;
  const latest = await engine.query({ ...base, filter: "29999", sort: { key: 0, mode: "numeric", direction: "descending" } });
  assert.equal(await obsolete, null);
  assert.deepEqual(latest.rows.map(row => row.cells), [["29999"]]);
  assert.equal((await engine.query({ ...base, filter: "29999", sort: { key: 0, mode: "numeric", direction: "descending" } })).matched, 1);
});
