import test from "node:test";
import assert from "node:assert/strict";
import { readSettings, writeSettings } from "../src/settingsStorage.ts";
import { searchShortcut } from "../src/searchShortcut.ts";

test("settings reject invalid types and survive unavailable or full storage", () => {
  for (const value of [null, "broken", "null", '"false"', '{"headers":"false"}', '{"headers":0}']) {
    assert.deepEqual(
      readSettings(() => ({ getItem: () => value })),
      { headers: true },
    );
  }
  assert.deepEqual(
    readSettings(() => ({ getItem: () => '{"headers":false}' })),
    { headers: false },
  );
  const unavailable = () => {
    throw new Error("Storage blocked");
  };
  assert.deepEqual(readSettings(unavailable), { headers: true });
  assert.doesNotThrow(() => writeSettings({ headers: false }, unavailable));
  assert.doesNotThrow(() =>
    writeSettings({ headers: false }, () => ({
      setItem() {
        throw new Error("Quota exceeded");
      },
    })),
  );
});

test("search shortcuts preserve modifier keys, controls, composition and dialogs", () => {
  const key = {
    key: "a",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    defaultPrevented: false,
  };
  assert.equal(searchShortcut(key, false, false, false), "a");
  for (const modifier of ["ctrlKey", "metaKey", "altKey", "isComposing", "defaultPrevented"]) {
    assert.equal(searchShortcut({ ...key, [modifier]: true }, false, false, false), null);
  }
  assert.equal(searchShortcut(key, true, false, false), null);
  assert.equal(searchShortcut(key, false, false, true), null);
  assert.equal(searchShortcut({ ...key, key: "Escape" }, true, true, false), "clear");
  assert.equal(searchShortcut({ ...key, key: "Escape" }, true, false, false), null);
  assert.equal(searchShortcut({ ...key, key: "Escape" }, true, true, true), null);
});
