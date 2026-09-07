import { useState, useEffect } from "react";
import { readSettings, writeSettings } from "../settingsStorage.ts";
export type { Settings } from "../settingsStorage.ts";

const useSettings = () => {
  const [settings, setSettings] = useState(readSettings);
  useEffect(() => writeSettings(settings), [settings]);
  return [settings, setSettings] as const;
};

export default useSettings;
