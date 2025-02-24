import { useState, useEffect } from "react";

export interface Settings {
  foobar: boolean;
}

const useSettings = () => {
  const [settings, setSettings] = useState<Settings>({ foobar: false });

  useEffect(() => {
    const savedSettings = localStorage.getItem("csvFinderSettings");
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("csvFinderSettings", JSON.stringify(settings));
    if (settings.foobar) {
      // document.body.classList.add("dark-mode");
    } else {
      // document.body.classList.remove("dark-mode");
    }
  }, [settings]);

  return [settings, setSettings] as const;
};

export default useSettings;
