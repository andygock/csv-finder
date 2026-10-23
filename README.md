# CSV Finder

Open, search and copy CSV or TSV data entirely within your browser. File contents are never uploaded. The compact interface uses shadcn-style neutral controls, shared CSS variables and CSS modules. Geist and Geist Mono are bundled through `@fontsource`; no remote font service is used.

## Import and recovery

1. Drop one `.csv` or `.tsv` file, choose **Open file**, or paste spreadsheet data. Files must use UTF-8 (a UTF-8 BOM is supported).
2. Review the first five records and up to eight columns in **Import preview**. The source filename, size, detected delimiter and column count appear above it.
3. Choose whether the first record is a header. If the delimiter is incorrect, select comma, tab, semicolon or pipe and choose **Reparse**. Choose **Use data** when the preview is correct.

**Settings** also exposes the import delimiter and header preference. Delimiter changes apply to the next import/reparse. Both header controls consistently reset sorting and pagination. The header preference is saved locally; unavailable or full settings storage does not stop the app.

Import progress reports parsed records and the fraction of the source read. **Cancel import** stops the worker. Failed or cancelled pastes retain their input. **Retry import** reparses the retained source; after a failed replacement, **Reopen previous file** reloads the last accepted file from its retained File handle. Only one parsed dataset is held at a time. Recovery does not survive closing the page. **Clear** releases the source/recovery references, pasted input and worker.

Single-column data loads with a delimiter warning. Unequal row widths are accepted with a warning and missing cells appear blank. Malformed quoting, invalid UTF-8 and inconsistent record line endings report errors. Different line endings inside quoted fields are preserved. Dialect detection uses complete records and ignores blanks for detection only, preserving blank source records in the dataset. A final record separator does not create an extra phantom record.

## Search, sort and navigate

- Search across all columns, or choose a specific column. Space-separated tokens must all match, but may match different cells. **Match phrase** in Options searches for a contiguous substring within a cell. Search is case-insensitive and punctuation is literal.
- Choose **Columns** to find and hide columns; at least one remains visible. Column visibility does not change the search scope. Record numbers and column identities remain tied to the source.
- Select a heading to sort ascending/descending. **Sort as** in Options selects text or numeric ordering. Numeric sorting recognises signed decimal numbers, dollar signs and comma thousands separators without rounding long integers or decimals. Numbers precede nonnumeric text and blanks/missing values sort last in both directions. Equal values retain source order. **Original order** restores source order.
- **Hide empty records** in Options hides or restores whitespace-only records. The header is always the first source record, even when blank.
- Use the first/previous/next/last buttons or **Go to page**. Page size adapts to the visible column count to keep the table bounded.
- **Cancel** during searching or sorting retains the dataset and restores the last completed view. Cancelling before the first result returns to the import preview. Typing is coalesced for 120 ms; page navigation and explicit actions dispatch immediately.

Record numbers count parsed source records, including the header and hidden blanks. They are not physical line numbers: a quoted multiline cell belongs to one record. Match counts reflect current search and empty-record settings.

## Inspect and copy

Select a cell to open its original full value, or a record number to open the entire row serialised as CSV/TSV. Table previews show context around a match even when it occurs deep inside a large field. Long values are displayed in 32,768-character sections in the viewer, opening near the selected match. **Copy full value/row** copies the entire value, not just the visible section.

**Copy unformatted numbers** changes only the copied numeric cell; the viewer still displays the original text. Ordinary text and full-row copies retain their original values. Row serialisation runs in the worker and quotes/escapes embedded delimiters, quotes and newlines. Clipboard failures display a message and allow manual selection of the current section.

The table has one tab stop. Arrow keys move between headings, record actions and cells; Home/End move to the start/end of the row. Enter/Space activate the focused action. Ctrl+Enter (Command+Enter on Mac) previews pasted data. Typing outside controls starts a search, and Escape clears it. Dialogs retain focus and Escape behaviour; option popovers close on Escape or an outside click.

## Large files and limits

A persistent Web Worker owns the parsed strings and performs parsing, searching, sorting and row serialisation. Every import gets a fresh worker, and source identity plus query IDs reject stale messages. A single query drain loop coalesces requests without allowing multiple temporary scans to accumulate.

Files are decoded in 1 MiB byte chunks. An incremental boundary scanner preserves UTF-8/CRLF/quoted-record boundaries, checks record lengths, and supplies complete records to Papa Parse. Numeric sort keys have an estimated 32 MiB cache budget; row order and matching IDs use compact typed arrays, and blank flags are computed once during import.

Sorting uses a stable merge sort that yields during merges, with linear paths for already ordered inputs. Searches check elapsed time and character work, including within long cells. The target work slice is 8 ms, but individual string operations, allocation and garbage collection can exceed it. Query invalidation is sent immediately, before the replacement search debounce. A narrower search reuses previous matches only when its predicates imply the previous query; deleting text or changing scope correctly triggers a broader scan.

Only bounded previews cross the worker boundary for ordinary pages: at most 2,000 data cells and 200,000 data characters, plus headings limited to 100 characters each. Only the last preview page is cached. Cells have at most eight highlighted spans. Original values are fetched separately on demand, and only one requested detail is retained in the UI.

Guardrails reject imports above 256 MiB, 5 million cells, 1,000 columns or 8,388,608 raw characters per record, including completed records. These are protective limits, not certified capacities. Parsed strings, indexes, transient buffers and one requested full value still consume memory; low-memory devices can fail below these limits. Split larger files before importing. There is no IndexedDB, OPFS or disk-backed dataset storage.

## Development

Use Node.js 22.18 or newer and pnpm. Respect configured pnpm minimum release age rules when installing or updating packages.

```sh
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm lint
pnpm format:check
pnpm benchmark
```

Tests use Node's test runner, including an adapter that exercises the production handler in a real worker thread. Coverage includes chunk-boundary parsing, record limits, exact sorting, cancellable sorts/scans, scoped/narrowing queries, preview payload limits, on-demand copying, recovery sessions, stale replies, settings storage and shortcut rules. They do not launch a browser.

### Structure

- `src/parseInput.ts`: incremental UTF-8 decoding, record boundaries, dialect detection and parsing.
- `src/data.ts`: worker-owned query engine, bounded previews and shared value operations.
- `src/data.worker.ts` / `src/protocol.ts`: import validation, query scheduling, progress and detail requests.
- `src/datasetSession.ts`: worker lifetime and stale-response protection.
- `src/hooks/useDataset.ts`: import/recovery state, query dispatch and the current detail request.
- `src/ResultsTable.tsx`: memoised table and keyboard navigation.
- `src/ui.tsx` / `src/ui.module.css`: compact reusable controls, popovers and dialogs.
- `src/index.css`: semantic theme, spacing and font variables.

### Benchmark scope

`pnpm benchmark` covers narrow, wide, random, duplicate, long-decimal, multiline and megabyte-cell inputs. It runs the production parser/validator and query handler in a real Node worker, includes message transfers, and reports import/search/narrowing/sort/page timings, serialised page size and cancellation acknowledgement latency. It also samples worker heap and typed-array memory and event-loop tick gaps.

Sampled maxima are not certified peak memory. Tick gaps include import, garbage collection and timer scheduling. Node results do not certify browser rendering, clipboard behaviour, mobile performance or maximum file capacity. No browser smoke tests are run automatically.
