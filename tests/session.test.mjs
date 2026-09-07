import test from "node:test";
import assert from "node:assert/strict";
import { DatasetSession } from "../src/datasetSession.ts";

class FakeWorker {
  sent = [];
  terminated = false;
  postMessage(message) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data) {
    this.onmessage({ data });
  }
}

function setup() {
  const workers = [];
  const messages = [];
  const session = new DatasetSession(
    () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    (message) => messages.push(message),
  );
  return { workers, messages, session };
}

test("replacement cancels the pending import and ignores late results from its worker", async () => {
  const { workers, messages, session } = setup();
  const first = session.load("first", "");
  const second = session.load("second", "\t");
  assert.equal(await first, false);
  assert.equal(workers[0].terminated, true);
  workers[0].emit({ type: "loaded", rows: 1, warning: "old" });
  workers[0].emit({ type: "error", message: "old failure" });
  assert.deepEqual(messages, []);
  workers[1].emit({ type: "loaded", rows: 2, warning: "" });
  assert.equal(await second, true);
  assert.equal(messages.length, 1);
  session.stop();
});

test("Clear cancels imports and ignores queued progress and success messages", async () => {
  const { workers, messages, session } = setup();
  const pending = session.load("data", "");
  session.stop();
  assert.equal(await pending, false);
  workers[0].emit({ type: "progress", rows: 100 });
  workers[0].emit({ type: "loaded", rows: 100, warning: "" });
  assert.deepEqual(messages, []);
});

test("stale queries are neither sent nor displayed", async () => {
  const { workers, messages, session } = setup();
  const loaded = session.load("data", "");
  workers[0].emit({ type: "loaded", rows: 1, warning: "" });
  await loaded;
  const old = session.invalidateQuery();
  const latest = session.invalidateQuery();
  session.query(old, {});
  session.query(latest, {});
  assert.equal(workers[0].sent.length, 2);
  workers[0].emit({ type: "page", id: old, page: "obsolete" });
  workers[0].emit({ type: "page", id: latest, page: "current" });
  assert.deepEqual(
    messages.map((message) => message.type),
    ["loaded", "page"],
  );
  assert.equal(messages.at(-1).page, "current");
  session.stop();
});

test("worker failure resolves the import as unsuccessful and terminates the worker", async () => {
  const { workers, messages, session } = setup();
  const pending = session.load("bad data", "");
  workers[0].onerror();
  assert.equal(await pending, false);
  assert.equal(workers[0].terminated, true);
  assert.equal(messages[0].type, "error");
});

test("unavailable workers report a recoverable error", async () => {
  const messages = [];
  const session = new DatasetSession(
    () => {
      throw new Error("blocked");
    },
    (message) => messages.push(message),
  );
  assert.equal(await session.load("data", ""), false);
  assert.match(messages[0].message, /Could not start/);
});
