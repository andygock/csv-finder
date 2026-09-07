import type { Delimiter, Query } from "./data.ts";
import type { WorkerRequest, WorkerResponse } from "./protocol.ts";

type WorkerPort = Pick<
  Worker,
  "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror"
>;

/** Owns worker lifetime independently of React. Every import gets a fresh worker;
 * source identity and query IDs guard against messages already queued at Clear. */
export class DatasetSession {
  private worker: WorkerPort | null = null;
  private pending: ((success: boolean) => void) | null = null;
  private queryId = 0;
  private readonly createWorker: () => WorkerPort;
  private readonly notify: (message: WorkerResponse) => void;

  constructor(createWorker: () => WorkerPort, notify: (message: WorkerResponse) => void) {
    this.createWorker = createWorker;
    this.notify = notify;
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    this.queryId++;
    this.pending?.(false);
    this.pending = null;
  }

  invalidateQuery(): number {
    return ++this.queryId;
  }

  query(id: number, query: Query): void {
    if (id === this.queryId)
      this.worker?.postMessage({ type: "query", id, query } satisfies WorkerRequest);
  }

  load(source: File | string, delimiter: Delimiter): Promise<boolean> {
    this.stop();
    return new Promise((resolve) => {
      this.pending = resolve;
      try {
        const active = this.createWorker();
        this.worker = active;
        const fail = (message: string) => {
          if (this.worker !== active) return;
          this.stop();
          this.notify({ type: "error", message });
        };
        active.onerror = () =>
          fail("The data worker stopped unexpectedly. Try a smaller file or reload the page.");
        active.onmessageerror = () =>
          fail("Could not receive the processed data. Try a smaller file.");
        active.onmessage = ({ data: message }: MessageEvent<WorkerResponse>) => {
          if (this.worker !== active) return;
          if (message.type === "error") {
            fail(message.message);
            return;
          }
          if (message.type === "page" && message.id !== this.queryId) return;
          if (message.type === "loaded") {
            this.pending?.(true);
            this.pending = null;
          }
          this.notify(message);
        };
        active.postMessage({ type: "load", source, delimiter } satisfies WorkerRequest);
      } catch {
        this.stop();
        this.notify({
          type: "error",
          message: "Could not start local data processing. Reload the page and try again.",
        });
      }
    });
  }
}
