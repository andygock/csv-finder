import { useRef } from "react";
import type { KeyboardEvent } from "react";
import styles from "./PasteBox.module.css";
import { Button } from "./ui";

export default function PasteBox({
  onSubmit,
  disabled = false,
  text,
  setText,
}: {
  onSubmit: (text: string) => Promise<boolean>;
  disabled?: boolean;
  text: string;
  setText: (value: string) => void;
}) {
  const submitting = useRef(false);
  const handleSubmit = async () => {
    if (!text.trim() || disabled || submitting.current) return;
    submitting.current = true;
    try {
      await onSubmit(text);
    } finally {
      submitting.current = false;
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === "Enter" &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void handleSubmit();
    }
  };
  return (
    <div className={styles.container}>
      <textarea
        aria-label="CSV or TSV data to import"
        disabled={disabled}
        className={styles.paste}
        placeholder="Paste CSV or TSV, or drop a file anywhere"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className={styles.actions}>
        <span>Ctrl / ⌘ + Enter to preview · UTF-8 · up to 256 MiB</span>
        <Button
          variant="primary"
          onClick={() => void handleSubmit()}
          disabled={disabled || !text.trim()}
        >
          Preview data
        </Button>
      </div>
    </div>
  );
}
