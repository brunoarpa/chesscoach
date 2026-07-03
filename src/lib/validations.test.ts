import { describe, it, expect } from "vitest";
import { directMessageSchema, MAX_DIRECT_MESSAGE_LENGTH } from "@/lib/validations";

describe("directMessageSchema", () => {
  it("accepts a normal message and trims it", () => {
    const result = directMessageSchema.safeParse({ content: "  hello coach  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.content).toBe("hello coach");
  });

  it("rejects an empty or whitespace-only message", () => {
    expect(directMessageSchema.safeParse({ content: "" }).success).toBe(false);
    expect(directMessageSchema.safeParse({ content: "   " }).success).toBe(false);
  });

  it("accepts a message exactly at the length limit", () => {
    const content = "a".repeat(MAX_DIRECT_MESSAGE_LENGTH);
    expect(directMessageSchema.safeParse({ content }).success).toBe(true);
  });

  it("rejects a message over the length limit", () => {
    const content = "a".repeat(MAX_DIRECT_MESSAGE_LENGTH + 1);
    expect(directMessageSchema.safeParse({ content }).success).toBe(false);
  });
});
