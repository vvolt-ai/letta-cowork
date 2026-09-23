import { describe, expect, test } from "bun:test";

import {
  getLettaRuntimeRequestBase,
  selectLettaRuntimeSource,
} from "../src/electron/services/letta-runtime/index";

describe("Letta runtime source priority", () => {
  test("prefers a local Letta API token over Vera runtime access", () => {
    expect(selectLettaRuntimeSource("local-token", "vera-token")).toBe("local");
  });

  test("falls back to Vera when the local token is absent or blank", () => {
    expect(selectLettaRuntimeSource(undefined, "vera-token")).toBe("vera");
    expect(selectLettaRuntimeSource("   ", "vera-token")).toBe("vera");
  });

  test("reports no runtime when neither credential exists", () => {
    expect(selectLettaRuntimeSource(undefined, undefined)).toBeNull();
    expect(selectLettaRuntimeSource("", " ")).toBeNull();
  });

  test("adds /v1 only to direct local API request bases", () => {
    expect(
      getLettaRuntimeRequestBase({
        source: "local",
        baseURL: "https://api.letta.com/",
      }),
    ).toBe("https://api.letta.com/v1");
    expect(
      getLettaRuntimeRequestBase({
        source: "local",
        baseURL: "https://api.letta.com/v1",
      }),
    ).toBe("https://api.letta.com/v1");
    expect(
      getLettaRuntimeRequestBase({
        source: "vera",
        baseURL: "https://vera.example.com/letta/runtime/",
      }),
    ).toBe("https://vera.example.com/letta/runtime");
  });
});
