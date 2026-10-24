import styles from "./App.module.css";
import { Button } from "./ui";
import { ImportOptions } from "./SettingsDialog";
import type { Delimiter } from "./shared.ts";
import type { ImportInfo } from "./protocol.ts";

export default function ImportPreview({
  info,
  delimiter,
  importDelimiter,
  headers,
  onHeaders,
  onDelimiter,
  onReparse,
  onConfirm,
  onBack,
}: {
  info: ImportInfo;
  delimiter: Delimiter;
  importDelimiter: Delimiter;
  headers: boolean;
  onHeaders: (value: boolean) => void;
  onDelimiter: (value: Delimiter) => void;
  onReparse: () => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const preview = info.preview;
  return (
    <section className={styles.importPreview} aria-label="Import preview">
      <div className={styles.bar}>
        <strong>Import preview</strong>
        <span className={styles.muted}>First {preview.rows.length} records · up to 8 columns</span>
      </div>
      <div className={styles.previewScroll}>
        <table className={styles.table}>
          <tbody>
            {preview.rows.map((row, index) => (
              <tr
                key={row.id}
                className={headers && index === 0 ? styles.previewHeader : undefined}
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
          setDelimiter={onDelimiter}
          headers={headers}
          setHeaders={onHeaders}
        />
        <Button onClick={() => onReparse()}>Reparse</Button>
        <Button variant="primary" disabled={delimiter !== importDelimiter} onClick={onConfirm}>
          Use data
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        {delimiter !== importDelimiter && (
          <span className={styles.muted}>Reparse to apply the delimiter.</span>
        )}
      </div>
    </section>
  );
}
