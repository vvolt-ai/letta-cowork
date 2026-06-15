import type { BaseHttpClient } from "../client/base-client.js";

export interface ConnectorCapabilities {
  accountConnector: boolean;
  routeConnector: boolean;
  inboundText: boolean;
  outboundText: boolean;
  attachments: boolean;
  groups: boolean;
  typingIndicator: boolean;
}

export interface ConnectorProviderSummary {
  provider: string;
  displayName: string;
  version?: string;
  apiVersion: "connectors.v1";
  builtIn: boolean;
  description?: string;
  capabilities: ConnectorCapabilities;
  configSchema?: Record<string, unknown>;
  credentialsSchema?: Record<string, unknown>;
  installed: boolean;
  loaded: boolean;
}

export interface ConnectorMarketplacePlugin {
  id: string;
  name: string;
  description?: string;
  version: string;
  provider: string;
  apiVersion: "connectors.v1";
  artifactUrl?: string;
  checksum?: string;
  capabilities: ConnectorCapabilities;
  installed?: boolean;
  loaded?: boolean;
}

export interface InstallConnectorPluginInput {
  pluginId: string;
  version?: string;
  source?: {
    type: "marketplace" | "artifact_url" | "local_directory";
    artifactUrl?: string;
    checksum?: string;
    localDirectory?: string;
  };
}

export class ConnectorEndpoints {
  static async listConnectorProviders(client: BaseHttpClient): Promise<{ providers: ConnectorProviderSummary[] }> {
    return client.request("/connectors/providers");
  }

  static async listConnectorMarketplace(client: BaseHttpClient): Promise<{ plugins: ConnectorMarketplacePlugin[] }> {
    return client.request("/connectors/marketplace");
  }

  static async listConnectorPlugins(client: BaseHttpClient): Promise<{
    providers: ConnectorProviderSummary[];
    plugins: unknown[];
  }> {
    return client.request("/connectors/plugins");
  }

  static async installConnectorPlugin(client: BaseHttpClient, input: InstallConnectorPluginInput): Promise<unknown> {
    return client.request("/connectors/plugins/install", {
      method: "POST",
      body: input,
    });
  }
}
