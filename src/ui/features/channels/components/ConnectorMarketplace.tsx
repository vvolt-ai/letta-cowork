import { useCallback, useEffect, useMemo, useState } from 'react';

type ConnectorCapabilities = {
  accountConnector: boolean;
  routeConnector: boolean;
  inboundText: boolean;
  outboundText: boolean;
  attachments: boolean;
  groups: boolean;
  typingIndicator: boolean;
};

type ConnectorProviderSummary = {
  provider: string;
  displayName: string;
  version?: string;
  builtIn: boolean;
  description?: string;
  capabilities: ConnectorCapabilities;
  installed: boolean;
  loaded: boolean;
};

type ConnectorMarketplacePlugin = {
  id: string;
  name: string;
  description?: string;
  version: string;
  provider: string;
  artifactUrl?: string;
  checksum?: string;
  capabilities: ConnectorCapabilities;
  installed?: boolean;
  loaded?: boolean;
};

const getApi = () => window.electron;

function capabilityLabels(capabilities: ConnectorCapabilities): string[] {
  const labels: string[] = [];
  if (capabilities.accountConnector) labels.push('Account');
  if (capabilities.routeConnector) labels.push('Routes');
  if (capabilities.inboundText) labels.push('Inbound');
  if (capabilities.outboundText) labels.push('Outbound');
  if (capabilities.attachments) labels.push('Attachments');
  if (capabilities.groups) labels.push('Groups');
  return labels;
}

interface ConnectorMarketplaceProps {
  onAddChannel: () => void;
}

export function ConnectorMarketplace({ onAddChannel }: ConnectorMarketplaceProps) {
  const [providers, setProviders] = useState<ConnectorProviderSummary[]>([]);
  const [plugins, setPlugins] = useState<ConnectorMarketplacePlugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingPluginId, setInstallingPluginId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const installedProviders = useMemo(
    () => new Set(providers.map((provider) => provider.provider)),
    [providers]
  );

  const testCreatableProviders = useMemo(() => new Set(['gmail']), []);

  const load = useCallback(async () => {
    const api = getApi();
    setLoading(true);
    setError(null);
    try {
      const [providerResult, marketplaceResult] = await Promise.all([
        api.apiListConnectorProviders(),
        api.apiListConnectorMarketplace(),
      ]);

      if (!providerResult.success) {
        throw new Error(providerResult.error || 'Failed to load connector providers');
      }
      if (!marketplaceResult.success) {
        throw new Error(marketplaceResult.error || 'Failed to load connector marketplace');
      }

      setProviders((providerResult.providers || []) as ConnectorProviderSummary[]);
      setPlugins((marketplaceResult.plugins || []) as ConnectorMarketplacePlugin[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const installPlugin = async (plugin: ConnectorMarketplacePlugin) => {
    if (!plugin.artifactUrl) {
      setNotice(`${plugin.name} is listed as a planned connector, but no installable artifact is published yet.`);
      return;
    }

    const api = getApi();
    setInstallingPluginId(plugin.id);
    setError(null);
    setNotice(null);
    try {
      const result = await api.apiInstallConnectorPlugin({
        pluginId: plugin.id,
        version: plugin.version,
        source: plugin.artifactUrl
          ? {
              type: 'marketplace',
              artifactUrl: plugin.artifactUrl,
              checksum: plugin.checksum,
            }
          : { type: 'marketplace' },
      });

      if (!result.success) {
        throw new Error(result.error || `Failed to install ${plugin.name}`);
      }

      setNotice(`${plugin.name} installed.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingPluginId(null);
    }
  };

  return (
    <div className="mb-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Connector marketplace</h3>
          <p className="text-xs text-slate-500">
            Install server-side connector plugins, then create connector/channel instances.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 p-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available to install</h4>
            </div>
            {plugins.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No marketplace plugins returned by the server.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {plugins.map((plugin) => {
                  const installed = plugin.installed || installedProviders.has(plugin.provider);
                  const testCreatable = testCreatableProviders.has(plugin.provider);
                  const labels = capabilityLabels(plugin.capabilities);
                  return (
                    <div key={plugin.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{plugin.name}</div>
                          <div className="text-xs text-slate-500">{plugin.provider} · {plugin.version}</div>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${installed || testCreatable ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {installed ? 'Installed' : testCreatable ? 'Test provider' : 'Available'}
                        </span>
                      </div>
                      {plugin.description && <p className="mt-2 text-sm text-slate-600">{plugin.description}</p>}
                      <div className="mt-3 flex flex-wrap gap-1">
                        {labels.map((label) => (
                          <span key={label} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                            {label}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        {installed || testCreatable ? (
                          <button
                            type="button"
                            onClick={onAddChannel}
                            className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
                          >
                            {testCreatable && !installed ? 'Add test connector' : 'Add connector'}
                          </button>
                        ) : !plugin.artifactUrl ? (
                          <button
                            type="button"
                            onClick={() => setNotice(`${plugin.name} needs a published plugin artifact before it can be installed from Cowork.`)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                          >
                            Coming soon
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => installPlugin(plugin)}
                            disabled={installingPluginId === plugin.id}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {installingPluginId === plugin.id ? 'Installing…' : 'Install'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Installed providers</h4>
            <div className="flex flex-wrap gap-2">
              {providers.map((provider) => (
                <span key={provider.provider} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                  {provider.displayName}{provider.builtIn ? ' · built-in' : ''}
                </span>
              ))}
              {providers.length === 0 && <span className="text-sm text-slate-500">No providers loaded.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
