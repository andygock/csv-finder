export function columnOptions(headings: string[], filter: string) {
  const needle = filter.trim().toLowerCase();
  return headings
    .map((heading, id) => ({ heading, id }))
    .filter(({ heading, id }) => `${id + 1}. ${heading}`.toLowerCase().includes(needle));
}
