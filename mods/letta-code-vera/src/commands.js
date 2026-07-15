import { VeraApiError } from "./client.js";

function output(text, success = true) {
  return { type: "output", output: text, success };
}

function displayName(value) {
  if (!value || typeof value !== "object") return null;
  return (
    value.name ||
    [value.firstName, value.lastName].filter(Boolean).join(" ") ||
    value.email ||
    null
  );
}

function errorText(error) {
  if (error instanceof VeraApiError && error.status) {
    return `Vera returned HTTP ${error.status}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function connectionSummary(client) {
  const [state, connection] = await Promise.all([
    client.getState(),
    client.getConnectionInfo(),
  ]);
  if (!connection.connected) {
    const pending = connection.pendingEmail
      ? `\nOTP pending for: ${connection.pendingEmail}`
      : "";
    return `Vera is not connected.\nServer: ${connection.serverUrl}${pending}`;
  }

  const [profile, tools, channels] = await Promise.allSettled([
    client.getProfile(),
    client.listMcpTools(),
    client.listChannels(),
  ]);

  const user =
    profile.status === "fulfilled"
      ? displayName(profile.value)
      : displayName(state.auth?.user);
  const organization =
    profile.status === "fulfilled"
      ? profile.value?.currentOrganization?.organization?.name ||
        profile.value?.currentOrganization?.name
      : state.auth?.currentOrganization?.organization?.name ||
        state.auth?.currentOrganization?.name;

  return [
    "Vera is connected.",
    `Authentication: ${connection.source === "cowork" ? "Cowork session" : "Letta Code session"}`,
    `Server: ${connection.serverUrl}`,
    `User: ${user || "authenticated user"}`,
    `Organization: ${organization || "current organization"}`,
    `MCP tools: ${tools.status === "fulfilled" ? tools.value.length : "unavailable"}`,
    `Channels: ${channels.status === "fulfilled" ? channels.value.length : "unavailable"}`,
  ].join("\n");
}

function parseConnectArguments(argv) {
  const values = [...argv];
  let serverUrl = null;

  if (values[0] === "--server") {
    values.shift();
    serverUrl = values.shift() || null;
  } else if (/^https?:\/\//i.test(values[0] || "")) {
    serverUrl = values.shift();
  }

  return { serverUrl, credential: values.shift() || null, extra: values };
}

export function registerCommands(letta, client) {
  if (!letta.capabilities.commands) return [];

  const disposers = [];

  disposers.push(
    letta.commands.register({
      id: "vera-connect",
      description: "Connect Letta Code to Vera using Cowork or email OTP authentication.",
      args: "[--server <url>] [email|otp]",
      showInTranscript: false,
      async run(context) {
        try {
          const { serverUrl, credential, extra } = parseConnectArguments(
            context.argv,
          );
          if (extra.length > 0) {
            return output("Too many arguments. Run /vera-connect for usage.", false);
          }

          if (serverUrl) await client.setServerUrl(serverUrl);
          const state = await client.getState();
          const connection = await client.getConnectionInfo();

          if (!credential) {
            if (connection.connected) return output(await connectionSummary(client));
            if (state.pendingEmail) {
              return output(
                `An OTP was sent to ${state.pendingEmail}.\n` +
                  "Enter it with: /vera-connect <six-digit-otp>\n" +
                  "This command is excluded from the conversation transcript.",
              );
            }
            return output(
              [
                "Connect to Vera with email OTP:",
                "  /vera-connect user@verivolt.com",
                "",
                `Current server: ${state.serverUrl}`,
                "Use another server:",
                "  /vera-connect --server https://vera.example.com user@verivolt.com",
              ].join("\n"),
            );
          }

          if (/^\d{6}$/.test(credential)) {
            const auth = await client.verifyOtp(credential);
            const [tools, channels] = await Promise.all([
              client.listMcpTools(),
              client.listChannels(),
            ]);
            return output(
              [
                "Connected to Vera.",
                `User: ${displayName(auth.user) || "authenticated user"}`,
                `MCP tools available: ${tools.length}`,
                `Channels available: ${channels.length}`,
              ].join("\n"),
            );
          }

          if (/^\S+@\S+\.\S+$/.test(credential)) {
            const result = await client.requestOtp(credential);
            return output(
              [
                `Vera accepted the OTP request for ${result.email}.`,
                result.message ||
                  "For security, this response does not confirm account status or email delivery.",
                "If the account is active and mail delivery is configured, enter the received code with:",
                "  /vera-connect <six-digit-otp>",
                "The command is excluded from the conversation transcript.",
              ].join("\n"),
            );
          }

          return output(
            "Expected an email address or six-digit OTP. Run /vera-connect for usage.",
            false,
          );
        } catch (error) {
          return output(`Vera connection failed: ${errorText(error)}`, false);
        }
      },
    }),
  );

  disposers.push(
    letta.commands.register({
      id: "vera-status",
      description: "Show Vera authentication and capability status.",
      showInTranscript: false,
      async run() {
        try {
          return output(await connectionSummary(client));
        } catch (error) {
          return output(`Unable to read Vera status: ${errorText(error)}`, false);
        }
      },
    }),
  );

  disposers.push(
    letta.commands.register({
      id: "vera-sync",
      description: "Refresh Vera authentication and capability counts.",
      showInTranscript: false,
      async run() {
        try {
          const [tools, channels] = await Promise.all([
            client.listMcpTools(),
            client.listChannels(),
          ]);
          return output(
            `Vera capabilities synchronized.\nMCP tools: ${tools.length}\nChannels: ${channels.length}`,
          );
        } catch (error) {
          return output(`Vera synchronization failed: ${errorText(error)}`, false);
        }
      },
    }),
  );

  disposers.push(
    letta.commands.register({
      id: "vera-tools",
      description: "List MCP tool names currently available through Vera.",
      args: "[filter]",
      showInTranscript: false,
      async run(context) {
        try {
          const filter = context.args.trim().toLowerCase();
          const tools = (await client.listMcpTools()).filter((tool) => {
            if (!filter) return true;
            return `${tool.name || ""} ${tool.description || ""}`
              .toLowerCase()
              .includes(filter);
          });
          if (tools.length === 0) return output("No matching Vera MCP tools.");
          return output(
            tools
              .slice(0, 100)
              .map((tool) => `- ${tool.name}: ${tool.description || "No description"}`)
              .join("\n") +
              (tools.length > 100 ? `\n… ${tools.length - 100} more` : ""),
          );
        } catch (error) {
          return output(`Unable to list Vera tools: ${errorText(error)}`, false);
        }
      },
    }),
  );

  disposers.push(
    letta.commands.register({
      id: "vera-disconnect",
      description: "Remove Letta Code-managed Vera credentials; Cowork sessions remain managed by Cowork.",
      showInTranscript: false,
      async run() {
        try {
          const result = await client.logout();
          if (result.coworkManaged) {
            return output(
              result.hadLocalAuth
                ? "Removed the Letta Code-managed Vera credentials. Cowork authentication remains active; log out in Cowork to disconnect it."
                : "Vera authentication is managed by Cowork. Log out in Cowork to disconnect it.",
            );
          }
          return output("Disconnected from Vera and removed local credentials.");
        } catch (error) {
          return output(
            `Local Vera credentials were removed. Server logout reported: ${errorText(error)}`,
          );
        }
      },
    }),
  );

  return disposers;
}
