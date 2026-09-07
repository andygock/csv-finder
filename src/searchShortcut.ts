type Key = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "metaKey" | "altKey" | "isComposing" | "defaultPrevented"
>;

export function searchShortcut(
  event: Key,
  editable: boolean,
  filterFocused: boolean,
  modalOpen: boolean,
): "clear" | string | null {
  if (
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    modalOpen
  )
    return null;
  if (event.key === "Escape" && (!editable || filterFocused)) return "clear";
  return !editable && /^[a-zA-Z0-9]$/.test(event.key) ? event.key : null;
}
