// tamtam inspected 2026-05-21
export interface LatestOnlyRunCallbacks<T> {
  onStart?: () => void;
  onSuccess: (result: T) => void;
  onError?: () => void;
  onSettled?: () => void;
}

export interface LatestOnlyRunner<T> {
  invalidate: () => void;
  run: (
    task: () => Promise<T>,
    callbacks: LatestOnlyRunCallbacks<T>,
  ) => Promise<void>;
}

export function createLatestOnlyRunner<T>(): LatestOnlyRunner<T> {
  let activeRunId = 0;

  return {
    invalidate() {
      activeRunId += 1;
    },
    async run(task, callbacks) {
      const runId = activeRunId + 1;
      activeRunId = runId;

      callbacks.onStart?.();

      try {
        const result = await task();
        if (activeRunId !== runId) return;
        callbacks.onSuccess(result);
      } catch {
        if (activeRunId !== runId) return;
        callbacks.onError?.();
      } finally {
        if (activeRunId === runId) {
          callbacks.onSettled?.();
        }
      }
    },
  };
}
