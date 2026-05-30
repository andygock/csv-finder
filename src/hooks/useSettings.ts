import { useState, useEffect } from "react";

export interface Settings {
  headers: boolean;
}

const storageKey = "csvFinderSettings";
const defaultSettings: Settings = { headers: true };

const readSettings = (): Settings => {
  try {
    const savedSettings = localStorage.getItem(storageKey);
    if (!savedSettings) return defaultSettings;

    const parsedSettings: unknown = JSON.parse(savedSettings);
    if (
      typeof parsedSettings === "object" &&
      parsedSettings !== null &&
      "headers" in parsedSettings
    ) {
      return {
        headers: Boolean(parsedSettings.headers),
      };
    }
  } catch {
    return defaultSettings;
  }

  return defaultSettings;
};

const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(readSettings);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings]);

  return [settings, setSettings] as const;
};

export default useSettings;
