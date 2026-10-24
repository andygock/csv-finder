import { useCallback, useEffect, useRef, useState, useReducer } from "react";
import type { Delimiter, Page, Query } from "../shared.ts";
import { importReducer, initialImportState, prepareSource } from "../importState.ts";
import type { Source } from "../importState.ts";
import { DatasetSession } from "../datasetSession.ts";
import type { WorkerRequest } from "../protocol.ts";

export type Detail = {
  id: number;
  row: number;
  column: number | null;
  value: string | null;
  copyValue?: string;
  spreadsheet: boolean;
  error: string;
};

export default function useDataset(query: Query) {
  const [state, dispatch] = useReducer(importReducer, initialImportState);
  const { info, source, error, warning, previousFile } = state;
  const loaded = state.phase === "ready";
  const loading = state.phase === "loading";
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState({ rows: 0, fraction: 0 });
  const [operation, setOperation] = useState({ phase: "Searching", fraction: 0 });
  const [page, setPage] = useState<Page | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const detailId = useRef(0);
  const previousQuery = useRef<Query | null>(null);
  // The inert session only captures stable setters. Worker identity rejects
  // replies queued before Clear/replacement; detail IDs reject closed viewers.
  const [session] = useState(
    () =>
      new DatasetSession(
        () => new Worker(new URL("../data.worker.ts", import.meta.url), { type: "module" }),
        (message) => {
          if (message.type === "error") {
            dispatch({ type: "error", message: message.message });
            setSearching(false);
            setPage(null);
            setDetail(null);
          } else if (message.type === "progress") setProgress(message);
          else if (message.type === "loaded") {
            dispatch({ type: "loaded", info: message.info, warning: message.warning });
          } else if (message.type === "queryProgress") setOperation(message);
          else if (message.type === "detail") {
            setDetail((current) =>
              current?.id === message.id
                ? {
                    ...current,
                    value: message.value,
                    copyValue: message.copyValue,
                    error: message.error ?? "",
                  }
                : current,
            );
          } else {
            setPage(message.page);
            setSearching(false);
          }
        },
      ),
  );

  const reset = useCallback(() => {
    session.stop();
    dispatch({ type: "cancel" });
    setSearching(false);
    setProgress({ rows: 0, fraction: 0 });
    setPage(null);
    setDetail(null);
    previousQuery.current = null;
  }, [session]);
  const clear = useCallback(() => {
    reset();
    dispatch({ type: "clear" });
  }, [reset]);
  useEffect(() => () => session.stop(), [session]);

  const start = useCallback(
    (next: Source) => {
      reset();
      dispatch({ type: "start", source: next });
      return session.load(next.value, next.delimiter);
    },
    [reset, session],
  );
  const load = useCallback(
    (value: File | string, delimiter: Delimiter): Promise<boolean> => {
      try {
        // Validate before discarding the current view. Exact paste sizing also avoids
        // replacing a good dataset with a multibyte paste beyond the file limit.
        return start(prepareSource(value, delimiter));
      } catch (error) {
        dispatch({
          type: "validationError",
          message: error instanceof Error ? error.message : "Could not prepare input.",
        });
        return Promise.resolve(false);
      }
    },
    [start],
  );
  const confirm = useCallback(() => dispatch({ type: "confirm" }), []);
  const retry = (delimiter: Delimiter) =>
    source ? start({ ...source, delimiter }) : Promise.resolve(false);
  const recover = () => (previousFile ? start(previousFile) : Promise.resolve(false));
  const cancelImport = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    if (!loaded) return;
    const id = session.invalidateQuery();
    const previous = previousQuery.current;
    const typing = previous !== null && previous.filter !== query.filter;
    const sorting =
      query.sort &&
      (JSON.stringify(previous?.sort) !== JSON.stringify(query.sort) ||
        previous?.headers !== query.headers);
    previousQuery.current = query;
    if (page && JSON.stringify(page.query) === JSON.stringify(query)) {
      setSearching(false);
      return;
    }
    setSearching(true);
    setOperation({ phase: sorting ? "Sorting" : "Searching", fraction: 0 });
    const timer = window.setTimeout(() => session.query(id, query), typing ? 120 : 0);
    return () => window.clearTimeout(timer);
    // page is deliberately excluded: receiving a page must not issue a query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, query, session]);

  const cancelQuery = () => {
    session.invalidateQuery();
    setSearching(false);
    if (!page) dispatch({ type: "preview" });
  };
  const inspect = useCallback(
    (
      row: number,
      column: number | null,
      delimiter: "," | "\t",
      simplify: boolean,
      spreadsheet = false,
    ) => {
      const id = ++detailId.current;
      setDetail({ id, row, column, value: null, error: "", spreadsheet });
      session.detail({
        type: "detail",
        id,
        row,
        column,
        delimiter,
        simplify,
        spreadsheet,
      } satisfies WorkerRequest);
    },
    [session],
  );
  return {
    load,
    clear,
    loaded,
    loading,
    searching,
    progress,
    operation,
    page,
    error,
    warning,
    info,
    source: source ? { name: source.name, bytes: source.bytes } : null,
    confirm,
    retry,
    recover,
    importDelimiter: source?.delimiter ?? "",
    canRecover: !!previousFile && !loaded && !loading,
    cancelImport,
    cancelQuery,
    detail,
    inspect,
    closeDetail: () => setDetail(null),
  };
}
