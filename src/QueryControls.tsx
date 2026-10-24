import { memo, useCallback } from "react";
import type { Ref } from "react";
import type { Query } from "./shared.ts";
import { Check, Input, Select, Popover } from "./ui";
import ColumnPicker from "./ColumnPicker";
import styles from "./App.module.css";

const QueryControls = memo(function QueryControls({
  query,
  headings,
  shown,
  searchRef,
  sortMode,
  copyFormat,
  simplifyNumbers,
  spreadsheet,
  onChange,
  onHeaders,
  onSortMode,
  onCopyFormat,
  onSimplifyNumbers,
  onSpreadsheet,
}: {
  query: Query;
  headings: string[];
  shown: number[];
  searchRef: Ref<HTMLInputElement>;
  sortMode: "text" | "numeric";
  copyFormat: "," | "\t";
  simplifyNumbers: boolean;
  spreadsheet: boolean;
  onChange: (patch: Partial<Query>) => void;
  onHeaders: (value: boolean) => void;
  onSortMode: (value: "text" | "numeric") => void;
  onCopyFormat: (value: "," | "\t") => void;
  onSimplifyNumbers: (value: boolean) => void;
  onSpreadsheet: (value: boolean) => void;
}) {
  const onColumns = useCallback(
    (columns: number[] | undefined) => onChange({ visibleColumns: columns }),
    [onChange],
  );
  return (
    <div className={styles.searchBar}>
      <Input
        ref={searchRef}
        type="search"
        aria-label="Filter results"
        placeholder="Search records…"
        value={query.filter}
        maxLength={2000}
        onChange={(event) => {
          onChange({ filter: event.target.value });
        }}
      />
      <Select
        aria-label="Search column"
        value={query.searchColumn ?? "all"}
        onChange={(event) => {
          onChange({
            searchColumn: event.target.value === "all" ? null : Number(event.target.value),
          });
        }}
      >
        <option value="all">All columns</option>
        {headings.map((heading, id) => (
          <option key={id} value={id}>
            {id + 1}. {heading}
          </option>
        ))}
      </Select>
      <ColumnPicker headings={headings} shown={shown} onChange={onColumns} />
      <Popover title="Options">
        <Check checked={query.headers} onChange={(event) => onHeaders(event.target.checked)}>
          First record is header
        </Check>
        <Check
          checked={query.phrase}
          onChange={(event) => {
            onChange({ phrase: event.target.checked });
          }}
        >
          Match phrase
        </Check>
        <Check
          checked={query.skipEmpty}
          onChange={(event) => {
            onChange({ skipEmpty: event.target.checked });
          }}
        >
          Hide empty records
        </Check>
        <label>
          Sort as{" "}
          <Select
            value={sortMode}
            onChange={(event) => {
              const mode = event.target.value as "text" | "numeric";
              onSortMode(mode);
            }}
          >
            <option value="text">Text</option>
            <option value="numeric">Numbers</option>
          </Select>
        </label>
        <label>
          Copy row as{" "}
          <Select
            value={copyFormat}
            onChange={(event) => onCopyFormat(event.target.value as "," | "\t")}
          >
            <option value={"\t"}>TSV</option>
            <option value=",">CSV</option>
          </Select>
        </label>
        <Check
          checked={simplifyNumbers}
          onChange={(event) => onSimplifyNumbers(event.target.checked)}
        >
          Copy unformatted numbers
        </Check>
        <Check checked={spreadsheet} onChange={(event) => onSpreadsheet(event.target.checked)}>
          Copy for spreadsheet (escape formulae)
        </Check>
      </Popover>
    </div>
  );
});
export default QueryControls;
