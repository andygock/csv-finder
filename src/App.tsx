import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./App.module.css";
import useSettings from "./hooks/useSettings";
import useDataset from "./hooks/useDataset";
import PasteBox from "./PasteBox";
import SettingsDialog from "./SettingsDialog";
import ResultsTable from "./ResultsTable";
import ImportPreview from "./ImportPreview";
import ValueDialog from "./ValueDialog";
import QueryControls from "./QueryControls";
import Pagination from "./Pagination";
import { searchShortcut } from "./searchShortcut.ts";
import { Button } from "./ui";
import type { Delimiter, Query, SortConfig } from "./shared.ts";

const count = (value: number) => value.toLocaleString("en-AU");
const dialectName = (value: string) =>
  ({ ",": "Comma", "\t": "Tab", ";": "Semicolon", "|": "Pipe" })[value] ?? value;

function App() {
  const [settings, setSettings] = useSettings();
  const [filter, setFilter] = useState("");
  const [phrase, setPhrase] = useState(false);
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [sort, setSort] = useState<SortConfig | null>(null);
  const [sortMode, setSortMode] = useState<"text" | "numeric">("text");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [searchColumn, setSearchColumn] = useState<number | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<number[] | undefined>();
  const [delimiter, setDelimiter] = useState<Delimiter>("");
  const [copyFormat, setCopyFormat] = useState<"," | "\t">("\t");
  const [simplifyNumbers, setSimplifyNumbers] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [detailOffset, setDetailOffset] = useState(0);
  const [spreadsheet, setSpreadsheet] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const query = useMemo(
    () => ({
      filter,
      phrase,
      skipEmpty,
      headers: settings.headers,
      sort,
      page: pageIndex,
      pageSize,
      searchColumn,
      visibleColumns,
    }),
    [
      filter,
      phrase,
      skipEmpty,
      settings.headers,
      sort,
      pageIndex,
      pageSize,
      searchColumn,
      visibleColumns,
    ],
  );
  const dataset = useDataset(query);
  const { page, load: loadDataset, inspect } = dataset;
  const stale =
    dataset.searching || (page !== null && JSON.stringify(page.query) !== JSON.stringify(query));
  const headings = useMemo(
    () =>
      dataset.info
        ? dataset.info.headings.map((heading, i) =>
            settings.headers ? heading : `Column ${i + 1}`,
          )
        : [],
    [dataset.info, settings.headers],
  );
  const shown = useMemo(
    () => visibleColumns ?? headings.map((_, i) => i),
    [visibleColumns, headings],
  );

  const setHeaders = useCallback(
    (headers: boolean) => {
      setSettings((current) => ({ ...current, headers }));
      setPageIndex(0);
      setSort(null);
    },
    [setSettings],
  );
  const resetView = useCallback(() => {
    setFilter("");
    setSort(null);
    setPageIndex(0);
    setSearchColumn(null);
    setVisibleColumns(undefined);
    setFileError("");
  }, []);
  const load = useCallback(
    async (source: File | string) => {
      setFileError("");
      return loadDataset(source, delimiter);
    },
    [delimiter, loadDataset],
  );
  useEffect(() => {
    if (dataset.info) resetView();
  }, [dataset.info, resetView]);
  const loadFile = useCallback(
    (file?: File) => {
      if (!file) return;
      if (!/\.(csv|tsv)$/i.test(file.name)) {
        setFileError("Choose a CSV or TSV file.");
        return;
      }
      void load(file);
    },
    [load],
  );
  const handleSort = useCallback(
    (key: number) => {
      setSort((current) => ({
        key,
        mode: sortMode,
        direction:
          current?.key === key && current.direction === "ascending" ? "descending" : "ascending",
      }));
      setPageIndex(0);
    },
    [sortMode],
  );
  const handleInspect = useCallback(
    (row: number, column: number | null, offset = 0) => {
      setDetailOffset(offset);
      inspect(row, column, copyFormat, simplifyNumbers, spreadsheet);
    },
    [inspect, copyFormat, simplifyNumbers, spreadsheet],
  );
  const updateQuery = useCallback((patch: Partial<Query>) => {
    if (patch.filter !== undefined) setFilter(patch.filter);
    if (patch.phrase !== undefined) setPhrase(patch.phrase);
    if (patch.skipEmpty !== undefined) setSkipEmpty(patch.skipEmpty);
    if ("searchColumn" in patch) setSearchColumn(patch.searchColumn ?? null);
    if ("visibleColumns" in patch) setVisibleColumns(patch.visibleColumns);
    setPageIndex(0);
  }, []);
  const updateSortMode = useCallback((mode: "text" | "numeric") => {
    setSortMode(mode);
    setSort((current) => (current ? { ...current, mode } : null));
    setPageIndex(0);
  }, []);
  const restoreQuery = (previous: Query) => {
    setFilter(previous.filter);
    setPhrase(previous.phrase);
    setSkipEmpty(previous.skipEmpty);
    setSettings((current) =>
      current.headers === previous.headers ? current : { ...current, headers: previous.headers },
    );
    setSort(previous.sort);
    if (previous.sort) setSortMode(previous.sort.mode);
    setPageIndex(previous.page);
    setPageSize(previous.pageSize);
    setSearchColumn(previous.searchColumn ?? null);
    setVisibleColumns(previous.visibleColumns);
  };

  useEffect(() => {
    if (dataset.loaded) inputRef.current?.focus();
  }, [dataset.loaded]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dataset.loaded) return;
      const target = event.target;
      const editable =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          !!target.closest("input, textarea, select, button, a, summary"));
      const action = searchShortcut(
        event,
        editable,
        target === inputRef.current,
        !!document.querySelector("dialog[open]"),
      );
      if (action === "clear") {
        setFilter("");
        setPageIndex(0);
      } else if (action !== null) {
        event.preventDefault();
        setFilter((value) => (value + action).slice(0, 2000));
        setPageIndex(0);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dataset.loaded]);
  useEffect(() => {
    let depth = 0;
    const isFile = (event: DragEvent) => event.dataTransfer?.types.includes("Files");
    const enter = (event: DragEvent) => {
      if (isFile(event)) {
        event.preventDefault();
        depth++;
        setDragging(true);
      }
    };
    const over = (event: DragEvent) => {
      if (isFile(event)) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }
    };
    const leave = (event: DragEvent) => {
      if (isFile(event)) {
        depth = Math.max(0, depth - 1);
        if (!depth) setDragging(false);
      }
    };
    const drop = (event: DragEvent) => {
      if (!isFile(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      if (event.dataTransfer?.files.length !== 1)
        setFileError("Drop one CSV or TSV file at a time.");
      else loadFile(event.dataTransfer.files[0]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [loadFile]);

  const preview = dataset.info?.preview;
  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <h1>CSV Finder</h1>
        <span className={styles.local}>Local only</span>
        <div className={styles.actions}>
          <Button onClick={() => fileInputRef.current?.click()}>Open file</Button>
          <input
            hidden
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv"
            onChange={(event) => {
              loadFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button onClick={() => setSettingsOpen(true)}>Settings</Button>
          {(dataset.source || paste) && (
            <Button
              onClick={() => {
                dataset.clear();
                resetView();
                setPaste("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </header>
      {(fileError || dataset.error) && (
        <p role="alert" className={styles.error}>
          {fileError || dataset.error}
        </p>
      )}
      {dataset.source && (
        <div className={styles.meta}>
          <strong title={dataset.source.name}>{dataset.source.name}</strong>
          <span>
            {(dataset.source.bytes / 1024 / 1024).toLocaleString("en-AU", {
              maximumFractionDigits: 2,
            })}{" "}
            MiB
          </span>
          {dataset.info && (
            <>
              <span>{count(dataset.info.columns)} columns</span>
              <span>{dialectName(dataset.info.delimiter)} separated</span>
            </>
          )}
        </div>
      )}
      {dataset.loading && (
        <div className={styles.progress} role="status">
          <span>
            {dataset.progress.fraction < 1 ? "Reading and parsing" : "Preparing preview"} ·{" "}
            {count(dataset.progress.rows)} records · {Math.round(dataset.progress.fraction * 100)}%
          </span>
          <progress aria-label="Import progress" max={1} value={dataset.progress.fraction} />
          <Button onClick={dataset.cancelImport}>Cancel import</Button>
        </div>
      )}
      {dataset.warning && (
        <p role="status" className={styles.warning}>
          {dataset.warning}
        </p>
      )}
      {!dataset.loaded && !dataset.loading && dataset.info && preview && (
        <ImportPreview
          info={dataset.info}
          delimiter={delimiter}
          importDelimiter={dataset.importDelimiter}
          headers={settings.headers}
          onHeaders={setHeaders}
          onDelimiter={setDelimiter}
          onReparse={() => void dataset.retry(delimiter)}
          onBack={dataset.cancelImport}
          onConfirm={() => {
            dataset.confirm();
            setPaste("");
          }}
        />
      )}
      {!dataset.loaded && !dataset.info && (
        <>
          <PasteBox text={paste} setText={setPaste} onSubmit={load} disabled={dataset.loading} />
          {!dataset.loading && (
            <div className={styles.bar}>
              {dataset.source && (
                <Button onClick={() => void dataset.retry(delimiter)}>Retry import</Button>
              )}
              {dataset.canRecover && (
                <Button onClick={() => void dataset.recover()}>Reopen previous file</Button>
              )}
            </div>
          )}
        </>
      )}
      {dataset.loaded && (
        <>
          <QueryControls
            query={query}
            headings={headings}
            shown={shown}
            searchRef={inputRef}
            sortMode={sortMode}
            copyFormat={copyFormat}
            simplifyNumbers={simplifyNumbers}
            spreadsheet={spreadsheet}
            onChange={updateQuery}
            onHeaders={setHeaders}
            onCopyFormat={setCopyFormat}
            onSimplifyNumbers={setSimplifyNumbers}
            onSpreadsheet={setSpreadsheet}
            onSortMode={updateSortMode}
          />
          <div className={styles.bar}>
            <span role="status">
              {stale
                ? `${dataset.operation.phase}… ${Math.round(dataset.operation.fraction * 100)}%`
                : page
                  ? `${count(page.matched)} matches / ${count(page.loaded)} records`
                  : "Preparing results…"}
            </span>
            {stale && (
              <Button
                onClick={() => {
                  dataset.cancelQuery();
                  if (page) restoreQuery(page.query);
                }}
              >
                Cancel
              </Button>
            )}
            {sort && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSort(null);
                  setPageIndex(0);
                }}
              >
                Original order
              </Button>
            )}
            {phrase && <span className={styles.badge}>Phrase</span>}
            <span className={styles.tableHint}>Arrows to navigate · Enter to view / copy</span>
          </div>
          {page && (
            <>
              <div className={styles.tableScroll} aria-busy={stale}>
                <ResultsTable page={page} onInspect={handleInspect} onSort={handleSort} />
                {!page.matched && (
                  <p className={styles.empty}>
                    No matching records. Change the filter or show empty records in Options.
                  </p>
                )}
              </div>
              <Pagination
                page={page}
                requestedPageSize={pageSize}
                shownCount={shown.length}
                stale={stale}
                onPage={setPageIndex}
                onPageSize={(size) => {
                  setPageSize(size);
                  setPageIndex(0);
                }}
              />
            </>
          )}
        </>
      )}
      <footer className={styles.footer}>
        <span>Files stay in your browser. No uploads.</span>
        <a href="https://github.com/andygock/csv-finder">GitHub</a>
      </footer>
      {dragging && <div className={styles.dropOverlay}>Drop one CSV or TSV file</div>}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        delimiter={delimiter}
        setDelimiter={setDelimiter}
        headers={settings.headers}
        setHeaders={setHeaders}
      />
      <ValueDialog
        detail={dataset.detail}
        headings={headings}
        offset={detailOffset}
        onClose={dataset.closeDetail}
      />
    </main>
  );
}
export default App;
