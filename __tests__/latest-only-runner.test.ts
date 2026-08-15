// tamtam inspected 2026-05-21
import { describe, expect, it } from "vitest";
import { createLatestOnlyRunner } from "@/lib/latest-only-runner";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("createLatestOnlyRunner", () => {
  it("ignores stale success and settled callbacks when a newer run starts", async () => {
    const runner = createLatestOnlyRunner<Record<string, { rating: number | null; year: number | null }>>();
    const first = createDeferred<Record<string, { rating: number | null; year: number | null }>>();
    const second = createDeferred<Record<string, { rating: number | null; year: number | null }>>();
    const events: string[] = [];
    let applied: Record<string, { rating: number | null; year: number | null }> = {};

    const firstRun = runner.run(
      () => first.promise,
      {
        onStart: () => events.push("first-start"),
        onSuccess: (result) => {
          applied = result;
          events.push("first-success");
        },
        onSettled: () => events.push("first-settled"),
      },
    );

    const secondRun = runner.run(
      () => second.promise,
      {
        onStart: () => events.push("second-start"),
        onSuccess: (result) => {
          applied = result;
          events.push("second-success");
        },
        onSettled: () => events.push("second-settled"),
      },
    );

    first.resolve({ Alpha: { rating: 7.1, year: 2001 } });
    await firstRun;

    expect(applied).toEqual({});
    expect(events).toEqual(["first-start", "second-start"]);

    second.resolve({ Beta: { rating: 8.4, year: 2004 } });
    await secondRun;

    expect(applied).toEqual({ Beta: { rating: 8.4, year: 2004 } });
    expect(events).toEqual([
      "first-start",
      "second-start",
      "second-success",
      "second-settled",
    ]);
  });

  it("ignores stale error and settled callbacks after invalidate", async () => {
    const runner = createLatestOnlyRunner<string>();
    const deferred = createDeferred<string>();
    const events: string[] = [];

    const run = runner.run(
      () => deferred.promise,
      {
        onStart: () => events.push("start"),
        onError: () => events.push("error"),
        onSettled: () => events.push("settled"),
        onSuccess: () => events.push("success"),
      },
    );

    runner.invalidate();
    deferred.reject(new Error("stale"));
    await run;

    expect(events).toEqual(["start"]);
  });
});
