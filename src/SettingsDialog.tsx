import React from "react";
import { Settings } from "./hooks/useSettings";

interface SettingsDialogProps {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  dialogRef,
  settings,
  setSettings,
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const headers = event.target.checked;
    setSettings(current => ({ ...current, headers }));
  };

  return (
    <dialog ref={dialogRef} aria-labelledby="settingsTitle">
      <form method="dialog">
        <h2 id="settingsTitle">Settings</h2>
        <label>
          <input
            type="checkbox"
            checked={settings.headers}
            onChange={handleChange}
          />
          Import data has headers
        </label>
        <div className="buttons">
          <button type="submit">Close</button>
        </div>
      </form>
    </dialog>
  );
};

export default SettingsDialog;
