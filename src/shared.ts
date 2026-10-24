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
