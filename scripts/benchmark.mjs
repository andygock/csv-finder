import { DataEngine } from "../src/data.ts";
import { parseInput } from "../src/parseInput.ts";

// Run without a browser: this measures parsing/query work, not paint time or
// browser peak memory. Generate input before timing and compare the same queries.
const scenarios = [
  ["narrow", 10_000, 5], ["narrow", 100_000, 5],
  ["wide", 10_000, 100], ["wide", 30_000, 100],
  ["multiline", 10_000, 10], ["multiline", 100_000, 10],
];
const base = { filter: "", phrase: false, headers: true, skipEmpty: true, sort: null, page: 0, pageSize: 100 };
const measure = async fn => {
  const start = performance.now();
  const value = await fn();
  return { value, ms: +(performance.now() - start).toFixed(2) };
};
const results = [];
for (const [shape, count, columns] of scenarios) {
  globalThis.gc?.();
  const header = Array.from({ length: columns }, (_, i) => `Column ${i}`).join(",");
  let csv = header + "\n" + Array.from({ length: count }, (_, row) =>
    Array.from({ length: columns }, (_, col) => col === 0 ? String(count - row) : shape === "multiline" && col === 1 ? '"hello\nworld"' : `value-${row % 100}-${col}`).join(",")
  ).join("\n");
  const mib = +(Buffer.byteLength(csv) / 1024 / 1024).toFixed(2);
  const memoryBefore = process.memoryUsage().heapUsed;
  const file = new File([csv], "benchmark.csv");
  const parsed = await measure(async () => {
    const rows = [];
    await parseInput(file, ",", result => { for (const row of result.data) rows.push(row); });
    return rows;
  });
  csv = "";
  const engine = new DataEngine(parsed.value);
  const first = await measure(() => engine.query(base));
  const search = await measure(() => engine.query({ ...base, filter: "value-99" }));
  const sort = await measure(() => engine.query({ ...base, sort: { key: 0, direction: "ascending", mode: "numeric" } }));
  const cachedSearch = await measure(() => engine.query({ ...base, sort: { key: 0, direction: "ascending", mode: "numeric" }, filter: "value-99" }));
  const nextPage = await measure(() => engine.query({ ...base, sort: { key: 0, direction: "ascending", mode: "numeric" }, filter: "value-99", page: 1 }));
  const baseline = await measure(() => parsed.value.slice(1).filter(row => ["value-99"].every(token => row.some(cell => cell.toLowerCase().includes(token)))).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  results.push({ shape, rows: count, columns, MiB: mib, parse_ms: parsed.ms, first_page_ms: first.ms, search_ms: search.ms, numeric_sort_ms: sort.ms, cached_sort_search_ms: cachedSearch.ms, next_page_ms: nextPage.ms, old_lexical_search_sort_ms: baseline.ms, rendered_cells: first.value.rows.length * columns, heap_growth_MiB: +((process.memoryUsage().heapUsed - memoryBefore) / 1024 / 1024).toFixed(1) });
}
console.table(results);
console.log("Heap growth is an end-of-scenario sample, not peak memory; GC and input generation affect it. Numeric and lexical sorts have different semantics. Browser rendering and worker transfers are not measured.");
