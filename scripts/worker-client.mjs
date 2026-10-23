// Promise-based protocol receiver shared by the benchmark and real-worker tests.
export function receive(worker, type, id) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      worker.off("message", message);
      worker.off("error", failed);
    };
    const failed = (error) => {
      cleanup();
      reject(error);
    };
    const message = (value) => {
      if (value.type === "error") failed(new Error(value.message));
      else if (value.type === type && (id === undefined || value.id === id)) {
        cleanup();
        resolve(value);
      }
    };
    const timer = setTimeout(() => failed(new Error(`Timed out waiting for ${type}`)), 30_000);
    worker.on("message", message);
    worker.on("error", failed);
  });
}
