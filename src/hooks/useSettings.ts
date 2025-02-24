import { useState, useEffect } from "react";

export interface Settings {
  headers: boolean;
}

const useSettings = () => {
  const [settings, setSettings] = useState<Settings>({ headers: true });

  useEffect(() => {
    const savedSettings = localStorage.getItem("csvFinderSettings");
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("csvFinderSettings", JSON.stringify(settings));
    if (settings.headers) {
      //
    } else {
      //
    }
  }, [settings]);

  return [settings, setSettings] as const;
};

export default useSettings;
