import { DataEngine, MAX_CELLS, MAX_COLUMNS, MAX_FILE_BYTES, parseProblem } from "./data.ts";
import { parseInput } from "./parseInput.ts";
import type { WorkerRequest, WorkerResponse } from "./protocol.ts";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<WorkerRequest>) => void;
  postMessage: (message: WorkerResponse) => void;
};
let engine: DataEngine | null = null;
let latestQuery = 0;
const send = (message: WorkerResponse) => scope.postMessage(message);

scope.onmessage = async ({ data: request }) => {
  try {
    if (request.type === "query") {
      latestQuery = request.id;
      const page = await engine?.query(request.query, () => latestQuery === request.id);
      if (page && latestQuery === request.id) send({ type: "page", id: request.id, page });
      return;
    }

    // One worker per import: terminating it cancels all processing and releases
    // the dataset immediately. A replacement never shares this worker's state.
    engine = null;
    const bytes =
      typeof request.source === "string" ? new Blob([request.source]).size : request.source.size;
    if (bytes > MAX_FILE_BYTES)
      throw new Error("This import exceeds the 256 MiB limit. Split the file into smaller parts.");
    if (!bytes) throw new Error("The input is empty.");
    const rows: string[][] = [];
    let cells = 0;
    let detectedWarning = false;
    let ragged = false;
    let lastProgress = 0;
    await parseInput(request.source, request.delimiter, (result) => {
      const problem = parseProblem(result.errors, rows.length);
      if (problem) throw new Error(problem);
      detectedWarning ||= result.errors.some((error) => error.code === "UndetectableDelimiter");
      for (const row of result.data) {
        cells += row.length;
        if (cells > MAX_CELLS || row.length > MAX_COLUMNS)
          throw new Error(
            "The input exceeds 5 million cells or 1,000 columns. Split it into smaller parts.",
          );
        if (rows.length && row.some((cell) => cell.trim()) && row.length !== rows[0].length)
          ragged = true;
        rows.push(row);
      }
      if (performance.now() - lastProgress > 100) {
        send({ type: "progress", rows: rows.length });
        lastProgress = performance.now();
      }
    });
    if (!rows.some((row) => row.some((cell) => cell.trim())))
      throw new Error("The input contains no non-empty cells.");
    engine = new DataEngine(rows);
    const warning = [
      detectedWarning
        ? "Delimiter could not be detected; comma was used. Choose a delimiter if the columns look incorrect."
        : "",
      ragged
        ? "Some records have different numbers of fields. Missing cells are shown as blank."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    send({ type: "loaded", rows: rows.length, warning });
  } catch (error) {
    send({
      type: "error",
      message: error instanceof Error ? error.message : "Processing failed. Try a smaller file.",
    });
  }
};
