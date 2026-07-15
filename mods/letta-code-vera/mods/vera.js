import { VeraClient } from "../src/client.js";
import { registerCommands } from "../src/commands.js";
import { registerTools } from "../src/tools.js";

/**
 * Native Letta Code mod entrypoint.
 *
 * The client remains inside this trusted local mod closure. Agents receive
 * tool schemas and results, never bearer or refresh tokens.
 */
export default function activate(letta) {
  const client = new VeraClient();
  const disposers = [
    ...registerCommands(letta, client),
    ...registerTools(letta, client),
  ];

  return () => {
    for (const dispose of disposers.reverse()) {
      try {
        dispose();
      } catch {
        // Letta Code owns reload diagnostics; cleanup must remain best-effort.
      }
    }
  };
}
