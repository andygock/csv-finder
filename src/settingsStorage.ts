export interface Settings {
  headers: boolean;
}
const storageKey = "csvFinderSettings";
const defaults: Settings = { headers: true };

export function readSettings(
  getStorage: () => Pick<Storage, "getItem"> = () => localStorage,
): Settings {
  try {
    const saved = getStorage().getItem(storageKey);
    const parsed: unknown = saved ? JSON.parse(saved) : null;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "headers" in parsed &&
      typeof parsed.headers === "boolean"
    ) {
      return { headers: parsed.headers };
    }
  } catch {
    // Storage access and malformed saved values must not prevent initial render.
  }
  return { ...defaults };
}

export function writeSettings(
  settings: Settings,
  getStorage: () => Pick<Storage, "setItem"> = () => localStorage,
): void {
  try {
    getStorage().setItem(storageKey, JSON.stringify(settings));
  } catch {
    // Persistence is optional; settings remain usable in memory when storage
    // is disabled or full, including browsers that throw on accessing storage.
  }
}
