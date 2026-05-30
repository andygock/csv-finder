import Papa, { type ParseConfig } from "papaparse";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "./App.module.css";
import useSettings from "./hooks/useSettings";
import PasteBox from "./PasteBox";
import SettingsDialog from "./SettingsDialog";

const defaultDragText = "Drag and drop a CSV file here.";

type SortDirection = "ascending" | "descending";
type SortConfig = {
  key: number;
  direction: SortDirection;
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getSearchTokens = (value: string, exactMatch: boolean) => {
  const trimmedValue = value.trim().toLowerCase();
  if (!trimmedValue) return [];

  return exactMatch
    ? [trimmedValue]
    : trimmedValue.split(/\s+/).filter(Boolean);
};

function App() {
  const [data, setData] = useState<string[][]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [filter, setFilter] = useState("");
  const [dragText, setDragText] = useState(defaultDragText);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useSettings();
  const isHeader = settings.headers;
  const [exactMatch, setExactMatch] = useState(false);
  const [skipEmptyRows, setSkipEmptyRows] = useState(true);
  const [simplifyNumbers, setSimplifyNumbers] = useState(true);
  const [delimiterWithCopy, setDelimiterWithCopy] = useState<"," | "\t">("\t");

  // key down
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // console.log("keydown event");

      if (event.key === "Escape") {
        // cancel filter
        setFilter("");
      } else if (
        /^[a-zA-Z0-9]$/.test(event.key) &&
        document.activeElement !== inputRef.current
      ) {
        // check if it was ctrl + v past event
        if (event.ctrlKey && event.key === "v") {
          // do not proceed, will be handled by paste event elsewhere
          return;
        }

        // if there is no data loaded, do not proceed
        if (!data.length) {
          return;
        }

        // add character to filter
        event.preventDefault();
        setFilter((prevFilter) => prevFilter + event.key);
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [data.length]);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    // console.log("drop event");
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith(".csv")) {
      // get file content as text
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        loadTextData(text);
      };
      reader.readAsText(file);
    } else {
      setDragText("Please drop a valid CSV file.");
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    // console.log("dragover event");
    event.preventDefault();
    setIsDragging(true); // Ensure isDragging remains true
    setDragText("Release to upload the CSV file");
  };

  const handleDragEnter = () => {
    // console.log("dragenter event");
    setIsDragging(true);
    setDragText("Release to upload the CSV file");
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    // console.log("dragleave event");
    if (event.currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }
    setIsDragging(false);
    setDragText("Drag and drop a CSV file here");
  };

  const handlePasteBoxSubmit = (text: string) => {
    loadTextData(text);
  };

  const handleSkipEmptyRowsChange = () => {
    setSkipEmptyRows(!skipEmptyRows);
  };

  const handleSimplifyNumbersChange = () => {
    setSimplifyNumbers(!simplifyNumbers);
  };

  const loadTextData = (text: string, options?: ParseConfig<string[]>) => {
    Papa.parse<string[]>(text, {
      skipEmptyLines: skipEmptyRows,
      complete: (result) => {
        if (result.errors.length) {
          toast.error("Invalid data format.");
        } else {
          setData(result.data);
          setDragText("Data loaded successfully.");
          toast.success("Data loaded successfully.");
        }
      },
      ...(options || {}),
    });
  };

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(event.target.value);
  };

  const handleHeaderCheckboxChange = () => {
    setSettings((currentSettings) => ({
      ...currentSettings,
      headers: !currentSettings.headers,
    }));
  };

  const handleExactMatchCheckboxChange = () => {
    setExactMatch(!exactMatch);
  };

  const highlightText = (text: string, highlight: string) => {
    const tokens = getSearchTokens(highlight, exactMatch);
    if (!tokens.length) return text;

    const pattern = tokens.map(escapeRegExp).join("|");
    const parts = text.split(new RegExp(`(${pattern})`, "gi"));

    return (
      <>
        {parts.map((part, index) =>
          tokens.includes(part.toLowerCase()) ? (
            <span key={index} className={styles.highlight}>
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </>
    );
  };

  const copyText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const handleCellClick = async (text: string, row?: string[]) => {
    if (row) {
      const delimiterName = delimiterWithCopy === "," ? "comma" : "tab";
      let out = "";
      if (delimiterWithCopy === ",") {
        out = row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",");
      } else if (delimiterWithCopy === "\t") {
        out = row.join("\t");
      }

      await copyText(
        out,
        `Copied row with ${delimiterName} delimiters: ${out}`,
      );
    } else {
      const trimmedText = simplifyNumbers
        ? text.trim().replace(/\$/g, "").replace(/,/g, "")
        : text;
      await copyText(trimmedText, "Copied: " + trimmedText);
    }
  };

  const handleSort = (columnIndex: number) => {
    let direction: SortDirection = "ascending";
    if (
      sortConfig &&
      sortConfig.key === columnIndex &&
      sortConfig.direction === "ascending"
    ) {
      direction = "descending";
    }
    setSortConfig({ key: columnIndex, direction });
  };

  const toggleSettingsDialog = () => {
    const dialog = document.getElementById(
      "settingsDialog",
    ) as HTMLDialogElement;
    if (dialog.open) {
      dialog.close();
    } else {
      dialog.showModal();
    }
  };

  const filteredData = useMemo(() => {
    const rows = isHeader ? data.slice(1) : data;
    const tokens = getSearchTokens(filter, exactMatch);
    if (!tokens.length) return rows;

    return rows.filter((row) =>
      tokens.every((token) =>
        row.some((cell) => cell.toLowerCase().includes(token)),
      ),
    );
  }, [data, exactMatch, filter, isHeader]);

  const displayedData = useMemo(() => {
    if (!sortConfig || !isHeader) return filteredData;

    return [...filteredData].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key])
        return sortConfig.direction === "ascending" ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key])
        return sortConfig.direction === "ascending" ? 1 : -1;
      return 0;
    });
  }, [filteredData, isHeader, sortConfig]);

  const loadedRowCount = isHeader ? Math.max(data.length - 1, 0) : data.length;

  // console.log("data", data);

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        className={`${styles.drop} ${isDragging ? styles.dragging : ""}`}
      >
        <div className={styles.settings}>
          <button onClick={toggleSettingsDialog}>Settings</button>
          {data.length > 0 && (
            <button
              onClick={() => {
                // clear loaded data
                setData([]);
                setFilter("");
                setDragText(defaultDragText);
              }}
            >
              Clear
            </button>
          )}
        </div>
        {!data.length && (
          <div className={styles.header}>
            <h1>CSV Finder</h1>
            <p>Load and search CSV data for people in a hurry.</p>
          </div>
        )}
        {data.length > 0 && (
          <>
            <input
              ref={inputRef}
              type="text"
              placeholder="Filter"
              value={filter}
              onChange={handleFilterChange}
              className={styles.input}
            />

            <div>
              <label>
                <input
                  type="checkbox"
                  checked={isHeader}
                  onChange={handleHeaderCheckboxChange}
                />
                First row is header
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={exactMatch}
                  onChange={handleExactMatchCheckboxChange}
                />
                Exact match
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={skipEmptyRows}
                  onChange={handleSkipEmptyRowsChange}
                />
                Skip empty rows
              </label>
              <label>
                Copy row as
                <select
                  className={styles.select}
                  value={delimiterWithCopy}
                  onChange={(event) =>
                    setDelimiterWithCopy(event.target.value as "," | "\t")
                  }
                >
                  <option value="\t">Tab</option>
                  <option value=",">Comma</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={simplifyNumbers}
                  onChange={handleSimplifyNumbersChange}
                />
                Copy unformatted numbers
              </label>
            </div>
          </>
        )}
        {data.length > 0 ? (
          <div>
            <p className={styles.rowInfo}>
              Loaded rows: {loadedRowCount}, Displayed rows:{" "}
              {displayedData.length}
            </p>
            <table className={styles.table}>
              <thead>
                {isHeader && (
                  <tr>
                    <th>#</th>
                    {data[0].map((header, index) => (
                      <th key={index} onClick={() => handleSort(index)}>
                        {header}
                        {sortConfig && sortConfig.key === index && (
                          <span>
                            {sortConfig.direction === "ascending"
                              ? " 🔼"
                              : " 🔽"}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {displayedData.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <td
                      className={styles.rowNumber}
                      onClick={() => handleCellClick("", row)}
                    >
                      {rowIndex + 1}
                    </td>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        onClick={() => handleCellClick(cell)}
                        className={styles.cell}
                      >
                        {filter ? highlightText(cell, filter) : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <p className={styles.dragText}>{dragText}</p>
            <PasteBox onSubmit={handlePasteBoxSubmit} />
            <p className={styles.privacy}>
              All file loading and data processing occur only{" "}
              <strong>within your web browser</strong>. No data is sent to any
              external servers, ensuring your privacy.
            </p>
          </div>
        )}
        <footer className={styles.footer}>
          <a href="https://github.com/andygock/csv-finder">GitHub</a>
        </footer>
      </div>
      <SettingsDialog settings={settings} setSettings={setSettings} />
      <ToastContainer
        autoClose={1000}
        pauseOnFocusLoss={false}
        position="bottom-center"
      />
    </div>
  );
}

export default App;
