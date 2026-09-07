import React from "react";
import { Settings } from "./hooks/useSettings";
import type { Delimiter } from "./data.ts";
import styles from "./SettingsDialog.module.css";

interface SettingsDialogProps {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  delimiter: Delimiter;
  setDelimiter: React.Dispatch<React.SetStateAction<Delimiter>>;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  dialogRef,
  settings,
  setSettings,
  delimiter,
  setDelimiter,
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const headers = event.target.checked;
    setSettings((current) => ({ ...current, headers }));
  };

  return (
    <dialog ref={dialogRef} aria-labelledby="settingsTitle">
      <form method="dialog" className={styles.form}>
        <h2 id="settingsTitle" className={styles.title}>
          Settings
        </h2>
        <p className={styles.intro}>Choose how imported data should be interpreted.</p>
        <label className={styles.field}>
          <span className={styles.optionTitle}>Import delimiter</span>
          <select
            value={delimiter}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "" || value === "," || value === "\t" || value === ";" || value === "|")
                setDelimiter(value);
            }}
          >
            <option value="">Auto-detect</option>
            <option value=",">Comma</option>
            <option value={"\t"}>Tab</option>
            <option value=";">Semicolon</option>
            <option value="|">Pipe</option>
          </select>
          <span className={styles.optionDescription}>Applied when the next data is loaded.</span>
        </label>
        <label className={styles.option}>
          <input type="checkbox" checked={settings.headers} onChange={handleChange} />
          <span className={styles.optionText}>
            <span className={styles.optionTitle}>First record is a header</span>
            <span className={styles.optionDescription}>
              Use the first row as column names and exclude it from results.
            </span>
          </span>
        </label>
        <div className={styles.actions}>
          <button type="submit">Close</button>
        </div>
      </form>
    </dialog>
  );
};

export default SettingsDialog;
