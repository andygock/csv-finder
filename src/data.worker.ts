import {
  DataEngine,
  MAX_CELLS,
  MAX_COLUMNS,
  MAX_FILE_BYTES,
  parseProblem,
  yieldToMessages,
} from "./data.ts";
import { parseInput } from "./parseInput.ts";
import type { WorkerRequest, WorkerResponse } from "./protocol.ts";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<WorkerRequest>) => Promise<void>;
  postMessage: (message: WorkerResponse) => void;
};
let engine: DataEngine | null = null;
let latestQuery = 0;
let pending: Extract<WorkerRequest, { type: "query" }> | null = null;
let running = false;
const send = (message: WorkerResponse) => scope.postMessage(message);

// A single drain loop coalesces requests arriving during a yield. It prevents
// concurrent scans and their temporary indexes accumulating under rapid typing.
async function drain() {
  if (running) return;
  running = true;
  try {
    while (pending) {
      const request = pending;
      pending = null;
      const page = await engine?.query(
        request.query,
        () => latestQuery === request.id,
        (phase, fraction) => {
          if (latestQuery === request.id)
            send({ type: "queryProgress", id: request.id, phase, fraction });
        },
      );
      if (page && latestQuery === request.id) send({ type: "page", id: request.id, page });
    }
  } finally {
    running = false;
  }
}

scope.onmessage = async ({ data: request }) => {
  try {
    if (request.type === "cancel") {
      latestQuery = request.id;
      pending = null;
      return;
    }
    if (request.type === "query") {
      latestQuery = request.id;
      pending = request;
      await drain();
      return;
    }
    if (request.type === "detail") {
      try {
        if (!engine) throw new Error("Load a dataset first.");
        const value = engine.detail(request.row, request.column, request.delimiter, false);
        const copyValue =
          request.simplify && request.column !== null
            ? engine.detail(request.row, request.column, request.delimiter, true)
            : value;
        send({
          type: "detail",
          id: request.id,
          value,
          copyValue: copyValue === value ? undefined : copyValue,
        });
      } catch (error) {
        send({
          type: "detail",
          id: request.id,
          value: "",
          error: error instanceof Error ? error.message : "Could not read this value.",
        });
      }
      return;
    }
    // One worker per import. Termination cancels parsing and releases the data.
    engine = null;
    pending = null;
    const bytes =
      typeof request.source === "string" ? new Blob([request.source]).size : request.source.size;
    if (bytes > MAX_FILE_BYTES)
      throw new Error("This import exceeds the 256 MiB limit. Split the file into smaller parts.");
    if (!bytes) throw new Error("The input is empty.");
    const rows: string[][] = [];
    // Grow byte flags in fixed blocks, avoiding a second multi-million-element
    // JS number array during import. Flatten once after the final record.
    const blanks: Uint8Array[] = [];
    const FLAG_BLOCK = 65_536;
    let cells = 0,
      nonempty = 0,
      lastProgress = 0;
    let detectedWarning = false,
      ragged = false;
    const dialect = await parseInput(
      request.source,
      request.delimiter,
      (result) => {
        const problem = parseProblem(result.errors, rows.length);
        if (problem) throw new Error(problem);
        detectedWarning ||= result.errors.some((error) => error.code === "UndetectableDelimiter");
        for (const row of result.data) {
          cells += row.length;
          if (cells > MAX_CELLS || row.length > MAX_COLUMNS)
            throw new Error(
              "The input exceeds 5 million cells or 1,000 columns. Split it into smaller parts.",
            );
          const blank = row.every((cell) => !cell.trim());
          if (!blank) nonempty++;
          if (rows.length && !blank && row.length !== rows[0].length) ragged = true;
          if (rows.length % FLAG_BLOCK === 0) blanks.push(new Uint8Array(FLAG_BLOCK));
          blanks[blanks.length - 1][rows.length % FLAG_BLOCK] = Number(blank);
          rows.push(row);
        }
      },
      (fraction) => {
        if (performance.now() - lastProgress > 100 || fraction === 1) {
          send({ type: "progress", rows: rows.length, fraction });
          lastProgress = performance.now();
        }
      },
    );
    if (!nonempty) throw new Error("The input contains no non-empty cells.");
    const flags = new Uint8Array(rows.length);
    blanks.forEach((block, index) =>
      flags.set(
        block.subarray(0, Math.min(FLAG_BLOCK, rows.length - index * FLAG_BLOCK)),
        index * FLAG_BLOCK,
      ),
    );
    engine = new DataEngine(rows, flags);
    await yieldToMessages();
    const preview = await engine.query({
      filter: "",
      phrase: false,
      headers: false,
      skipEmpty: false,
      sort: null,
      page: 0,
      pageSize: 5,
      visibleColumns: Array.from({ length: Math.min(engine.columns, 8) }, (_, i) => i),
    });
    const warning = [
      detectedWarning
        ? "Delimiter could not be detected; comma was used. Check the preview or choose a delimiter."
        : "",
      ragged
        ? "Some records have different numbers of fields. Missing cells are shown as blank."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    send({
      type: "loaded",
      rows: rows.length,
      warning,
      info: {
        rows: rows.length,
        columns: engine.columns,
        delimiter: dialect.delimiter,
        headings: engine.headings(true),
        preview: preview!,
      },
    });
  } catch (error) {
    send({
      type: "error",
      message: error instanceof Error ? error.message : "Processing failed. Try a smaller file.",
    });
  }
};
