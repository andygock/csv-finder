import Papa from "papaparse";
import React, { useEffect, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";
import useSettings from "./hooks/useSettings";
import PasteBox from "./PasteBox";
import SettingsDialog from "./SettingsDialog";

const defaultDragText = "Drag and drop a CSV file here.";

function App() {
  const [data, setData] = useState<string[][]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [filter, setFilter] = useState("");
  const [dragText, setDragText] = useState(defaultDragText);
  const [sortConfig, setSortConfig] = useState<{
    key: number;
    direction: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useSettings();

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

  const loadTextData = (text: string) => {
    const delimiter = text.includes("\t") ? "\t" : ",";
    Papa.parse(text, {
      // header: settings.headers ?? true,
      skipEmptyLines: true,
      delimiter,
      complete: (result) => {
        if (result.errors.length) {
          toast.error("Invalid data format.");
        } else {
          setData(result.data as string[][]);
          setDragText("Data loaded successfully.");
          toast.success("Data loaded successfully.");
        }
      },
    });
  };

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(event.target.value);
  };

  const highlightText = (text: string, highlight: string) => {
    const tokens = highlight.toLowerCase().split(" ");
    const parts = text.split(new RegExp(`(${tokens.join("|")})`, "gi"));
    return (
      <>
        {parts.map((part, index) =>
          tokens.includes(part.toLowerCase()) ? (
            <span key={index} className="highlight">
              {part}
            </span>
          ) : (
            part
          )
        )}
      </>
    );
  };

  const filterData = (data: string[][], filter: string) => {
    if (!filter) return data.slice(1);
    const tokens = filter.toLowerCase().split(" ");
    return data
      .slice(1)
      .filter((row) =>
        tokens.every((token) =>
          row.some((cell) => cell.toLowerCase().includes(token))
        )
      );
  };

  const handleCellClick = (text: string) => {
    const trimmedText = text.trim().replace(/\$/g, "").replace(/,/g, "");
    navigator.clipboard.writeText(trimmedText);
    toast.success("Copied: " + trimmedText);
  };

  const handleSort = (columnIndex: number) => {
    let direction = "ascending";
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
      "settingsDialog"
    ) as HTMLDialogElement;
    if (dialog.open) {
      dialog.close();
    } else {
      dialog.showModal();
    }
  };

  const sortedData = (data: string[][]) => {
    if (!sortConfig) return data;
    const sorted = [...data].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key])
        return sortConfig.direction === "ascending" ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key])
        return sortConfig.direction === "ascending" ? 1 : -1;
      return 0;
    });
    return sorted;
  };

  const filteredData = filterData(data, filter);
  const displayedData = sortedData(filteredData);

  // console.log("data", data);

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        className={"drop " + (isDragging ? "dragging" : "")}
      >
        <div className="settings">
          {/* <button onClick={toggleSettingsDialog}>⚙️</button> */}
          {data.length > 0 && (
            <button
              onClick={() => {
                // clear loaded data
                setData([]);
                setFilter("");
                setDragText(defaultDragText);
              }}
            >
              ❌
            </button>
          )}
        </div>
        {!data.length && (
          <div className="header">
            <h1>CSV Finder</h1>
            <p>Load and search CSV data for people in a hurry.</p>
          </div>
        )}
        {data.length > 0 && (
          <input
            ref={inputRef}
            type="text"
            placeholder="Filter"
            value={filter}
            onChange={handleFilterChange}
          />
        )}
        {data.length > 0 ? (
          <div>
            <p className="row-info">
              Loaded rows: {data.length - 1}, Displayed rows:{" "}
              {displayedData.length}
            </p>
            <table>
              <thead>
                <tr>
                  {data[0].map((header, index) => (
                    <th key={index} onClick={() => handleSort(index)}>
                      {header}
                      {sortConfig && sortConfig.key === index && (
                        <span>
                          {sortConfig.direction === "ascending" ? " 🔼" : " 🔽"}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedData.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        onClick={() => handleCellClick(cell)}
                        className="cell"
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
            <p className="drag-text">{dragText}</p>
            <PasteBox onSubmit={handlePasteBoxSubmit} />
            <p className="privacy">
              All file loading and data processing occur only{" "}
              <strong>within your web browser</strong>. No data is sent to any
              external servers, ensuring your privacy.
            </p>
          </div>
        )}
        <footer className="footer">
          Made by <a href="https://gock.net/">Andy Gock</a> |{" "}
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
