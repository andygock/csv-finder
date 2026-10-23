// Node adapter for exercising the production browser-worker protocol. This file
// is used only by benchmarks/tests; it is never bundled into the application.
import { parentPort } from "node:worker_threads";
let peakHeap = 0,
  peakArrays = 0,
  maxGap = 0,
  lastTick = performance.now();
function sample() {
  const memory = process.memoryUsage();
  peakHeap = Math.max(peakHeap, memory.heapUsed);
  peakArrays = Math.max(peakArrays, memory.arrayBuffers);
}
globalThis.postMessage = (message) => {
  sample();
  parentPort.postMessage(message);
};
await import("../src/data.worker.ts");
setInterval(() => {
  const now = performance.now();
  maxGap = Math.max(maxGap, now - lastTick);
  lastTick = now;
  sample();
}, 10).unref();
parentPort.on("message", async (data) => {
  if (data.type === "__metrics") {
    sample();
    parentPort.postMessage({ type: "__metrics", peakHeap, peakArrays, maxGap });
    return;
  }
  await globalThis.onmessage({ data });
  // Acknowledgement measures when a cancel message was actually processed,
  // rather than treating local UI invalidation as completed worker cancellation.
  if (data.type === "cancel") parentPort.postMessage({ type: "__cancelled", id: data.id });
});
parentPort.postMessage({ type: "__ready" });
