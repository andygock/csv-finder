import type { Delimiter, Page, Query } from "./data.ts";

export type WorkerRequest =
  | { type: "load"; source: File | string; delimiter: Delimiter }
  | { type: "query"; id: number; query: Query };
export type WorkerResponse =
  | { type: "progress"; rows: number }
  | { type: "loaded"; rows: number; warning: string }
  | { type: "error"; message: string }
  | { type: "page"; id: number; page: Page };
