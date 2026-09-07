import Papa from "papaparse";

export type Delimiter = "" | "," | "\t" | ";" | "|";
export type SortConfig = { key: number; direction: "ascending" | "descending"; mode: "text" | "numeric" };
export type Query = { filter: string; phrase: boolean; headers: boolean; skipEmpty: boolean; sort: SortConfig | null; page: number; pageSize: number };
export type Page = { rows: { id: number; cells: string[] }[]; headings: string[]; loaded: number; matched: number; page: number; pageSize: number; query: Query };

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
  return tokens.length ? new RegExp(`(${tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi") : null;
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

function numericValue(value: string): { negative: boolean; integer: string; fraction: string } | null {
  const normal = unformatNumber(value).trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normal)) return null;
  const [integer, fraction = ""] = normal.replace(/^[+-]/, "").split(".");
  const digits = integer.replace(/^0+/, "") || "0";
  return { negative: normal.startsWith("-") && (digits !== "0" || /[1-9]/.test(fraction)), integer: digits, fraction: fraction.replace(/0+$/, "") };
}

function compareNumbers(a: NonNullable<ReturnType<typeof numericValue>>, b: NonNullable<ReturnType<typeof numericValue>>): number {
  // Compare decimal strings exactly, including integers beyond Number.MAX_SAFE_INTEGER.
  if (a.negative !== b.negative) return a.negative ? -1 : 1;
  const width = Math.max(a.fraction.length, b.fraction.length);
  const x = a.fraction.padEnd(width, "0");
  const y = b.fraction.padEnd(width, "0");
  const order = a.integer.length - b.integer.length || (a.integer < b.integer ? -1 : a.integer > b.integer ? 1 : 0) || (x < y ? -1 : x > y ? 1 : 0);
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
  const error = errors.find(item => item.code !== "UndetectableDelimiter");
  if (!error) return null;
  const location = typeof error.row === "number" ? ` at record ${rowOffset + error.row + 1}` : "";
  return `${error.message}${location}. Check quoting or choose a delimiter.`;
}

function yieldToMessages(): Promise<void> {
  // MessageChannel yields without the minimum delay imposed on timers (notably
  // on Windows), while still giving incoming worker requests a chance to run.
  return new Promise(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/** Worker-owned search engine. Cache only the current sort and query, so changing
 * filters cannot accumulate copies of the dataset or an unbounded index cache. */
export class DataEngine {
  private readonly data: string[][];
  private sortKey = "";
  private order: number[] = [];
  private matchKey = "";
  private matches: number[] = [];
  readonly columns: number;

  constructor(data: string[][]) {
    this.data = data;
    this.columns = data.reduce((max, row) => Math.max(max, row.length), 0);
  }

  async query(query: Query, isCurrent = () => true): Promise<Page | null> {
    const sortKey = JSON.stringify([query.headers, query.sort]);
    if (sortKey !== this.sortKey) {
      const start = query.headers && this.data.length ? 1 : 0;
      const order = Array.from({ length: this.data.length - start }, (_, i) => i + start);
      if (query.sort) {
        const sort = query.sort;
        order.sort((a, b) => compareCells(this.data[a][sort.key] ?? "", this.data[b][sort.key] ?? "", sort) || a - b);
      }
      this.order = order;
      this.sortKey = sortKey;
      this.matchKey = "";
    }
    const tokens = searchTokens(query.filter, query.phrase);
    const matchKey = JSON.stringify([sortKey, tokens, query.skipEmpty]);
    if (matchKey !== this.matchKey) {
      const matches: number[] = [];
      // Snapshot the order: another request may update the cache while this scan yields.
      const order = this.order;
      for (let i = 0; i < order.length; i++) {
        const id = order[i];
        const row = this.data[id];
        if (!(query.skipEmpty && row.every(cell => !cell.trim()))) {
          // Lowercase once per cell per scan, rather than once per search token.
          // No permanent lowercase copy: large files already consume significant memory.
          const normal: string[] = [];
          if (tokens.every(token => row.some((cell, column) => (normal[column] ??= cell.toLowerCase()).includes(token)))) matches.push(id);
        }
        if (i % 8192 === 8191) {
          await yieldToMessages();
          if (!isCurrent()) return null;
        }
      }
      if (!isCurrent()) return null;
      this.matches = matches;
      this.matchKey = matchKey;
    }
    // Wide files get smaller pages to keep the number of rendered cells bounded.
    const pageSize = Math.max(1, Math.min(query.pageSize, Math.floor(2000 / Math.max(1, this.columns))));
    const page = Math.max(0, Math.min(query.page, Math.max(0, Math.ceil(this.matches.length / pageSize) - 1)));
    return {
      rows: this.matches.slice(page * pageSize, (page + 1) * pageSize).map(id => ({ id, cells: this.data[id] })),
      headings: Array.from({ length: this.columns }, (_, i) => query.headers ? this.data[0]?.[i] || `Column ${i + 1}` : `Column ${i + 1}`),
      loaded: Math.max(0, this.data.length - (query.headers ? 1 : 0)),
      matched: this.matches.length, page, pageSize, query,
    };
  }
}
