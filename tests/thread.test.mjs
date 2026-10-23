import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { receive } from "../scripts/worker-client.mjs";
const base = {
  filter: "",
  phrase: false,
  headers: true,
  skipEmpty: true,
  sort: null,
  page: 0,
  pageSize: 100,
};

test("real worker cancels a sort, rejects stale pages and answers the next search", async () => {
  const worker = new Worker(new URL("../scripts/worker-harness.mjs", import.meta.url));
  try {
    await receive(worker, "__ready");
    let seed = 42;
    const values = Array.from({ length: 100000 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return String(seed);
    });
    const imported = receive(worker, "loaded");
    worker.postMessage({
      type: "load",
      source: new File(["number\n" + values.join("\n")], "numbers.csv"),
      delimiter: ",",
    });
    assert.equal((await imported).info.columns, 1);
    const pages = [];
    worker.on("message", (message) => {
      if (message.type === "page") pages.push(message.id);
    });
    const sorting = receive(worker, "queryProgress", 1);
    worker.postMessage({
      type: "query",
      id: 1,
      query: { ...base, sort: { key: 0, mode: "numeric", direction: "ascending" } },
    });
    assert.equal((await sorting).phase, "Sorting");
    const cancelled = receive(worker, "__cancelled", 2);
    worker.postMessage({ type: "cancel", id: 2 });
    await cancelled;
    const current = receive(worker, "page", 3);
    worker.postMessage({ type: "query", id: 3, query: { ...base, filter: values[99999] } });
    assert.ok((await current).page.rows.some((row) => row.id === 100000));
    assert.deepEqual(pages, [3]);
  } finally {
    await worker.terminate();
  }
});

test("real worker details preserve originals, format copies and keep errors recoverable", async () => {
  const worker = new Worker(new URL("../scripts/worker-harness.mjs", import.meta.url));
  try {
    await receive(worker, "__ready");
    const imported = receive(worker, "loaded");
    worker.postMessage({
      type: "load",
      source: 'number,note\n" $1,234.00 ",hello',
      delimiter: ",",
    });
    await imported;
    const detail = receive(worker, "detail", 1);
    worker.postMessage({
      type: "detail",
      id: 1,
      row: 1,
      column: 0,
      delimiter: ",",
      simplify: true,
    });
    const response = await detail;
    assert.equal(response.value, " $1,234.00 ");
    assert.equal(response.copyValue, "1234.00");
    const invalid = receive(worker, "detail", 2);
    worker.postMessage({
      type: "detail",
      id: 2,
      row: 99,
      column: 0,
      delimiter: ",",
      simplify: true,
    });
    assert.match((await invalid).error, /no longer available/);
    const current = receive(worker, "page", 3);
    worker.postMessage({ type: "query", id: 3, query: base });
    assert.equal((await current).page.matched, 1);
  } finally {
    await worker.terminate();
  }
});
