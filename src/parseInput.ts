import Papa from "papaparse";
import type { Delimiter } from "./data.ts";

const CHUNK_SIZE = 1024 * 1024;
export const MAX_RECORD_CHARACTERS = 8 * 1024 * 1024;
export type Dialect = { delimiter: string; newline: string };

async function* textChunks(source: File | string) {
  if (typeof source === "string") {
    for (let offset = 0; offset < source.length; offset += CHUNK_SIZE)
      yield {
        text: source.slice(offset, offset + CHUNK_SIZE),
        fraction: Math.min(1, (offset + CHUNK_SIZE) / source.length),
      };
  } else {
    // Keep the decoder alive across byte boundaries, including the final flush.
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (let offset = 0; offset < source.size; offset += CHUNK_SIZE) {
      const bytes = await source.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
      let text: string;
      try {
        text = decoder.decode(bytes, { stream: true });
      } catch {
        throw new Error(
          "The file is not valid UTF-8. Export it as UTF-8 CSV or TSV and try again.",
        );
      }
      yield { text, fraction: Math.min(1, (offset + CHUNK_SIZE) / source.size) };
    }
    let text: string;
    try {
      text = decoder.decode();
    } catch {
      throw new Error(
        "The file ends with an incomplete UTF-8 character. Export it as UTF-8 and try again.",
      );
    }
    yield { text, fraction: 1 };
  }
}

/** Find complete records before dialect detection. This boundary scanner does
 * not decode fields: Papa remains responsible for quoting validation. Never
 * guess a newline from a cut CRLF or a delimiter from an unfinished record. */
export async function parseInput(
  source: File | string,
  delimiter: Delimiter,
  consume: (result: Papa.ParseResult<string[]>) => void,
  progress: (fraction: number) => void = () => {},
): Promise<Dialect> {
  let pending = "";
  let position = 0;
  let recordStart = 0;
  let boundary = 0;
  let records = 0;
  let quoted = false;
  let first = true;
  let newline: "" | "\r" | "\n" | "\r\n" = "";
  let parser: Papa.Parser | null = null;
  let detected = delimiter as string;
  const limit = () => {
    throw new Error("A record exceeds 8,388,608 characters. Split or shorten that record.");
  };
  const initialise = (sample: string) => {
    const result = Papa.parse<string[]>(sample, {
      delimiter,
      newline: newline || "\n",
      preview: 10,
      skipEmptyLines: "greedy",
      delimitersToGuess: [",", "\t", ";", "|"],
    });
    detected = result.meta.delimiter;
    const configured = new Papa.Parser({ delimiter: detected, newline: newline || "\n" });
    const warnings = result.errors.filter((error) => error.code === "UndetectableDelimiter");
    if (warnings.length) consume({ ...result, data: [], errors: warnings });
    return configured;
  };
  const scan = (eof: boolean) => {
    // Search special characters without a JS iteration for each ordinary byte.
    // position never rewinds over text scanned in previous chunks.
    const special = /["\r\n]/g;
    special.lastIndex = position;
    let match: RegExpExecArray | null;
    while ((match = special.exec(pending))) {
      const index = match.index;
      const char = match[0];
      if (index - recordStart > MAX_RECORD_CHARACTERS) limit();
      if (char === '"') {
        if (quoted) {
          if (index + 1 === pending.length && !eof) {
            position = index;
            return;
          }
          if (pending[index + 1] === '"') {
            special.lastIndex++;
            continue;
          }
          quoted = false;
        } else if (
          index === recordStart ||
          (detected ? pending[index - 1] === detected : ",\t;|".includes(pending[index - 1]))
        ) {
          quoted = true;
        }
      } else if (!quoted) {
        if (char === "\r" && index + 1 === pending.length && !eof) {
          position = index;
          return;
        }
        const ending = char === "\r" ? (pending[index + 1] === "\n" ? "\r\n" : "\r") : "\n";
        newline ||= ending;
        // Reject ambiguous mixed separators instead of silently changing cells.
        if (ending !== newline)
          throw new Error(
            "Mixed record line endings. Export the file with consistent line endings and try again.",
          );
        special.lastIndex = index + ending.length;
        boundary = recordStart = special.lastIndex;
        records++;
      }
    }
    position = pending.length;
    if (pending.length - recordStart > MAX_RECORD_CHARACTERS) limit();
  };
  for await (const chunk of textChunks(source)) {
    pending += first ? chunk.text.replace(/^\ufeff/, "") : chunk.text;
    if (chunk.text.length) first = false;
    scan(false);
    if (!parser && boundary && (records >= 10 || boundary >= 64 * 1024))
      parser = initialise(pending.slice(0, boundary));
    if (parser && boundary) {
      consume(parser.parse(pending.slice(0, boundary), 0, true) as Papa.ParseResult<string[]>);
      pending = pending.slice(boundary);
      position -= boundary;
      recordStart -= boundary;
      boundary = 0;
    }
    progress(chunk.fraction);
  }
  scan(true);
  if (!parser) parser = initialise(pending);
  // An empty remainder after a record separator does not add a phantom row.
  if (pending)
    consume(parser.parse(pending, 0, boundary === pending.length) as Papa.ParseResult<string[]>);
  return { delimiter: detected, newline: newline || "\n" };
}
