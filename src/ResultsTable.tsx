import { memo, useMemo } from "react";
import { highlightPattern, serialiseRow, unformatNumber } from "./data.ts";
import type { Page } from "./data.ts";
import styles from "./App.module.css";

interface ResultsTableProps {
  page: Page;
  delimiter: "," | "\t";
  simplifyNumbers: boolean;
  onCopy: (value: string, row?: boolean) => Promise<void>;
  onSort: (column: number) => void;
}

// Filtering input can change immediately without rebuilding even the bounded
// table. Only a new result page or a table-specific option invalidates this memo.
const ResultsTable = memo(function ResultsTable({
  page,
  delimiter,
  simplifyNumbers,
  onCopy,
  onSort,
}: ResultsTableProps) {
  const pattern = useMemo(
    () => highlightPattern(page.query.filter, page.query.phrase),
    [page.query.filter, page.query.phrase],
  );
  const highlight = (cell: string) => {
    // Copy the original value, but bound previews and highlighted DOM nodes.
    const preview = cell.slice(0, 500);
    return (
      <>
        {pattern
          ? preview.split(pattern).map((part, i) =>
              i % 2 ? (
                <mark key={i} className={styles.highlight}>
                  {part}
                </mark>
              ) : (
                part
              ),
            )
          : preview || "\u00a0"}
        {cell.length > 500 && "…"}
      </>
    );
  };

  return (
    <table className={styles.table}>
      <caption className={styles.srOnly}>CSV search results</caption>
      <thead>
        <tr>
          <th scope="col">Record</th>
          {page.headings.map((heading, column) => {
            const direction = page.query.sort?.key === column ? page.query.sort.direction : "none";
            return (
              <th key={column} scope="col" aria-sort={direction}>
                <button className={styles.headingButton} onClick={() => onSort(column)}>
                  {heading.slice(0, 500)}
                  {direction === "ascending" ? " ▲" : direction === "descending" ? " ▼" : ""}
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {page.rows.map((row) => (
          <tr key={row.id}>
            <th scope="row">
              <button
                className={styles.cellButton}
                aria-label={`Copy source record ${row.id + 1}`}
                onClick={() => void onCopy(serialiseRow(row.cells, delimiter), true)}
              >
                {row.id + 1}
              </button>
            </th>
            {page.headings.map((_, column) => {
              const cell = row.cells[column] ?? "";
              return (
                <td key={column}>
                  <button
                    className={styles.cellButton}
                    title={`Copy record ${row.id + 1}, column ${column + 1}`}
                    aria-label={
                      cell
                        ? undefined
                        : `Copy empty cell, record ${row.id + 1}, column ${column + 1}`
                    }
                    onClick={() => void onCopy(simplifyNumbers ? unformatNumber(cell) : cell)}
                  >
                    {highlight(cell)}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
});

export default ResultsTable;
