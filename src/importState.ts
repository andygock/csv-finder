import { MAX_FILE_BYTES } from "./shared.ts";
import type { Delimiter } from "./shared.ts";
import type { ImportInfo } from "./protocol.ts";

export type Source = {
  value: File;
  delimiter: Delimiter;
  name: string;
  bytes: number;
  pasted: boolean;
};
type Common = { previousFile: Source | null; error: string };
export type ImportState = Common &
  (
    | { phase: "idle"; source: Source | null; info: null; warning: string }
    | { phase: "loading"; source: Source; info: null; warning: string }
    | { phase: "preview" | "ready"; source: Source; info: ImportInfo; warning: string }
  );
export type ImportAction =
  | { type: "start"; source: Source }
  | { type: "loaded"; info: ImportInfo; warning: string }
  | { type: "error"; message: string }
  | { type: "validationError"; message: string }
  | { type: "confirm" | "cancel" | "clear" | "preview" };

export const initialImportState: ImportState = {
  phase: "idle",
  source: null,
  previousFile: null,
  info: null,
  warning: "",
  error: "",
};

export function prepareSource(value: File | string, delimiter: Delimiter): Source {
  // Encode a paste once. Retry and worker transfer reuse the immutable File,
  // while the editable text remains available until the user accepts the preview.
  if (typeof value === "string" && value.length > MAX_FILE_BYTES)
    throw new Error("This import exceeds the 256 MiB limit. Split it into smaller parts.");
  const file = typeof value === "string" ? new File([value], "Pasted data") : value;
  if (!file.size) throw new Error("The input is empty.");
  if (file.size > MAX_FILE_BYTES)
    throw new Error("This import exceeds the 256 MiB limit. Split it into smaller parts.");
  return {
    value: file,
    delimiter,
    name: file.name,
    bytes: file.size,
    pasted: typeof value === "string",
  };
}

export function importReducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case "start":
      return {
        ...state,
        phase: "loading",
        source: action.source,
        info: null,
        warning: "",
        error: "",
      };
    case "loaded":
      return state.phase === "loading"
        ? { ...state, phase: "preview", info: action.info, warning: action.warning }
        : state;
    case "confirm":
      // Keep only an accepted file for recovery, not another parsed dataset or paste.
      return state.phase === "preview"
        ? {
            ...state,
            phase: "ready",
            previousFile: state.source.pasted ? state.previousFile : state.source,
          }
        : state;
    case "preview":
      return state.phase === "ready" ? { ...state, phase: "preview" } : state;
    case "validationError":
      return { ...state, error: action.message };
    case "error":
      return { ...state, phase: "idle", info: null, warning: "", error: action.message };
    case "cancel":
      return { ...state, phase: "idle", info: null, warning: "", error: "" };
    case "clear":
      return initialImportState;
  }
}
