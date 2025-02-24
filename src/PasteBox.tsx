import { useState, useEffect } from "react";

export default function PasteBox({
  onSubmit = () => {},
}: {
  onSubmit?: (text: string) => void;
}) {
  const [readyToSubmit, setReadyToSubmit] = useState(false);
  const [text, setText] = useState("");

  const handleSubmit = () => {
    if (text) {
      onSubmit(text);
      setText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey && e.key === "Enter") {
      handleSubmit();
    }
  };

  useEffect(() => {
    setReadyToSubmit(text.length > 0);
  }, [text]);

  return (
    <div className="paste-box-container">
      <textarea
        className="paste-box"
        placeholder="Paste your CSV or TSV data here. Spreadsheet compatible. Shortcut: Ctrl + Enter to load."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div>
        <button onClick={handleSubmit} disabled={!readyToSubmit}>
          Load
        </button>
      </div>
    </div>
  );
}
