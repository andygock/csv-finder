import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "./App.module.css";
import useSettings from "./hooks/useSettings";
import useDataset from "./hooks/useDataset";
import PasteBox from "./PasteBox";
import SettingsDialog from "./SettingsDialog";
import { copyDelimiter } from "./data.ts";
import ResultsTable from "./ResultsTable";
import { searchShortcut } from "./searchShortcut.ts";
import type { Delimiter, SortConfig } from "./data.ts";

function App() {
  const [settings, setSettings] = useSettings();
  const [filter, setFilter] = useState("");
  const [phrase, setPhrase] = useState(false);
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [sort, setSort] = useState<SortConfig | null>(null);
  const [sortMode, setSortMode] = useState<"text" | "numeric">("text");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [delimiter, setDelimiter] = useState<Delimiter>("");
  const [delimiterWithCopy, setDelimiterWithCopy] = useState<"," | "\t">("\t");
  const [simplifyNumbers, setSimplifyNumbers] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const query = useMemo(() => ({ filter, phrase, skipEmpty, headers: settings.headers, sort, page: pageIndex, pageSize }),
    [filter, phrase, skipEmpty, settings.headers, sort, pageIndex, pageSize]);
  const dataset = useDataset(query);
  const { page } = dataset;
  const stale = dataset.searching || (page !== null && JSON.stringify(page.query) !== JSON.stringify(query));

  // Preserve browser/OS shortcuts, editable controls, composition and modal keys.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dataset.loaded) return;
      const target = event.target;
      const editable = target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input, textarea, select, button, a"));
      const action = searchShortcut(event, editable, target === inputRef.current, !!dialogRef.current?.open);
      if (action === "clear") {
        setFilter("");
        setPageIndex(0);
      } else if (action !== null) {
        event.preventDefault();
        setFilter(value => value + action);
        setPageIndex(0);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dataset.loaded]);

  const resetView = () => {
    setFilter("");
    setSort(null);
    setPageIndex(0);
    setFileError("");
  };
  const load = (source: File | string) => {
    resetView();
    return dataset.load(source, delimiter);
  };
  const loadFile = (file?: File) => {
    if (!file) return;
    if (!/\.(csv|tsv)$/i.test(file.name)) {
      setFileError("Choose a CSV or TSV file.");
      return;
    }
    void load(file);
  };
  const copy = useCallback(async (value: string, row = false) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(row ? "Row copied." : "Cell copied.");
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
  }, []);
  const handleSort = useCallback((key: number) => {
    setSort(current => ({ key, mode: sortMode, direction: current?.key === key && current.direction === "ascending" ? "descending" : "ascending" }));
    setPageIndex(0);
  }, [sortMode]);
  const pages = page ? Math.max(1, Math.ceil(page.matched / page.pageSize)) : 1;

  return (
    <main className={`${styles.drop} ${isDragging ? styles.dragging : ""}`}
      onDrop={event => { event.preventDefault(); setIsDragging(false); loadFile(event.dataTransfer.files[0]); }}
      onDragOver={event => { event.preventDefault(); if (event.dataTransfer.types.includes("Files")) setIsDragging(true); }}
      onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }}>
      <div className={styles.toolbar}>
        <button onClick={() => dialogRef.current?.showModal()}>Settings</button>
        {(dataset.loaded || dataset.loading) && <button onClick={() => { dataset.clear(); resetView(); }}>Clear</button>}
      </div>
      <header className={styles.header}><h1>CSV Finder</h1><p>Load and search CSV or TSV data for people in a hurry.</p></header>
      <div className={styles.controls}>
        <label>Import delimiter <select value={delimiter} onChange={event => {
          const value = event.target.value;
          if (value === "" || value === "," || value === "\t" || value === ";" || value === "|") setDelimiter(value);
        }}>
          <option value="">Auto-detect</option><option value=",">Comma</option><option value={"\t"}>Tab</option><option value=";">Semicolon</option><option value="|">Pipe</option>
        </select></label>
        <label>Open file <input type="file" accept=".csv,.tsv" onChange={event => { loadFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </div>
      <p>{isDragging ? "Release to load the file." : "Drag and drop a CSV or TSV file here, or choose a file above."}</p>
      {(fileError || dataset.error) && <p role="alert" className={styles.notice}>{fileError || dataset.error}</p>}
      {dataset.loading && <div role="status"><p>Loading… {dataset.progress.toLocaleString("en-AU")} records parsed.</p><button onClick={dataset.clear}>Cancel import</button></div>}
      {dataset.warning && <p role="status" className={styles.notice}>{dataset.warning}</p>}
      {!dataset.loaded && <PasteBox onSubmit={load} disabled={dataset.loading} />}
      {dataset.loaded && <>
        <label className={styles.search}>Filter <input ref={inputRef} type="search" value={filter} maxLength={2000}
          onChange={event => { setFilter(event.target.value); setPageIndex(0); }} placeholder="Search all columns" /></label>
        <div className={styles.controls}>
          <label><input type="checkbox" checked={settings.headers} onChange={() => { setSettings(current => ({ ...current, headers: !current.headers })); setPageIndex(0); setSort(null); }} />First record is header</label>
          <label><input type="checkbox" checked={phrase} onChange={event => { setPhrase(event.target.checked); setPageIndex(0); }} />Match phrase</label>
          <label><input type="checkbox" checked={skipEmpty} onChange={event => { setSkipEmpty(event.target.checked); setPageIndex(0); }} />Hide empty records</label>
          <label>Sort as <select value={sortMode} onChange={event => {
            const mode = event.target.value === "numeric" ? "numeric" : "text";
            setSortMode(mode); setSort(current => current ? { ...current, mode } : null); setPageIndex(0);
          }}><option value="text">Text</option><option value="numeric">Numbers</option></select></label>
          {sort && <button onClick={() => { setSort(null); setPageIndex(0); }}>Original order</button>}
          <label>Copy row as <select value={delimiterWithCopy} onChange={event => setDelimiterWithCopy(copyDelimiter(event.target.value))}>
            <option value={"\t"}>Tab</option><option value=",">Comma</option>
          </select></label>
          <label><input type="checkbox" checked={simplifyNumbers} onChange={event => setSimplifyNumbers(event.target.checked)} />Copy unformatted numbers</label>
        </div>
        <p role="status">{stale || !page ? "Updating results…" : `${page.loaded.toLocaleString("en-AU")} loaded records · ${page.matched.toLocaleString("en-AU")} matches`}</p>
        {page && <>
          <nav className={styles.controls} aria-label="Result pages">
            <button disabled={stale || page.page === 0} onClick={() => setPageIndex(0)}>First</button>
            <button disabled={stale || page.page === 0} onClick={() => setPageIndex(page.page - 1)}>Previous</button>
            <span>Page {page.page + 1} of {pages}</span>
            <button disabled={stale || page.page + 1 >= pages} onClick={() => setPageIndex(page.page + 1)}>Next</button>
            <button disabled={stale || page.page + 1 >= pages} onClick={() => setPageIndex(pages - 1)}>Last</button>
            <label>Rows per page <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPageIndex(0); }}>
              <option value={25}>25</option><option value={100}>100</option><option value={250}>250</option>
            </select></label>
            {page.pageSize < pageSize && <span>Limited to {page.pageSize} rows for this wide file.</span>}
          </nav>
          {!page.matched ? <p>No matching records. Try a different filter or show empty records.</p> : <>
            <p className={styles.rowInfo}>Source record numbers stay unchanged when searching or sorting. Select a cell to copy its full value; select its record number to copy the row. Values over 500 characters are previewed.</p>
            <div className={styles.tableScroll} aria-busy={stale}>
              <ResultsTable page={page} delimiter={delimiterWithCopy} simplifyNumbers={simplifyNumbers} onCopy={copy} onSort={handleSort} />
            </div>
          </>}
        </>}
      </>}
      <p className={styles.privacy}>All loading and processing happen within your browser. No file data is sent to a server.</p>
      <footer className={styles.footer}><a href="https://github.com/andygock/csv-finder">GitHub</a></footer>
      <SettingsDialog dialogRef={dialogRef} settings={settings} setSettings={setSettings} />
      <ToastContainer autoClose={1500} limit={3} pauseOnFocusLoss={false} position="bottom-center" />
    </main>
  );
}

export default App;
