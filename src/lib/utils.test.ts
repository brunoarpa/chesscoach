import { describe, it, expect } from "vitest";
import { getEffectiveAvailability } from "@/lib/utils";

describe("getEffectiveAvailability", () => {
  it("is UNAVAILABLE when the coach has set no price", () => {
    expect(getEffectiveAvailability("AVAILABLE", null, null)).toBe("UNAVAILABLE");
    expect(getEffectiveAvailability("AVAILABLE", 0, 0)).toBe("UNAVAILABLE");
  });

  it("counts a chat-only or call-only price as having a price", () => {
    expect(getEffectiveAvailability("AVAILABLE", 500, null)).toBe("AVAILABLE");
    expect(getEffectiveAvailability("AVAILABLE", null, 800)).toBe("AVAILABLE");
  });

  it("returns the coach's stated availability regardless of presence", () => {
    expect(getEffectiveAvailability("AVAILABLE", 500)).toBe("AVAILABLE");
    expect(getEffectiveAvailability("UNAVAILABLE", 500)).toBe("UNAVAILABLE");
  });

  it("respects an explicit UNAVAILABLE even with a price set", () => {
    expect(getEffectiveAvailability("UNAVAILABLE", 500)).toBe("UNAVAILABLE");
  });
});
