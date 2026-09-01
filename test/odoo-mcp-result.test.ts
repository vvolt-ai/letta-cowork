import { expect, test } from "bun:test";

import { isOdooFailureResult } from "../src/electron/services/client-tools/runners/odooMcp";

test("classifies semantic Odoo failures as tool errors", () => {
  expect(isOdooFailureResult({ ok: false, error: "ODOO_MCP_INPUT_VALIDATION" })).toBe(true);
  expect(isOdooFailureResult({ ok: true, records: [] })).toBe(false);
  expect(isOdooFailureResult([])).toBe(false);
});
