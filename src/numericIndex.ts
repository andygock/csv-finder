// Five words per source row: category/digit count and four source offsets.
// No normalised strings or per-row objects survive classification. The cache
// grows linearly (20 bytes/row) and never reparses uncached values during sorting.
export class NumericIndex {
  private readonly keys: Uint32Array;
  private readonly rows: string[][];
  private readonly column: number;

  constructor(rows: string[][], column: number) {
    this.rows = rows;
    this.column = column;
    this.keys = new Uint32Array(rows.length * 5);
  }

  add(row: number): void {
    const value = this.rows[row][this.column] ?? "";
    const trimmed = value.trim();
    const at = row * 5;
    if (!trimmed) return;
    if (!/^[+-]?\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(trimmed)) {
      this.keys[at] = 1;
      return;
    }
    const start = value.length - value.trimStart().length;
    const end = start + trimmed.length;
    let integerStart = start;
    const negative = value[integerStart] === "-";
    if (value[integerStart] === "+" || negative) integerStart++;
    if (value[integerStart] === "$") integerStart++;
    const dot = value.indexOf(".", integerStart);
    const integerEnd = dot < 0 ? end : dot;
    const fractionStart = dot < 0 ? end : dot + 1;
    let fractionEnd = end;
    while (fractionEnd > fractionStart && value.charCodeAt(fractionEnd - 1) === 48) fractionEnd--;
    while (
      integerStart < integerEnd &&
      (value[integerStart] === "0" || value[integerStart] === ",")
    )
      integerStart++;
    let digits = 0;
    for (let i = integerStart; i < integerEnd; i++) if (value[i] !== ",") digits++;
    const kind = negative && (digits > 0 || fractionEnd > fractionStart) ? 3 : 2;
    this.keys[at] = digits * 8 + kind;
    this.keys[at + 1] = integerStart;
    this.keys[at + 2] = integerEnd;
    this.keys[at + 3] = fractionStart;
    this.keys[at + 4] = fractionEnd;
  }

  compare(left: number, right: number, direction: "ascending" | "descending"): number {
    const a = left * 5,
      b = right * 5;
    const x = this.keys[a] % 8,
      y = this.keys[b] % 8;
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    if (x === 1 || y === 1) {
      if (x !== 1) return -1;
      if (y !== 1) return 1;
      const l = this.rows[left][this.column].trim();
      const r = this.rows[right][this.column].trim();
      return (l < r ? -1 : l > r ? 1 : 0) * (direction === "ascending" ? 1 : -1);
    }
    const factor = direction === "ascending" ? 1 : -1;
    if (x !== y) return (x === 3 ? -1 : 1) * factor;
    const sign = (x === 3 ? -1 : 1) * factor;
    let order = Math.floor(this.keys[a] / 8) - Math.floor(this.keys[b] / 8);
    if (order) return order * sign;
    const l = this.rows[left][this.column],
      r = this.rows[right][this.column];
    let i = this.keys[a + 1],
      j = this.keys[b + 1];
    while (i < this.keys[a + 2] && j < this.keys[b + 2]) {
      if (l[i] === ",") {
        i++;
        continue;
      }
      if (r[j] === ",") {
        j++;
        continue;
      }
      order = l.charCodeAt(i++) - r.charCodeAt(j++);
      if (order) return order * sign;
    }
    i = this.keys[a + 3];
    j = this.keys[b + 3];
    while (i < this.keys[a + 4] || j < this.keys[b + 4]) {
      order =
        (i < this.keys[a + 4] ? l.charCodeAt(i) : 48) -
        (j < this.keys[b + 4] ? r.charCodeAt(j) : 48);
      if (order) return order * sign;
      i++;
      j++;
    }
    return 0;
  }
}
