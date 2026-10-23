import { useCallback, useEffect, useRef, useState } from "react";
import type { Delimiter, Page, Query } from "../data.ts";
import { MAX_FILE_BYTES } from "../data.ts";
import { DatasetSession } from "../datasetSession.ts";
import type { ImportInfo, WorkerRequest } from "../protocol.ts";

type Source = { value: File | string; delimiter: Delimiter; name: string; bytes: number };
export type Detail = {
  id: number;
  row: number;
  column: number | null;
  value: string | null;
  copyValue?: string;
  error: string;
};

export default function useDataset(query: Query) {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState({ rows: 0, fraction: 0 });
  const [operation, setOperation] = useState({ phase: "Searching", fraction: 0 });
  const [page, setPage] = useState<Page | null>(null);
  const [info, setInfo] = useState<ImportInfo | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const detailId = useRef(0);
  const previousFile = useRef<Source | null>(null);
  const previousQuery = useRef<Query | null>(null);
  // The inert session only captures stable setters. Worker identity rejects
  // replies queued before Clear/replacement; detail IDs reject closed viewers.
  const [session] = useState(
    () =>
      new DatasetSession(
        () => new Worker(new URL("../data.worker.ts", import.meta.url), { type: "module" }),
        (message) => {
          if (message.type === "error") {
            setError(message.message);
            setLoading(false);
            setLoaded(false);
            setSearching(false);
            setPage(null);
            setInfo(null);
            setDetail(null);
          } else if (message.type === "progress") setProgress(message);
          else if (message.type === "loaded") {
            setLoading(false);
            setInfo(message.info);
            setWarning(message.warning);
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
    setLoaded(false);
    setLoading(false);
    setSearching(false);
    setProgress({ rows: 0, fraction: 0 });
    setPage(null);
    setInfo(null);
    setError("");
    setWarning("");
    setDetail(null);
    previousQuery.current = null;
  }, [session]);
  const clear = useCallback(() => {
    reset();
    setSource(null);
    previousFile.current = null;
  }, [reset]);
  useEffect(() => () => session.stop(), [session]);

  const load = useCallback(
    (value: File | string, delimiter: Delimiter): Promise<boolean> => {
      // Validate before discarding the current view. Exact paste sizing also avoids
      // replacing a good dataset with a multibyte paste beyond the file limit.
      const bytes = typeof value === "string" ? new Blob([value]).size : value.size;
      if (!bytes || bytes > MAX_FILE_BYTES) {
        setError(
          !bytes
            ? "The input is empty."
            : "This import exceeds the 256 MiB limit. Split it into smaller parts.",
        );
        return Promise.resolve(false);
      }
      reset();
      setSource({
        value,
        delimiter,
        bytes,
        name: typeof value === "string" ? "Pasted data" : value.name,
      });
      setLoading(true);
      return session.load(value, delimiter);
    },
    [reset, session],
  );
  const confirm = useCallback(() => {
    if (!info || !source) return;
    // Keep only a File handle for recovery, not another parsed dataset or paste.
    if (typeof source.value !== "string") previousFile.current = source;
    setLoaded(true);
  }, [info, source]);
  const retry = (delimiter: Delimiter) =>
    source ? load(source.value, delimiter) : Promise.resolve(false);
  const recover = () =>
    previousFile.current
      ? load(previousFile.current.value, previousFile.current.delimiter)
      : Promise.resolve(false);
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
    if (!page) setLoaded(false);
  };
  const inspect = useCallback(
    (row: number, column: number | null, delimiter: "," | "\t", simplify: boolean) => {
      const id = ++detailId.current;
      setDetail({ id, row, column, value: null, error: "" });
      session.detail({
        type: "detail",
        id,
        row,
        column,
        delimiter,
        simplify,
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
    canRecover: !!previousFile.current && !loaded && !loading,
    cancelImport,
    cancelQuery,
    detail,
    inspect,
    closeDetail: () => setDetail(null),
  };
}
