import React, { useState } from "react";
import Papa from "papaparse";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

function App() {
  const [data, setData] = useState<string[][]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [filter, setFilter] = useState("");
  const [dragText, setDragText] = useState("Drag and drop a CSV file here");

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

  // console.log("data", data);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      className={"drop " + (isDragging ? "dragging" : "")}
    >
      <h1>Find Stuff In CSVs</h1>
      <input
        type="text"
        placeholder="Filter"
        value={filter}
        onChange={handleFilterChange}
      />
      {data.length > 0 ? (
        <div>
          <table>
            <thead>
              <tr>
                {data[0].map((header, index) => (
                  <th key={index}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filterData(data, filter).map((row, rowIndex) => (
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
        <p className="drag-text">{dragText}</p>
      )}
      <ToastContainer />
    </div>
  );
}

export default App;
