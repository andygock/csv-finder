# CSV Finder

Load, search and copy CSV or TSV data entirely within your browser. File contents are never uploaded.

## Usage

1. Drop a `.csv` or `.tsv` file, choose **Open file**, or paste spreadsheet data. Files must use UTF-8 encoding (a UTF-8 BOM is supported).
2. Leave **Import delimiter** on auto-detect, or choose comma, tab, semicolon or pipe before loading. This setting applies to the next import.
3. Set **First record is header** as appropriate. Without headers, columns receive generated names and remain sortable.
4. Search across all columns. Space-separated tokens must all match, but may match different cells. **Match phrase** searches for one contiguous substring within a cell; it does not require whole-cell equality. Searches are case-insensitive and treat punctuation literally.
5. Select a column heading to sort ascending/descending. **Sort as** chooses text or numeric ordering; **Original order** restores source order. Numeric sorting supports signed decimals, dollar signs and comma thousands separators without rounding long numbers. Numbers precede nonnumeric text, and blank/missing cells always sort last.
6. Select a cell to copy it, or a source record number to copy the entire row as CSV or TSV. Both row formats quote and escape embedded delimiters, quotes and newlines. **Copy unformatted numbers** affects individual numeric cells only; ordinary text and row copies retain their original values.
7. Use **First / Previous / Next / Last** to navigate results. **Hide empty records** immediately hides or restores records whose cells are all empty or whitespace. The header is always the first source record, even when it is blank.

Record numbers refer to parsed source records, including the header and hidden blank records. They are not physical line numbers: a quoted multiline cell belongs to one record. Loaded counts include blank records; match counts reflect the current view settings. A trailing line break may produce an empty final record, hidden by default.

Values longer than 500 characters are previewed in the table; copying retains the full value. Cell and heading actions work with keyboard focus and Enter/Space. Ctrl+Enter (Command+Enter on Mac) submits pasted data. Typing outside controls starts a search, and Escape clears the filter. Browser shortcuts and modal dialogs retain their normal keyboard behaviour.

## Imports and recovery

- Progress reports parsed records. **Cancel import** or **Clear** terminates the worker and releases its dataset.
- Starting a new import replaces the previous dataset. Pending work from a previous import cannot overwrite the replacement or undo Clear.
- Failed or cancelled pasted imports retain their input for correction and retry.
- Single-column data loads with a delimiter warning instead of being rejected. Malformed quoting and read/encoding failures report an error. Unequal row widths are accepted with a warning and displayed with blank missing cells.
- The header preference is saved locally when storage is available; blocked/full storage does not stop the application.

## Large files and limits

Parsing, filtering and sorting run in a persistent Web Worker. Files are decoded incrementally in 1 MiB byte chunks so UTF-8 characters and quoted records survive chunk boundaries. The full dataset stays in the worker; only the current page is sent to React. Pasted text necessarily starts in browser UI memory.

The table renders at most 2,000 data cells per page, automatically reducing the requested page size for wide files. It is memoised independently of the search input. Search requests are coalesced for 120 ms; scans yield to newer requests and discard obsolete results. Only the current sort order and matching row IDs are cached. Pagination reuses those IDs instead of re-filtering or re-sorting. Lowercase cell values are reused within each row scan rather than retaining a second permanent copy of the entire dataset.

Guardrails reject imports over 256 MiB, 5 million cells, 1,000 columns, or an unfinished record over 8,388,608 characters. These are protective limits, not certified capacities. The worker still holds all parsed strings and row arrays in memory, and full cell values on the current page are also held in the UI for copying. Very long fields and low-memory devices can exhaust memory below these limits. Split larger files before importing. Numeric sorts still take time, but run off the UI thread; Clear can terminate them.

## Development

Use Node.js 22.18 or newer and pnpm. No additional testing dependencies are required.

```sh
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm lint
pnpm benchmark
```

Respect the configured pnpm minimum release age when installing or updating packages.

The regression suite covers copying, search semantics, numeric sorting, blank/ragged records, encoding and chunk boundaries, failed imports, worker cancellation, stale responses, settings storage and keyboard shortcut rules. It uses Node's test runner and does not launch a browser.

### Structure

- `src/parseInput.ts`: incremental UTF-8 decoding, dialect detection and CSV record parsing.
- `src/data.worker.ts`: import validation, progress and worker message handling.
- `src/data.ts`: search/sort engine and shared copying/highlighting functions.
- `src/datasetSession.ts`: worker lifetime, cancellation and stale-response protection.
- `src/hooks/useDataset.ts`: React state and query scheduling.
- `src/ResultsTable.tsx`: memoised, paginated table content and copy actions.

### Benchmark scope

`pnpm benchmark` generates narrow, wide and multiline files, then measures the production decoder/parser and query engine. It includes an approximation of the previous lexical search/sort loop for comparison. Numeric and lexical sorting have different semantics; the new processing loop is not guaranteed to run faster in every case. The main improvements are bounded rendering, keeping processing off the UI thread, and cached pagination.

Example local run on Windows with Node 22.23.1 (7 September 2026):

| Input | File size | Parse | Search | Cached next page | Data cells rendered |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100,000 rows × 5 columns | 4.72 MiB | 105 ms | 31 ms | 0.05 ms | 500 |
| 30,000 rows × 100 columns | 33.61 MiB | 362 ms | 141 ms | 0.05 ms | 2,000 |
| 100,000 multiline rows × 10 columns | 10.21 MiB | 194 ms | 54 ms | 0.04 ms | 1,000 |

These are individual core-engine timings, not browser responsiveness measurements. They exclude the UI debounce, worker message transfers, DOM rendering and clipboard operations. The script reports a heap-growth sample, not peak memory; garbage collection can even make that sample negative. Browser peak memory, maximum supported file sizes and end-to-end latency have not been certified by this benchmark.
