import { useRef, useState } from "react";
import styles from "./PasteBox.module.css";

export default function PasteBox({
  onSubmit,
  disabled = false,
}: {
  onSubmit: (text: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const submitting = useRef(false);

  const handleSubmit = async () => {
    if (!text.trim() || disabled || submitting.current) return;
    submitting.current = true;
    try {
      const submitted = text;
      if (await onSubmit(submitted)) setText((current) => (current === submitted ? "" : current));
    } finally {
      submitting.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className={styles.pasteBoxContainer}>
      <textarea
        aria-label="CSV or TSV data to import"
        disabled={disabled}
        className={styles.pasteBox}
        placeholder="Paste CSV or TSV data here. Ctrl + Enter (Command + Enter on Mac) to load."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div>
        <button onClick={() => void handleSubmit()} disabled={disabled || !text.trim()}>
          Load
        </button>
      </div>
    </div>
  );
}
