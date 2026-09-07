import Papa from "papaparse";
import type { Delimiter } from "./data.ts";

const CHUNK_SIZE = 1024 * 1024;
const MAX_RECORD_CHARACTERS = 8 * 1024 * 1024;

async function* textChunks(source: File | string): AsyncGenerator<string> {
  if (typeof source === "string") {
    for (let offset = 0; offset < source.length; offset += CHUNK_SIZE)
      yield source.slice(offset, offset + CHUNK_SIZE);
  } else {
    // A decoder must span byte chunks: independently decoding each Blob slice
    // replaces multibyte characters split across boundaries with U+FFFD.
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (let offset = 0; offset < source.size; offset += CHUNK_SIZE) {
      const bytes = await source.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
      try {
        yield decoder.decode(bytes, { stream: true });
      } catch {
        throw new Error(
          "The file is not valid UTF-8. Export it as UTF-8 CSV or TSV and try again.",
        );
      }
    }
    try {
      yield decoder.decode();
    } catch {
      throw new Error(
        "The file ends with an incomplete UTF-8 character. Export it as UTF-8 and try again.",
      );
    }
  }
}

/** Feed decoded text to Papa's low-level parser, retaining only the unfinished
 * record between chunks. The parser understands quoted, multiline records;
 * splitting on newlines ourselves would corrupt valid CSV. */
export async function parseInput(
  source: File | string,
  delimiter: Delimiter,
  consume: (result: Papa.ParseResult<string[]>) => void,
): Promise<void> {
  let pending = "";
  let parser: Papa.Parser | null = null;
  for await (let chunk of textChunks(source)) {
    if (!parser) {
      chunk = chunk.replace(/^\ufeff/, "");
      // Use the high-level parser solely to detect dialect. Errors caused by a
      // truncated sample are handled by the streaming parser at actual EOF.
      const sample = Papa.parse<string[]>(chunk, { delimiter, preview: 10 });
      const warning = sample.errors.filter((error) => error.code === "UndetectableDelimiter");
      const newline =
        sample.meta.linebreak === "\r\n" ? "\r\n" : sample.meta.linebreak === "\r" ? "\r" : "\n";
      parser = new Papa.Parser({ delimiter: sample.meta.delimiter, newline });
      if (warning.length) consume({ ...sample, data: [], errors: warning });
    }
    pending += chunk;
    const result = parser.parse(pending, 0, true) as Papa.ParseResult<string[]>;
    pending = pending.slice(result.meta.cursor);
    consume(result);
    // Incomplete giant records would otherwise be rescanned on every chunk.
    if (pending.length > MAX_RECORD_CHARACTERS)
      throw new Error("A record exceeds 8 million characters. Split or shorten that record.");
  }
  if (parser) consume(parser.parse(pending, 0, false) as Papa.ParseResult<string[]>);
}
