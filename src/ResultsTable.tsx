import { memo, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import { highlightPattern } from "./shared.ts";
import type { Page } from "./shared.ts";
import styles from "./App.module.css";

interface Props {
  page: Page;
  onInspect: (row: number, column: number | null, offset?: number) => void;
  onSort: (column: number) => void;
}

/** One tab stop for the table; arrows move amongst headings, record actions and
 * cells. Keep native table semantics for screen readers instead of a partial
 * ARIA grid implementation. Preview strings and highlights are both bounded. */
const ResultsTable = memo(function ResultsTable({ page, onInspect, onSort }: Props) {
  const table = useRef<HTMLTableElement>(null);
  const pattern = useMemo(
    () => highlightPattern(page.query.filter, page.query.phrase),
    [page.query.filter, page.query.phrase],
  );
  const focus = useRef<[number, number]>([0, 1]);
  const navigate = (event: KeyboardEvent<HTMLTableElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-row]");
    if (!button || event.altKey || event.metaKey || event.ctrlKey) return;
    let row = Number(button.dataset.row),
      column = Number(button.dataset.column);
    if (event.key === "ArrowDown") row++;
    else if (event.key === "ArrowUp") row--;
    else if (event.key === "ArrowRight") column++;
    else if (event.key === "ArrowLeft") column--;
    else if (event.key === "Home") column = row === 0 ? 1 : 0;
    else if (event.key === "End") column = page.columnIds.length;
    else return;
    event.preventDefault();
    row = Math.max(0, Math.min(page.rows.length, row));
    column = Math.max(row === 0 ? 1 : 0, Math.min(page.columnIds.length, column));
    table.current
      ?.querySelector<HTMLButtonElement>(`button[data-row="${row}"][data-column="${column}"]`)
      ?.focus();
  };
  const cellProps = (row: number, column: number) => ({
    "data-row": row,
    "data-column": column,
    tabIndex: focus.current[0] === row && focus.current[1] === column ? 0 : -1,
    onFocus: () => {
      table.current
        ?.querySelectorAll<HTMLButtonElement>('button[tabindex="0"]')
        .forEach((button) => {
          button.tabIndex = -1;
        });
      const button = table.current?.querySelector<HTMLButtonElement>(
        `button[data-row="${row}"][data-column="${column}"]`,
      );
      if (button) button.tabIndex = 0;
      focus.current = [row, column];
    },
  });
  // A page or visibility change can remove the previously focused coordinate.
  if (focus.current[0] > page.rows.length || focus.current[1] > page.columnIds.length)
    focus.current = [0, 1];
  const highlight = (value: string) => {
    if (!pattern) return value || "\u00a0";
    const parts = value.split(pattern);
    // Cap marks independently of text length (e.g. a one-character query).
    return (
      <>
        {parts.slice(0, 17).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}
        {parts.slice(17).join("")}
      </>
    );
  };
  return (
    <table ref={table} className={styles.table} onKeyDown={navigate}>
      <caption className={styles.srOnly}>
        CSV results. Use arrow keys to move between cells. Enter opens the full value and copy
        action.
      </caption>
      <thead>
        <tr>
          <th scope="col" className={styles.record}>
            Record
          </th>
          {page.headings.map((heading, index) => {
            const column = page.columnIds[index];
            const direction = page.query.sort?.key === column ? page.query.sort.direction : "none";
            return (
              <th key={column} scope="col" aria-sort={direction}>
                <button
                  {...cellProps(0, index + 1)}
                  className={styles.headingButton}
                  onClick={() => onSort(column)}
                  title={`Sort ${heading}`}
                >
                  {heading}
                  {direction === "ascending" ? " ↑" : direction === "descending" ? " ↓" : ""}
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {page.rows.map((row, rowIndex) => (
          <tr key={row.id}>
            <th scope="row" className={styles.record}>
              <button
                {...cellProps(rowIndex + 1, 0)}
                className={styles.cellButton}
                aria-label={`View and copy source record ${row.id + 1}`}
                onClick={() => onInspect(row.id, null)}
              >
                {row.id + 1}
              </button>
            </th>
            {row.cells.map((cell, index) => (
              <td key={page.columnIds[index]}>
                <button
                  {...cellProps(rowIndex + 1, index + 1)}
                  className={styles.cellButton}
                  title={`View full value · record ${row.id + 1}, column ${page.columnIds[index] + 1} · ${row.lengths[index].toLocaleString("en-AU")} characters`}
                  aria-label={
                    cell
                      ? undefined
                      : `Empty cell, record ${row.id + 1}, column ${page.columnIds[index] + 1}`
                  }
                  onClick={() => onInspect(row.id, page.columnIds[index], row.offsets[index])}
                >
                  {row.offsets[index] > 0 && "…"}
                  {highlight(cell)}
                  {row.offsets[index] + cell.length < row.lengths[index] && "…"}
                </button>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
});
export default ResultsTable;
