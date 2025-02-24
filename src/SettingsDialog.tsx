import React from "react";
import { Settings } from "./hooks/useSettings";

interface SettingsDialogProps {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  settings,
  setSettings,
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSettings({ ...settings, foobar: event.target.checked });
  };

  return (
    <dialog id="settingsDialog">
      <form method="dialog">
        <h2>Settings</h2>
        <label>
          <input
            type="checkbox"
            checked={settings.foobar}
            onChange={handleChange}
          />
          foobar
        </label>
        <p>Coming soon.</p>
        <div>
          <button type="submit">Close</button>
        </div>
      </form>
    </dialog>
  );
};

export default SettingsDialog;
