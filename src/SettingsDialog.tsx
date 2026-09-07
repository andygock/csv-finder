import React from "react";
import { Settings } from "./hooks/useSettings";
import styles from "./SettingsDialog.module.css";

interface SettingsDialogProps {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ dialogRef, settings, setSettings }) => {
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
        <p className={styles.intro}>Choose how the first imported record should be displayed.</p>
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
