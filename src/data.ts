import Papa from "papaparse";

export type Delimiter = "" | "," | "\t" | ";" | "|";
export type SortConfig = {
  key: number;
  direction: "ascending" | "descending";
  mode: "text" | "numeric";
};
export type Query = {
  filter: string;
  phrase: boolean;
  headers: boolean;
  skipEmpty: boolean;
  sort: SortConfig | null;
  page: number;
  pageSize: number;
  searchColumn?: number | null;
  visibleColumns?: number[];
};
export type Page = {
  rows: { id: number; cells: string[]; lengths: number[]; offsets: number[] }[];
  headings: string[];
  columnIds: number[];
  loaded: number;
  matched: number;
  page: number;
  pageSize: number;
  query: Query;
};

// Guardrails, not a promise that every device can hold this much data. Only the
// worker retains the dataset; the UI receives a bounded page of original cells.
export const MAX_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_CELLS = 5_000_000;
export const MAX_COLUMNS = 1_000;

export function searchTokens(value: string, phrase: boolean): string[] {
  const trimmed = value.trim().toLowerCase();
  return trimmed ? [...new Set(phrase ? [trimmed] : trimmed.split(/\s+/))] : [];
}

export function highlightPattern(value: string, phrase: boolean): RegExp | null {
  const tokens = searchTokens(value, phrase).sort((a, b) => b.length - a.length);
  return tokens.length
    ? new RegExp(
        `(${tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
        "gi",
      )
    : null;
}

// Recognise Australian-style decimal/grouping syntax before removing formatting.
// Work with strings so copying long identifiers or decimals never loses precision.
export function unformatNumber(value: string): string {
  const trimmed = value.trim();
  if (!/^[+-]?\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(trimmed)) return value;
  return trimmed.replace(/[$,]/g, "");
}

export function copyDelimiter(value: string): "," | "\t" {
  return value === "," ? "," : "\t";
}

export function serialiseRow(row: string[], delimiter: "," | "\t"): string {
  return Papa.unparse([row], { delimiter, quotes: true });
}

function numericValue(
  value: string,
): { negative: boolean; integer: string; fraction: string } | null {
  const normal = unformatNumber(value).trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normal)) return null;
  const [integer, fraction = ""] = normal.replace(/^[+-]/, "").split(".");
  const digits = integer.replace(/^0+/, "") || "0";
  return {
    negative: normal.startsWith("-") && (digits !== "0" || /[1-9]/.test(fraction)),
    integer: digits,
    fraction: fraction.replace(/0+$/, ""),
  };
}

function compareNumbers(
  a: NonNullable<ReturnType<typeof numericValue>>,
  b: NonNullable<ReturnType<typeof numericValue>>,
): number {
  // Compare decimal strings exactly, including integers beyond Number.MAX_SAFE_INTEGER.
  if (a.negative !== b.negative) return a.negative ? -1 : 1;
  const width = Math.max(a.fraction.length, b.fraction.length);
  const x = a.fraction.padEnd(width, "0");
  const y = b.fraction.padEnd(width, "0");
  const order =
    a.integer.length - b.integer.length ||
    (a.integer < b.integer ? -1 : a.integer > b.integer ? 1 : 0) ||
    (x < y ? -1 : x > y ? 1 : 0);
  return a.negative ? -order : order;
}

export function compareCells(left: string, right: string, sort: SortConfig): number {
  const a = left.trim();
  const b = right.trim();
  // Blanks always go last, including descending sorts and missing fields.
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  let comparison: number;
  if (sort.mode === "numeric") {
    const x = numericValue(a);
    const y = numericValue(b);
    // Mixed columns put valid numbers before text in either direction.
    if (x === null || y === null) {
      if (x !== null) return -1;
      if (y !== null) return 1;
      comparison = a < b ? -1 : a > b ? 1 : 0;
    } else comparison = compareNumbers(x, y);
  } else comparison = a < b ? -1 : a > b ? 1 : 0;
  return sort.direction === "ascending" ? comparison : -comparison;
}

export function parseProblem(errors: Papa.ParseError[], rowOffset: number): string | null {
  const error = errors.find((item) => item.code !== "UndetectableDelimiter");
  if (!error) return null;
  const location = typeof error.row === "number" ? ` at record ${rowOffset + error.row + 1}` : "";
  return `${error.message}${location}. Check quoting or choose a delimiter.`;
}

export function yieldToMessages(): Promise<void> {
  // MessageChannel yields without the minimum delay imposed on timers (notably
  // on Windows), while still giving incoming worker requests a chance to run.
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

export type QueryProgress = (phase: "Searching" | "Sorting", fraction: number) => void;
const PREVIEW_CHARACTERS = 240;
export const MAX_PAGE_CHARACTERS = 200_000;
const NUMERIC_CACHE_CHARACTERS = 32 * 1024 * 1024;

type Numeric = ReturnType<typeof numericValue>;

function unicodeFold(value: string): string | null {
  // Unicode lowercase can depend on surrounding letters (Greek sigma) or
  // expand characters (İ). Fold long Unicode cells as a whole to retain the
  // original search semantics; ASCII cells can safely be folded in chunks.
  return value.length > 32_768 && /[\u0080-\uffff]/.test(value) ? value.toLowerCase() : null;
}

/** Worker-owned engine. Caches have explicit bounds, and only completed work
 * is committed. Cancellation leaves the last successful page query reusable. */
export class DataEngine {
  private readonly data: string[][];
  private readonly blank: Uint8Array;
  private sortKey = "";
  private order = new Uint32Array();
  private matchKey = "";
  private matches = new Uint32Array();
  private previous: {
    sortKey: string;
    tokens: string[];
    skipEmpty: boolean;
    column: number | null;
  } | null = null;
  private numericColumn = -1;
  private numericKeys: Map<number, Numeric> = new Map();
  private previewKey = "";
  private previewPage: Page | null = null;
  readonly columns: number;

  constructor(data: string[][], blank?: Uint8Array) {
    this.data = data;
    this.columns = data.reduce((max, row) => Math.max(max, row.length), 0);
    this.blank = blank ?? Uint8Array.from(data, (row) => Number(row.every((cell) => !cell.trim())));
  }

  headings(headers: boolean): string[] {
    return Array.from({ length: this.columns }, (_, i) =>
      (headers ? this.data[0]?.[i] || `Column ${i + 1}` : `Column ${i + 1}`).slice(0, 100),
    );
  }

  detail(row: number, column: number | null, delimiter: "," | "\t", simplify: boolean): string {
    const cells = this.data[row];
    if (!cells || !Number.isInteger(row)) throw new Error("This record is no longer available.");
    if (column === null) return serialiseRow(cells, delimiter);
    if (!Number.isInteger(column) || column < 0 || column >= this.columns)
      throw new Error("Unknown column.");
    const value = cells[column] ?? "";
    return simplify ? unformatNumber(value) : value;
  }

  async query(
    query: Query,
    isCurrent = () => true,
    progress: QueryProgress = () => {},
  ): Promise<Page | null> {
    let deadline = performance.now() + 8;
    let lastProgress = 0;
    const checkpoint = async (phase: "Searching" | "Sorting", fraction: number) => {
      const now = performance.now();
      if (now - lastProgress > 100) {
        progress(phase, fraction);
        lastProgress = now;
      }
      await yieldToMessages();
      deadline = performance.now() + 8;
      return isCurrent();
    };
    if (!isCurrent()) return null;
    const sortKey = JSON.stringify([query.headers, query.sort]);
    let order = this.order;
    if (sortKey !== this.sortKey) {
      const start = query.headers && this.data.length ? 1 : 0;
      order = new Uint32Array(this.data.length - start);
      let longestSortCell = 0;
      for (let i = 0; i < order.length; i++) {
        order[i] = i + start;
        if (query.sort)
          longestSortCell = Math.max(
            longestSortCell,
            this.data[i + start][query.sort.key]?.length ?? 0,
          );
        if (
          i % 2048 === 0 &&
          performance.now() > deadline &&
          !(await checkpoint(query.sort ? "Sorting" : "Searching", 0))
        )
          return null;
      }
      if (query.sort) {
        const sort = query.sort;
        const checkInterval = longestSortCell > 32_768 ? 1 : 128;
        const keys =
          this.numericColumn === sort.key ? this.numericKeys : new Map<number, Numeric>();
        if (sort.mode === "numeric" && this.numericColumn !== sort.key) {
          let remaining = NUMERIC_CACHE_CHARACTERS;
          for (let i = 0; i < order.length; i++) {
            const id = order[i];
            const value = this.data[id][sort.key] ?? "";
            // Bound both string storage and per-key object overhead. Values
            // outside the cache retain the exact comparator fallback.
            const cost = value.length * 2 + 128;
            if (cost <= remaining) {
              keys.set(id, numericValue(value));
              remaining -= cost;
            }
            if (
              i % checkInterval === 0 &&
              performance.now() > deadline &&
              !(await checkpoint("Sorting", 0))
            )
              return null;
          }
        }
        const compare = (a: number, b: number) => {
          if (sort.mode !== "numeric" || !keys.has(a) || !keys.has(b))
            return (
              compareCells(this.data[a][sort.key] ?? "", this.data[b][sort.key] ?? "", sort) ||
              a - b
            );
          const x = keys.get(a)!;
          const y = keys.get(b)!;
          if (x !== null && y !== null)
            return (sort.direction === "ascending" ? 1 : -1) * compareNumbers(x, y) || a - b;
          return (
            compareCells(this.data[a][sort.key] ?? "", this.data[b][sort.key] ?? "", sort) || a - b
          );
        };
        // Preserve the linear fast path for already ordered exports. The
        // comparator includes source IDs, so reversing never reverses ties.
        let ascending = true,
          descending = true;
        for (let i = 1; i < order.length && (ascending || descending); i++) {
          const comparison = compare(order[i - 1], order[i]);
          if (comparison > 0) ascending = false;
          if (comparison < 0) descending = false;
          if (
            i % checkInterval === 0 &&
            performance.now() > deadline &&
            !(await checkpoint("Sorting", 0))
          )
            return null;
        }
        if (!ascending && descending) {
          for (let i = 0; i < Math.floor(order.length / 2); i++) {
            const other = order.length - 1 - i;
            [order[i], order[other]] = [order[other], order[i]];
            if (i % 2048 === 0 && performance.now() > deadline && !(await checkpoint("Sorting", 0)))
              return null;
          }
          ascending = true;
        }
        // Bottom-up merge sort yields within merges, not just between runs.
        // The stable source-ID tie break preserves original order for equal cells.
        let scratch = new Uint32Array(ascending ? 0 : order.length);
        const passes = Math.max(1, Math.ceil(Math.log2(order.length)));
        let pass = 0;
        for (let width = ascending ? order.length : 1; width < order.length; width *= 2) {
          for (let lo = 0; lo < order.length; lo += width * 2) {
            const mid = Math.min(lo + width, order.length);
            const end = Math.min(lo + width * 2, order.length);
            let a = lo,
              b = mid;
            for (let out = lo; out < end; out++) {
              scratch[out] =
                a < mid && (b >= end || compare(order[a], order[b]) <= 0) ? order[a++] : order[b++];
              if (
                out % checkInterval === 0 &&
                performance.now() > deadline &&
                !(await checkpoint("Sorting", (pass + out / order.length) / passes))
              )
                return null;
            }
          }
          [order, scratch] = [scratch, order];
          pass++;
        }
        if (sort.mode === "numeric") {
          this.numericColumn = sort.key;
          this.numericKeys = keys;
        } else {
          this.numericColumn = -1;
          this.numericKeys = new Map();
        }
      }
    }
    const tokens = searchTokens(query.filter, query.phrase);
    const overlap = Math.max(...tokens.map((token) => token.length), 1);
    const column = query.searchColumn ?? null;
    const matchKey = JSON.stringify([sortKey, tokens, query.skipEmpty, column]);
    let matches = this.matches;
    if (matchKey !== this.matchKey) {
      // Reuse a result only if every old predicate is implied by the new one.
      // Backspacing, changing columns, or showing blanks forces a full scan.
      const previous = this.previous;
      const narrowing =
        previous &&
        previous.sortKey === sortKey &&
        previous.column === column &&
        (!previous.skipEmpty || query.skipEmpty) &&
        previous.tokens.every((old) => tokens.some((token) => token.includes(old)));
      const candidates = narrowing ? this.matches : order;
      const buffer = new Uint32Array(candidates.length);
      let count = 0;
      let characters = 0;
      for (let i = 0; i < candidates.length; i++) {
        if (
          i % 128 === 0 &&
          performance.now() > deadline &&
          !(await checkpoint("Searching", i / candidates.length))
        )
          return null;
        const id = candidates[i];
        if (query.skipEmpty && this.blank[id]) continue;
        if (!tokens.length) {
          buffer[count++] = id;
          continue;
        }
        const row = this.data[id];
        const found = tokens.length > 1 ? new Uint8Array(tokens.length) : null;
        let remaining = tokens.length;
        const first = column === null ? 0 : column;
        const end = column === null ? row.length : Math.min(row.length, column + 1);
        for (let c = first; c < end && remaining; c++) {
          const value = row[c];
          const folded = unicodeFold(value);
          // Chunk large cells with overlap so a token can span a boundary.
          // ASCII lowercase allocations stay bounded; Unicode uses the full
          // contextual fold above, then the same cancellable substring scan.
          for (
            let offset = 0;
            offset < (folded?.length ?? value.length) && remaining;
            offset += 32_768
          ) {
            const normal =
              folded !== null
                ? folded.slice(offset, offset + 32_768 + overlap)
                : (value.length <= 32_768
                    ? value
                    : value.slice(offset, offset + 32_768 + overlap)
                  ).toLowerCase();
            if (found) {
              for (let t = 0; t < tokens.length; t++)
                if (!found[t] && normal.includes(tokens[t])) {
                  found[t] = 1;
                  remaining--;
                }
            } else if (normal.includes(tokens[0])) remaining = 0;
            characters += normal.length;
            if (characters >= 32_768) {
              characters = 0;
              if (
                performance.now() > deadline &&
                !(await checkpoint("Searching", i / candidates.length))
              )
                return null;
            }
          }
        }
        if (!remaining) buffer[count++] = id;
        if (
          i % 128 === 0 &&
          performance.now() > deadline &&
          !(await checkpoint("Searching", i / candidates.length))
        )
          return null;
      }
      matches = buffer.slice(0, count);
    }
    if (!isCurrent()) return null;
    const columnIds = query.visibleColumns
      ? [...new Set(query.visibleColumns)].filter(
          (id) => Number.isInteger(id) && id >= 0 && id < this.columns,
        )
      : Array.from({ length: this.columns }, (_, i) => i);
    const pageSize = Math.max(
      1,
      Math.min(query.pageSize, Math.floor(2000 / Math.max(1, columnIds.length))),
    );
    const page = Math.max(
      0,
      Math.min(query.page, Math.max(0, Math.ceil(matches.length / pageSize) - 1)),
    );
    const previewKey = JSON.stringify([matchKey, page, pageSize, columnIds]);
    // Repeating an equivalent query need not locate long-cell snippets again.
    // Cache just one bounded page, never the requested full detail values.
    if (previewKey === this.previewKey && this.previewPage) return { ...this.previewPage, query };
    const previewSize = Math.min(
      PREVIEW_CHARACTERS,
      Math.floor(MAX_PAGE_CHARACTERS / Math.max(1, pageSize * columnIds.length)),
    );
    const headings = this.headings(query.headers);
    const rows: Page["rows"] = [];
    for (const id of matches.slice(page * pageSize, (page + 1) * pageSize)) {
      const cells: string[] = [],
        lengths: number[] = [],
        offsets: number[] = [];
      for (const c of columnIds) {
        const value = this.data[id][c] ?? "";
        let offset = 0;
        // Find a bounded context around a hit without sending the full cell.
        if (tokens.length && (column === null || column === c)) {
          const folded = unicodeFold(value);
          for (let at = 0; at < (folded?.length ?? value.length); at += 32_768) {
            const raw = value.slice(at, at + 32_768 + overlap);
            const normal =
              folded !== null ? folded.slice(at, at + 32_768 + overlap) : raw.toLowerCase();
            const hits = tokens.map((token) => normal.indexOf(token)).filter((hit) => hit >= 0);
            if (hits.length) {
              let hit = at + Math.min(...hits);
              if (folded !== null ? folded.length !== value.length : normal.length !== raw.length) {
                // Map a folded offset back to source characters for the viewer.
                // Work in blocks, then binary-search one block, rather than
                // allocating a per-character index for a megabyte-sized value.
                let consumed = 0;
                for (let start = 0; start < value.length; start += 4096) {
                  const block = value.slice(start, start + 4096);
                  const size = block.toLowerCase().length;
                  if (consumed + size >= hit) {
                    let lo = 0,
                      hi = block.length;
                    while (lo < hi) {
                      const mid = Math.floor((lo + hi) / 2);
                      if (block.slice(0, mid).toLowerCase().length < hit - consumed) lo = mid + 1;
                      else hi = mid;
                    }
                    hit = start + lo;
                    break;
                  }
                  consumed += size;
                  if (performance.now() > deadline && !(await checkpoint("Searching", 1)))
                    return null;
                }
              }
              offset = Math.max(0, hit - 24);
              break;
            }
            if (performance.now() > deadline && !(await checkpoint("Searching", 1))) return null;
          }
        }
        cells.push(value.slice(offset, offset + previewSize));
        lengths.push(value.length);
        offsets.push(offset);
        if (performance.now() > deadline && !(await checkpoint("Searching", 1))) return null;
      }
      rows.push({ id, cells, lengths, offsets });
    }
    if (!isCurrent()) return null;
    this.order = order;
    this.sortKey = sortKey;
    this.matches = matches;
    this.matchKey = matchKey;
    this.previous = { sortKey, tokens, skipEmpty: query.skipEmpty, column };
    const result = {
      rows,
      headings: columnIds.map((id) => headings[id]),
      columnIds,
      loaded: Math.max(0, this.data.length - (query.headers ? 1 : 0)),
      matched: matches.length,
      page,
      pageSize,
      query,
    };
    this.previewKey = previewKey;
    this.previewPage = result;
    return result;
  }
}
