import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./App.module.css";
import useSettings from "./hooks/useSettings";
import useDataset from "./hooks/useDataset";
import PasteBox from "./PasteBox";
import SettingsDialog, { ImportOptions } from "./SettingsDialog";
import ResultsTable from "./ResultsTable";
import { searchShortcut } from "./searchShortcut.ts";
import { Button, Check, Dialog, Input, Select, Popover } from "./ui";
import type { Delimiter, Query, SortConfig } from "./data.ts";

const count = (value: number) => value.toLocaleString("en-AU");
const dialectName = (value: string) =>
  ({ ",": "Comma", "\t": "Tab", ";": "Semicolon", "|": "Pipe" })[value] ?? value;
const VALUE_PAGE = 32_768;

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
  const [columnFilter, setColumnFilter] = useState("");
  const [delimiter, setDelimiter] = useState<Delimiter>("");
  const [copyFormat, setCopyFormat] = useState<"," | "\t">("\t");
  const [simplifyNumbers, setSimplifyNumbers] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [goTo, setGoTo] = useState("");
  const [notice, setNotice] = useState("");
  const [valuePage, setValuePage] = useState(0);
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
  const pages = page ? Math.max(1, Math.ceil(page.matched / page.pageSize)) : 1;

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
    setColumnFilter("");
    setGoTo("");
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
      setNotice("");
      setValuePage(Math.floor(offset / VALUE_PAGE));
      inspect(row, column, copyFormat, simplifyNumbers);
    },
    [inspect, copyFormat, simplifyNumbers],
  );
  const restoreQuery = (previous: Query) => {
    setFilter(previous.filter);
    setPhrase(previous.phrase);
    setSkipEmpty(previous.skipEmpty);
    setSettings((current) => ({ ...current, headers: previous.headers }));
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
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);
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
  const columnMatches = useMemo(
    () =>
      headings
        .map((heading, id) => ({ heading, id }))
        .filter((item) => item.heading.toLowerCase().includes(columnFilter.toLowerCase())),
    [headings, columnFilter],
  );
  const detail = dataset.detail;
  const detailPages = Math.max(1, Math.ceil((detail?.value?.length ?? 0) / VALUE_PAGE));
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
        <section className={styles.importPreview} aria-label="Import preview">
          <div className={styles.bar}>
            <strong>Import preview</strong>
            <span className={styles.muted}>
              First {preview.rows.length} records · up to 8 columns
            </span>
          </div>
          <div className={styles.previewScroll}>
            <table className={styles.table}>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={settings.headers && index === 0 ? styles.previewHeader : undefined}
                  >
                    <th scope="row">{row.id + 1}</th>
                    {row.cells.map((cell, column) => (
                      <td key={column}>
                        {cell || "\u00a0"}
                        {cell.length < row.lengths[column] && "…"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.bar}>
            <ImportOptions
              delimiter={delimiter}
              setDelimiter={setDelimiter}
              headers={settings.headers}
              setHeaders={setHeaders}
            />
            <Button onClick={() => void dataset.retry(delimiter)}>Reparse</Button>
            <Button
              variant="primary"
              disabled={delimiter !== dataset.importDelimiter}
              onClick={() => {
                dataset.confirm();
                setPaste("");
              }}
            >
              Use data
            </Button>
            <Button variant="ghost" onClick={dataset.cancelImport}>
              Back
            </Button>
            {delimiter !== dataset.importDelimiter && (
              <span className={styles.muted}>Reparse to apply the delimiter.</span>
            )}
          </div>
        </section>
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
          <div className={styles.searchBar}>
            <Input
              ref={inputRef}
              type="search"
              aria-label="Filter results"
              placeholder="Search records…"
              value={filter}
              maxLength={2000}
              onChange={(event) => {
                setFilter(event.target.value);
                setPageIndex(0);
              }}
            />
            <Select
              aria-label="Search column"
              value={searchColumn ?? "all"}
              onChange={(event) => {
                setSearchColumn(event.target.value === "all" ? null : Number(event.target.value));
                setPageIndex(0);
              }}
            >
              <option value="all">All columns</option>
              {headings.map((heading, id) => (
                <option key={id} value={id}>
                  {id + 1}. {heading}
                </option>
              ))}
            </Select>
            <Popover title={`Columns · ${shown.length}`}>
              <Input
                aria-label="Find a column"
                placeholder="Find column…"
                value={columnFilter}
                onChange={(event) => setColumnFilter(event.target.value)}
              />
              <Button
                onClick={() => {
                  setVisibleColumns(undefined);
                  setPageIndex(0);
                }}
              >
                Show all columns
              </Button>
              <div className={styles.columnList}>
                {columnMatches.slice(0, 100).map(({ heading, id }) => (
                  <Check
                    key={id}
                    checked={shown.includes(id)}
                    disabled={shown.length === 1 && shown[0] === id}
                    onChange={(event) => {
                      setVisibleColumns(
                        event.target.checked
                          ? [...shown, id].sort((a, b) => a - b)
                          : shown.filter((value) => value !== id),
                      );
                      setPageIndex(0);
                    }}
                  >
                    {id + 1}. {heading}
                  </Check>
                ))}
              </div>
              {columnMatches.length > 100 && (
                <p className={styles.muted}>
                  Search to narrow {count(columnMatches.length)} columns.
                </p>
              )}
            </Popover>
            <Popover title="Options">
              <Check
                checked={settings.headers}
                onChange={(event) => setHeaders(event.target.checked)}
              >
                First record is header
              </Check>
              <Check
                checked={phrase}
                onChange={(event) => {
                  setPhrase(event.target.checked);
                  setPageIndex(0);
                }}
              >
                Match phrase
              </Check>
              <Check
                checked={skipEmpty}
                onChange={(event) => {
                  setSkipEmpty(event.target.checked);
                  setPageIndex(0);
                }}
              >
                Hide empty records
              </Check>
              <label>
                Sort as{" "}
                <Select
                  value={sortMode}
                  onChange={(event) => {
                    const mode = event.target.value as "text" | "numeric";
                    setSortMode(mode);
                    setSort((current) => (current ? { ...current, mode } : null));
                    setPageIndex(0);
                  }}
                >
                  <option value="text">Text</option>
                  <option value="numeric">Numbers</option>
                </Select>
              </label>
              <label>
                Copy row as{" "}
                <Select
                  value={copyFormat}
                  onChange={(event) => setCopyFormat(event.target.value as "," | "\t")}
                >
                  <option value={"\t"}>TSV</option>
                  <option value=",">CSV</option>
                </Select>
              </label>
              <Check
                checked={simplifyNumbers}
                onChange={(event) => setSimplifyNumbers(event.target.checked)}
              >
                Copy unformatted numbers
              </Check>
            </Popover>
          </div>
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
              <nav className={styles.pagination} aria-label="Result pages">
                <label>
                  Rows{" "}
                  <Select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPageIndex(0);
                    }}
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </Select>
                </label>
                {page.pageSize < pageSize && (
                  <span className={styles.muted}>
                    {page.pageSize} per page for {shown.length} columns
                  </span>
                )}
                <div className={styles.actions}>
                  <Button
                    disabled={stale || page.page === 0}
                    onClick={() => setPageIndex(0)}
                    aria-label="First page"
                  >
                    «
                  </Button>
                  <Button
                    disabled={stale || page.page === 0}
                    onClick={() => setPageIndex(page.page - 1)}
                    aria-label="Previous page"
                  >
                    ‹
                  </Button>
                  <span>
                    {count(page.page + 1)} / {count(pages)}
                  </span>
                  <Button
                    disabled={stale || page.page + 1 >= pages}
                    onClick={() => setPageIndex(page.page + 1)}
                    aria-label="Next page"
                  >
                    ›
                  </Button>
                  <Button
                    disabled={stale || page.page + 1 >= pages}
                    onClick={() => setPageIndex(pages - 1)}
                    aria-label="Last page"
                  >
                    »
                  </Button>
                  <form
                    className={styles.goTo}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const number = Number(goTo);
                      if (Number.isInteger(number) && number >= 1 && number <= pages) {
                        setPageIndex(number - 1);
                        setGoTo("");
                      }
                    }}
                  >
                    <Input
                      aria-label="Go to page"
                      placeholder="Page"
                      inputMode="numeric"
                      type="number"
                      min={1}
                      max={pages}
                      value={goTo}
                      onChange={(event) => setGoTo(event.target.value)}
                    />
                    <Button type="submit" disabled={stale || !goTo}>
                      Go
                    </Button>
                  </form>
                </div>
              </nav>
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
      <Dialog
        open={!!detail}
        onClose={dataset.closeDetail}
        title={
          detail
            ? `Record ${detail.row + 1}${detail.column === null ? " · full row" : ` · ${headings[detail.column]}`}`
            : "Value"
        }
        wide
      >
        {detail?.error ? (
          <p role="alert">{detail.error}</p>
        ) : detail?.value === null ? (
          <p role="status">Reading full value…</p>
        ) : (
          <>
            <textarea
              className={styles.value}
              readOnly
              aria-label="Full value, current section"
              value={
                detail?.value?.slice(valuePage * VALUE_PAGE, (valuePage + 1) * VALUE_PAGE) ?? ""
              }
            />
            <div className={styles.bar}>
              <span className={styles.muted}>
                {count(detail?.value?.length ?? 0)} characters
                {detailPages > 1 ? ` · section ${valuePage + 1} / ${detailPages}` : ""}
              </span>
              {detailPages > 1 && (
                <>
                  <Button
                    disabled={valuePage === 0}
                    onClick={() => setValuePage((value) => value - 1)}
                  >
                    Previous section
                  </Button>
                  <Button
                    disabled={valuePage + 1 === detailPages}
                    onClick={() => setValuePage((value) => value + 1)}
                  >
                    Next section
                  </Button>
                </>
              )}
              <Button
                variant="primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(detail?.copyValue ?? detail?.value ?? "");
                    setNotice("Copied full value.");
                  } catch {
                    setNotice("Clipboard unavailable. Select text in the viewer to copy manually.");
                  }
                }}
              >
                {detail?.copyValue !== undefined
                  ? "Copy unformatted number"
                  : `Copy full ${detail?.column === null ? "row" : "value"}`}
              </Button>
            </div>
          </>
        )}
        <p role="status" className={styles.muted}>
          {notice}
        </p>
      </Dialog>
    </main>
  );
}
export default App;
