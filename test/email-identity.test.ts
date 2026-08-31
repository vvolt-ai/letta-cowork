import { describe, expect, test } from "bun:test";

import {
  emailIdentityKeyFromParts,
  emailSessionMarkerFromParts,
} from "../src/ui/features/email/emailIdentity";

describe("Cowork email identity", () => {
  test("isolates identical message ids across accounts and folders", () => {
    const first = emailIdentityKeyFromParts("account-a", "inbox", "42");
    const otherAccount = emailIdentityKeyFromParts("account-b", "inbox", "42");
    const otherFolder = emailIdentityKeyFromParts("account-a", "archive", "42");

    expect(first).not.toBe(otherAccount);
    expect(first).not.toBe(otherFolder);
  });

  test("is stable for equivalent string identities", () => {
    expect(emailIdentityKeyFromParts(" account-a ", "inbox", 42)).toBe(
      emailIdentityKeyFromParts("account-a", "inbox", "42")
    );
  });

  test("uses an exact mailbox-scoped marker instead of subject matching", () => {
    expect(
      emailSessionMarkerFromParts("account-a", "inbox", "message-123")
    ).toBe("[email:account-a|inbox|message-123]");
    expect(
      emailSessionMarkerFromParts("account-b", "inbox", "message-123")
    ).not.toBe(emailSessionMarkerFromParts("account-a", "inbox", "message-123"));
  });
});
