import type { Delimiter } from "./shared";
import { Check, Dialog, Select } from "./ui";
import styles from "./SettingsDialog.module.css";

export function ImportOptions({
  delimiter,
  setDelimiter,
  headers,
  setHeaders,
}: {
  delimiter: Delimiter;
  setDelimiter: (value: Delimiter) => void;
  headers: boolean;
  setHeaders: (value: boolean) => void;
}) {
  return (
    <div className={styles.options}>
      <label>
        Delimiter{" "}
        <Select
          value={delimiter}
          onChange={(event) => setDelimiter(event.target.value as Delimiter)}
        >
          <option value="">Auto-detect</option>
          <option value=",">Comma</option>
          <option value={"\t"}>Tab</option>
          <option value=";">Semicolon</option>
          <option value="|">Pipe</option>
        </Select>
      </label>
      <Check checked={headers} onChange={(event) => setHeaders(event.target.checked)}>
        First record is header
      </Check>
    </div>
  );
}
export default function SettingsDialog({
  open,
  onClose,
  ...options
}: Parameters<typeof ImportOptions>[0] & { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Import settings">
      <ImportOptions {...options} />
      <p className={styles.hint}>
        Delimiter applies to the next import. The header setting updates the current view and is
        saved on this device.
      </p>
    </Dialog>
  );
}
