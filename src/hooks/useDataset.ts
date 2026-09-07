import { useCallback, useEffect, useState } from "react";
import type { Delimiter, Page, Query } from "../data.ts";
import { MAX_FILE_BYTES } from "../data.ts";
import { DatasetSession } from "../datasetSession.ts";

export default function useDataset(query: Query) {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  // The session is inert until load() and only captures stable state setters.
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
          } else if (message.type === "progress") setProgress(message.rows);
          else if (message.type === "loaded") {
            setLoading(false);
            setLoaded(true);
            setWarning(message.warning);
          } else {
            setPage(message.page);
            setSearching(false);
          }
        },
      ),
  );

  const clear = useCallback(() => {
    session.stop();
    setLoaded(false);
    setLoading(false);
    setSearching(false);
    setProgress(0);
    setPage(null);
    setError("");
    setWarning("");
  }, [session]);

  useEffect(() => () => session.stop(), [session]);

  const load = useCallback(
    (source: File | string, delimiter: Delimiter): Promise<boolean> => {
      // Validate before discarding an existing dataset. Text gets an exact UTF-8
      // size check in the worker; avoid copying obviously oversized pastes here.
      if ((typeof source === "string" ? source.length : source.size) > MAX_FILE_BYTES) {
        setError("This import exceeds the 256 MiB limit. Split it into smaller parts.");
        return Promise.resolve(false);
      }
      clear();
      setLoading(true);
      return session.load(source, delimiter);
    },
    [clear, session],
  );

  useEffect(() => {
    if (!loaded) return;
    const id = session.invalidateQuery();
    setSearching(true);
    // Coalesce rapid keystrokes; obsolete scans yield and abandon their results.
    const timer = window.setTimeout(() => session.query(id, query), 120);
    return () => window.clearTimeout(timer);
  }, [loaded, query, session]);

  return { load, clear, loaded, loading, searching, progress, page, error, warning };
}
