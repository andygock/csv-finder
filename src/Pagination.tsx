import { useState } from "react";
import { Button, Input, Select } from "./ui";
import type { Page } from "./shared.ts";
import styles from "./App.module.css";
const count = (value: number) => value.toLocaleString("en-AU");

export default function Pagination({
  page,
  requestedPageSize,
  shownCount,
  stale,
  onPage,
  onPageSize,
}: {
  page: Page;
  requestedPageSize: number;
  shownCount: number;
  stale: boolean;
  onPage: (value: number) => void;
  onPageSize: (value: number) => void;
}) {
  const [goTo, setGoTo] = useState("");
  const pages = Math.max(1, Math.ceil(page.matched / page.pageSize));
  return (
    <nav className={styles.pagination} aria-label="Result pages">
      <label>
        Rows{" "}
        <Select
          value={requestedPageSize}
          onChange={(event) => {
            onPageSize(Number(event.target.value));
          }}
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </Select>
      </label>
      {page.pageSize < requestedPageSize && (
        <span className={styles.muted}>
          {page.pageSize} per page for {shownCount} columns
        </span>
      )}
      <div className={styles.actions}>
        <Button
          disabled={stale || page.page === 0}
          onClick={() => onPage(0)}
          aria-label="First page"
        >
          «
        </Button>
        <Button
          disabled={stale || page.page === 0}
          onClick={() => onPage(page.page - 1)}
          aria-label="Previous page"
        >
          ‹
        </Button>
        <span>
          {count(page.page + 1)} / {count(pages)}
        </span>
        <Button
          disabled={stale || page.page + 1 >= pages}
          onClick={() => onPage(page.page + 1)}
          aria-label="Next page"
        >
          ›
        </Button>
        <Button
          disabled={stale || page.page + 1 >= pages}
          onClick={() => onPage(pages - 1)}
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
              onPage(number - 1);
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
  );
}
