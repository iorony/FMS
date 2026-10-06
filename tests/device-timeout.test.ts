import { afterEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "../mobile/lib/with-timeout";

afterEach(() => vi.useRealTimers());
describe("device operation timeout", () => {
  it("releases a stalled operation", async () => {
    vi.useFakeTimers();
    const result = withTimeout(new Promise<never>(() => {}), 20000, "El GPS no respondió.");
    const assertion = expect(result).rejects.toThrow("El GPS no respondió.");
    await vi.advanceTimersByTimeAsync(20000);
    await assertion;
  });
  it("returns an available result and clears the timer", async () => {
    vi.useFakeTimers();
    expect(await withTimeout(Promise.resolve("location"), 20000, "timeout")).toBe("location");
    expect(vi.getTimerCount()).toBe(0);
  });
});
