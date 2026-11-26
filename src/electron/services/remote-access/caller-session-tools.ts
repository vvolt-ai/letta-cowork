/** These tools use the active app's Vera identity. A remote runner must not
 * borrow its machine owner's API login for an unrelated invoking principal.
 * Native remote operations are invoked from the verified caller's Vera bridge. */
export const CALLER_SESSION_ONLY_TOOLS = new Set(['SafetyAuditListOwn', 'VeraMcpListTools', 'VeraMcpCallTool']);
