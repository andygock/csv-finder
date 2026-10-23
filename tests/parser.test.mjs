import test from "node:test";
import assert from "node:assert/strict";
import { parseInput, MAX_RECORD_CHARACTERS } from "../src/parseInput.ts";
import Papa from "papaparse";

const CHUNK = 1024 * 1024;
async function parse(value, delimiter = "") {
  const rows = [],
    errors = [];
  const dialect = await parseInput(new File([value], "data.csv"), delimiter, (result) => {
    rows.push(...result.data);
    errors.push(...result.errors);
  });
  return { rows, errors, dialect };
}

test("detection uses complete records when the first field exceeds one byte chunk", async () => {
  for (const delimiter of [",", "\t", ";", "|"]) {
    const long = "x".repeat(CHUNK + 10);
    const result = await parse(`${long}${delimiter}b\r\ny${delimiter}z\r\n`);
    assert.equal(result.dialect.delimiter, delimiter);
    assert.equal(result.dialect.newline, "\r\n");
    assert.deepEqual(
      result.rows.map((row) => row.map((cell) => cell.length)),
      [
        [long.length, 1],
        [1, 1],
      ],
    );
    assert.deepEqual(result.rows[1], ["y", "z"]);
  }
});

test("CRLF and escaped quotes retain exact values on either side of a byte boundary", async () => {
  for (const suffix of ["\r\ny,z\r\n", ',"abc"\r\ny,z', ',"a""b"\r\ny,z']) {
    for (let shift = -12; shift <= 3; shift++) {
      const value = "a,b\r\n" + "x".repeat(CHUNK - 5 + shift) + suffix;
      const expected = Papa.parse(value, { delimiter: ",", newline: "\r\n" }).data;
      if (expected.at(-1)?.length === 1 && expected.at(-1)[0] === "") expected.pop();
      const result = await parse(value, ",");
      assert.ok(
        JSON.stringify(result.rows) === JSON.stringify(expected),
        `Boundary shift ${shift}, suffix ${JSON.stringify(suffix)}`,
      );
      assert.deepEqual(result.errors, []);
    }
  }
});

test("record limits apply to completed and unfinished records independently of chunk alignment", async () => {
  for (const ending of ["", "\n", "\nnext"]) {
    await assert.rejects(
      () => parse("h\n" + "x".repeat(MAX_RECORD_CHARACTERS + 10) + ending, ","),
      /8,388,608/,
    );
  }
  const result = await parse("h\n" + "x".repeat(MAX_RECORD_CHARACTERS) + "\n", ",");
  assert.equal(result.rows[1][0].length, MAX_RECORD_CHARACTERS);
});

test("blank record counts do not depend on file size or a final newline", async () => {
  for (const size of [2, CHUNK + 10]) {
    const result = await parse("h\n" + "x".repeat(size) + "\n\n", ",");
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.rows[2], [""]);
  }
});

test("mixed separators fail clearly but embedded quoted line endings remain valid", async () => {
  await assert.rejects(() => parse("a,b\r\nc,d\nx,y", ","), /Mixed record line endings/);
  const result = await parse('a,b\r\nc,"one\ntwo\rthree"\r\n', ",");
  assert.deepEqual(result.rows[1], ["c", "one\ntwo\rthree"]);
});
