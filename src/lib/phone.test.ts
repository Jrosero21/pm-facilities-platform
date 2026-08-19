import { describe, expect, it } from "vitest";
import { formatPhone } from "@/lib/phone";

describe("formatPhone", () => {
  it.each([
    ["5551234567", "(555) 123-4567"],
    ["555-123-4567", "(555) 123-4567"],
    ["(555) 123-4567", "(555) 123-4567"],
    ["555.123.4567", "(555) 123-4567"],
  ])("formats the 10-digit %s", (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });

  it.each([
    ["15551234567", "+1 (555) 123-4567"],
    ["+1 555 123 4567", "+1 (555) 123-4567"],
    ["1-555-123-4567", "+1 (555) 123-4567"],
  ])("formats the 11-digit %s", (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });

  it.each([
    ["5551234567 x89", "(555) 123-4567 x89"],
    ["555-123-4567 ext 200", "(555) 123-4567 x200"],
    ["(555)1234567 X9", "(555) 123-4567 x9"],
  ])("keeps the extension on %s", (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });

  // Non-conforming input is returned trimmed and otherwise UNCHANGED — never mangled.
  it.each([
    ["+44 20 7946 0958", "+44 20 7946 0958"],
    ["  555 1234  ", "555 1234"],
    ["12345678901234", "12345678901234"],
    ["abc", "abc"],
  ])("passes %s through untouched", (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });

  it.each([[null], [undefined], [""]])("renders the em dash for %s", (input) => {
    expect(formatPhone(input as string | null | undefined)).toBe("—");
  });
});
