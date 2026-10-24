import { receive } from "./worker-client.mjs";
import { Worker } from "node:worker_threads";

// Production parser, validation and messaging run in a real Node worker. These
// timings include structured cloning, but exclude browser layout and clipboard.
const scenarios = [
  ["narrow", 100_000, 5],
  ["wide", 30_000, 100],
  ["random", 200_000, 5],
  ["cache-overflow", 500_000, 3],
  ["mixed", 350_000, 3],
  ["zero-run", 256, 2],
  ["duplicates", 100_000, 5],
  ["long-decimal", 50_000, 3],
  ["multiline", 100_000, 10],
  ["long-cell", 32, 2],
];
const base = {
  filter: "",
  phrase: false,
  headers: true,
  skipEmpty: true,
  sort: null,
  page: 0,
  pageSize: 100,
};
const round = (value) => +value.toFixed(2);
const results = [];
for (const [shape, count, columns] of scenarios) {
  globalThis.gc?.();
  let seed = 42;
  const csv = [
    Array.from({ length: columns }, (_, i) => `Column ${i}`).join(","),
    ...Array.from({ length: count }, (_, row) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return Array.from({ length: columns }, (_, column) => {
        if (column === 0) {
          if (shape === "random" || shape === "cache-overflow") return String(seed);
          if (shape === "mixed")
            return row % 5 === 0 ? "" : row % 7 === 0 ? `text-${seed}` : String(seed);
          if (shape === "zero-run") return "0." + "0".repeat(40_000 + (row % 11)) + "1";
          if (shape === "duplicates") return String(seed % 100);
          if (shape === "long-decimal") return `${seed}00000000000000000.000000000000000${row % 9}`;
          return String(count - row);
        }
        if (shape === "long-cell") return "x".repeat(1024 * 1024) + "needle";
        if (shape === "multiline" && column === 1) return '"hello\nworld"';
        return `value-${row % 100}-${column}`;
      }).join(",");
    }),
  ].join("\n");
  const file = new File([csv], "benchmark.csv");
  const worker = new Worker(new URL("./worker-harness.mjs", import.meta.url));
  try {
    await receive(worker, "__ready");
    const loaded = receive(worker, "loaded");
    let start = performance.now();
    worker.postMessage({ type: "load", source: file, delimiter: "," });
    await loaded;
    const importMs = performance.now() - start;
    let id = 0;
    const query = async (value) => {
      const requestId = ++id;
      const page = receive(worker, "page", requestId);
      const start = performance.now();
      worker.postMessage({ type: "query", id: requestId, query: value });
      return { page: (await page).page, ms: performance.now() - start };
    };
    await query(base);
    const filter = shape === "long-cell" ? "needle" : "value-9";
    const search = await query({ ...base, filter });
    const narrower = await query({
      ...base,
      filter: shape === "long-cell" ? "needle" : "value-99",
    });
    const sorted = { ...base, sort: { key: 0, direction: "ascending", mode: "numeric" } };
    const sort = await query(sorted);
    const next = await query({ ...sorted, page: 1 });
    let cancelMs = null;
    if (["random", "cache-overflow", "mixed", "zero-run"].includes(shape)) {
      const sortingId = ++id;
      const progress = receive(worker, "queryProgress", sortingId);
      worker.postMessage({
        type: "query",
        id: sortingId,
        query: { ...sorted, sort: { ...sorted.sort, direction: "descending" } },
      });
      await progress;
      const cancelId = ++id;
      const cancelled = receive(worker, "__cancelled", cancelId);
      start = performance.now();
      worker.postMessage({ type: "cancel", id: cancelId });
      await cancelled;
      cancelMs = performance.now() - start;
      await query(base);
    }
    const metrics = receive(worker, "__metrics");
    worker.postMessage({ type: "__metrics" });
    const memory = await metrics;
    results.push({
      shape,
      rows: count,
      columns,
      MiB: round(file.size / 1024 / 1024),
      import_ms: round(importMs),
      search_ms: round(search.ms),
      narrowed_ms: round(narrower.ms),
      numeric_sort_ms: round(sort.ms),
      next_page_ms: round(next.ms),
      page_KiB: round(Buffer.byteLength(JSON.stringify(next.page)) / 1024),
      cancel_ack_ms: cancelMs === null ? "—" : round(cancelMs),
      sampled_heap_MiB: round(memory.peakHeap / 1024 / 1024),
      sampled_arrays_MiB: round(memory.peakArrays / 1024 / 1024),
      max_tick_gap_ms: round(memory.maxGap),
    });
  } finally {
    await worker.terminate();
  }
}
console.table(results);
console.log(
  "Worker heap and typed-array values are sampled maxima, not certified peak memory. Tick gaps include import, GC and timer scheduling. Timings include Node worker transfers, but not browser rendering, input debounce or clipboard operations.",
);
