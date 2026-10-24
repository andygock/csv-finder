import type { Delimiter, Page, Query } from "./shared.ts";

export type ImportInfo = {
  rows: number;
  columns: number;
  delimiter: string;
  headings: string[];
  preview: Page;
};
export type WorkerRequest =
  | { type: "load"; source: File | string; delimiter: Delimiter }
  | { type: "query"; id: number; query: Query }
  | { type: "cancel"; id: number }
  | {
      type: "detail";
      id: number;
      row: number;
      column: number | null;
      delimiter: "," | "\t";
      simplify: boolean;
      spreadsheet?: boolean;
    };
export type WorkerResponse =
  | { type: "progress"; rows: number; fraction: number }
  | { type: "loaded"; rows: number; warning: string; info: ImportInfo }
  | { type: "error"; message: string }
  | { type: "queryProgress"; id: number; phase: "Searching" | "Sorting"; fraction: number }
  | { type: "detail"; id: number; value: string; copyValue?: string; error?: string }
  | { type: "page"; id: number; page: Page };
