import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDate, isToday, relativeDay } from "../mobile/lib/format";

afterEach(() => vi.useRealTimers());

describe("mobile calendar dates in Guatemala", () => {
  it("preserves the SQL calendar day instead of shifting it to the previous day", () => {
    expect(formatDate("2026-10-05")).toMatch(/^05\b/);
    expect(formatDate("2026-01-01")).toMatch(/^01\b/);
    expect(formatDate("2024-02-29")).toMatch(/^29\b/);
  });

  it("still converts timestamps to the Guatemala calendar day", () => {
    expect(formatDate("2026-10-05T00:00:00Z")).toMatch(/^04\b/);
  });

  it("shows a placeholder for an absent date", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("uses Guatemala midnight rather than UTC midnight for today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T05:59:00Z"));
    expect(isToday("2026-10-05T23:00:00Z")).toBe(true);
    expect(relativeDay("2026-10-05T23:00:00Z")).toBe("hoy");
    vi.setSystemTime(new Date("2026-10-06T06:01:00Z"));
    expect(isToday("2026-10-05T23:00:00Z")).toBe(false);
    expect(relativeDay("2026-10-05T23:00:00Z")).toBe("ayer");
    expect(isToday("2026-10-06T07:00:00Z")).toBe(true);
  });
});
