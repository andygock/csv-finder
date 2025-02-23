import React, { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

function App() {
  const [data, setData] = useState<string[][]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [filter, setFilter] = useState("");
  const [dragText, setDragText] = useState("Drag and drop a CSV file here");
  const [sortConfig, setSortConfig] = useState<{
    key: number;
    direction: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFilter("");
      } else if (
        /^[a-zA-Z0-9]$/.test(event.key) &&
        document.activeElement !== inputRef.current
      ) {
        event.preventDefault();
        setFilter((prevFilter) => prevFilter + event.key);
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];

    if (file && file.name.toLowerCase().endsWith(".csv")) {
      Papa.parse(file, {
        complete: (result) => {
          setData(result.data as string[][]);
          setDragText("CSV file loaded successfully!");
        },
      });
    } else {
      setDragText("Please drop a valid CSV file.");
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true); // Ensure isDragging remains true
    setDragText("Release to upload the CSV file");
  };

  const handleDragEnter = () => {
    setIsDragging(true);
    setDragText("Release to upload the CSV file");
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }
    setIsDragging(false);
    setDragText("Drag and drop a CSV file here");
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
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
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

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        className={"drop " + (isDragging ? "dragging" : "")}
      >
        {!data.length && <h1>CSV Finder</h1>}
        <input
          ref={inputRef}
          type="text"
          placeholder="Filter"
          value={filter}
          onChange={handleFilterChange}
        />
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
            <p>
              Loaded files and processing of data is performed in your web
              browser only. It is never sent to any other third party servers.
            </p>
          </div>
        )}
        <footer className="footer">
          &copy; {new Date().getFullYear()}{" "}
          <a href="https://gock.net/">Andy Gock</a> |{" "}
          <a href="https://github.com/andygock/csv-finder">GitHub</a>
        </footer>
      </div>
      <ToastContainer />
    </div>
  );
}

export default App;
