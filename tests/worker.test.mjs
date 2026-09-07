import test from "node:test";
import assert from "node:assert/strict";

// Exercise the production handler, Blob reader and decoder without a browser.
const messages = [];
globalThis.postMessage = message => messages.push(message);
await import("../src/data.worker.ts");
const base = { filter: "", phrase: false, headers: true, skipEmpty: true, sort: null, page: 0, pageSize: 100 };

async function load(source, delimiter = "") {
  messages.length = 0;
  await globalThis.onmessage({ data: { type: "load", source, delimiter } });
  const deadline = Date.now() + 5000;
  while (!messages.some(message => message.type === "loaded" || message.type === "error")) {
    if (Date.now() > deadline) throw new Error("Import timed out");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  return messages.find(message => message.type === "loaded" || message.type === "error");
}

test("single-column input loads with an actionable delimiter warning", async () => {
  assert.equal((await load("Name\nAlice\nBob")).type, "loaded");
  assert.match(messages.find(message => message.type === "loaded").warning, /delimiter/i);
  await globalThis.onmessage({ data: { type: "query", id: 1, query: base } });
  assert.deepEqual(messages.at(-1).page.rows.map(row => row.cells), [["Alice"], ["Bob"]]);
});

test("malformed, empty and oversized input reports an error without a loaded event", async () => {
  for (const source of ["", " \n\t", 'a,b\nx,"unfinished']) {
    assert.equal((await load(source, ",")).type, "error");
    assert.ok(!messages.some(message => message.type === "loaded"));
  }
  assert.equal((await load({ size: 256 * 1024 * 1024 + 1 }, ",")).type, "error");
  assert.equal((await load(Array(1001).fill("a").join(","), ",")).type, "error");
});

test("TSV files, BOMs, CRLF and ragged rows load through the Blob reader", async () => {
  const source = new File(['\ufeffname\tnote\r\nAlice\t"two\nlines"\r\nBob'], "data.tsv");
  assert.equal((await load(source, "\t")).type, "loaded");
  await globalThis.onmessage({ data: { type: "query", id: 2, query: base } });
  assert.equal(messages.at(-1).page.headings[0], "name");
  assert.deepEqual(messages.at(-1).page.rows.map(row => row.cells), [["Alice", "two\nlines"], ["Bob"]]);
});

test("invalid encoding and file read failures are actionable errors", async () => {
  const invalid = await load(new File([new Uint8Array([0xff, 0xfe, 0x41])], "utf16.csv"));
  assert.equal(invalid.type, "error");
  assert.match(invalid.message, /UTF-8/);
  const unreadable = await load({ size: 10, slice() { throw new Error("File is no longer readable"); } });
  assert.match(unreadable.message, /no longer readable/);
});

test("quoted records spanning file chunks retain their full contents", async () => {
  const note = "x".repeat(1024 * 1024 + 10) + '\n"quoted"';
  const source = new File(['name,note\nAlice,"' + note.replaceAll('"', '""') + '"'], "large.csv");
  assert.equal((await load(source, ",")).type, "loaded");
  await globalThis.onmessage({ data: { type: "query", id: 3, query: base } });
  assert.equal(messages.at(-1).page.rows[0].cells[1], note);
});

test("UTF-8 characters split across file chunks remain intact", async () => {
  const note = "x".repeat(1024 * 1024 - "name,note\nAlice,".length - 1) + "€🙂中文";
  assert.equal((await load(new File(["name,note\nAlice," + note], "unicode.csv"), ",")).type, "loaded");
  await globalThis.onmessage({ data: { type: "query", id: 4, query: base } });
  assert.equal(messages.at(-1).page.rows[0].cells[1] === note, true);
});
