import { useEffect, useState } from "react";
import { Button, Dialog } from "./ui";
import type { Detail } from "./hooks/useDataset";
import styles from "./App.module.css";
const VALUE_PAGE = 32_768;
const count = (value: number) => value.toLocaleString("en-AU");

export default function ValueDialog({
  detail,
  headings,
  offset,
  onClose,
}: {
  detail: Detail | null;
  headings: string[];
  offset: number;
  onClose: () => void;
}) {
  const [notice, setNotice] = useState("");
  const [valuePage, setValuePage] = useState(0);
  useEffect(() => {
    setNotice("");
    setValuePage(Math.floor(offset / VALUE_PAGE));
  }, [detail?.id, offset]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const detailPages = Math.max(1, Math.ceil((detail?.value?.length ?? 0) / VALUE_PAGE));
  return (
    <Dialog
      open={!!detail}
      onClose={onClose}
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
            value={detail?.value?.slice(valuePage * VALUE_PAGE, (valuePage + 1) * VALUE_PAGE) ?? ""}
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
              {detail?.spreadsheet
                ? "Copy for spreadsheet"
                : detail?.copyValue !== undefined
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
  );
}
