import { memo, useMemo, useState } from "react";
import { Button, Check, Input, Popover } from "./ui";
import { columnOptions } from "./columnOptions.ts";
import styles from "./App.module.css";

const PAGE_SIZE = 100;
const ColumnPicker = memo(function ColumnPicker({
  headings,
  shown,
  onChange,
}: {
  headings: string[];
  shown: number[];
  onChange: (columns: number[] | undefined) => void;
}) {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const matches = useMemo(() => columnOptions(headings, filter), [headings, filter]);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const selected = useMemo(() => new Set(shown), [shown]);
  return (
    <Popover title={`Columns · ${shown.length}`}>
      <Input
        aria-label="Find a column"
        placeholder="Find column by name or number…"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value);
          setPage(0);
        }}
      />
      <Button onClick={() => onChange(undefined)}>Show all columns</Button>
      <div className={styles.columnList}>
        {matches.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(({ heading, id }) => (
          <Check
            key={id}
            checked={selected.has(id)}
            disabled={shown.length === 1 && selected.has(id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...shown, id].sort((a, b) => a - b)
                  : shown.filter((value) => value !== id),
              )
            }
          >
            {id + 1}. {heading}
          </Check>
        ))}
      </div>
      {!matches.length && <p className={styles.muted}>No matching columns.</p>}
      {pages > 1 && (
        <div className={styles.bar}>
          <Button disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous columns
          </Button>
          <span>
            {current + 1} / {pages}
          </span>
          <Button disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>
            Next columns
          </Button>
        </div>
      )}
    </Popover>
  );
});
export default ColumnPicker;
