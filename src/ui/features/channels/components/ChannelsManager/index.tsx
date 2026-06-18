import { useEffect, useMemo, useState } from 'react';
import { Channel, ChannelsManagerProps } from '../types';
import { useChannelBridge } from '../hooks/useChannelBridge';
import { useChannelManager } from '../hooks/useChannelManager';
import { ChannelList } from '../ChannelList';
import { CreateChannelModal } from '../CreateChannelModal';
import { CredentialsModal } from '../CredentialsModal';
import { ConfigModal } from '../ConfigModal';
import { ConnectorMarketplace } from '../ConnectorMarketplace';
import { getProviderIcon } from '../ChannelCard';

type ConfigSection = 'console' | 'channels' | 'marketplace' | 'credentials' | 'agents';

export function ChannelsManager({ onAuthError }: ChannelsManagerProps) {
  const [activeSection, setActiveSection] = useState<ConfigSection>('console');
  const {
    channels,
    organizationChannels,
    statuses,
    loading,
    error,
    loadChannels,
    loadStatuses,
    clearError,
  } = useChannelBridge(onAuthError);

  const {
    agents,
    loadAgents,
    // Create channel
    showCreateModal,
    setShowCreateModal,
    // Delete
    handleDeleteChannel,
    // Start/Stop
    handleStartChannel,
    handleStopChannel,
    // Credentials
    showCredentialsModal,
    setShowCredentialsModal,
    selectedChannel,
    credentials,
    setCredentials,
    savingCredentials,
    handleOpenCredentials,
    handleSaveCredentials,
    // Config
    showConfigModal,
    setShowConfigModal,
    configChannel,
    configData,
    setConfigData,
    savingConfig,
    handleOpenConfig,
    handleSaveConfig,
  } = useChannelManager(loadChannels, loadStatuses, clearError);

  // Load agents on mount
  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // Start/Stop handlers with channels
  const onStart = (channelId: string) => handleStartChannel(channelId, channels);
  const onStop = (channelId: string) => handleStopChannel(channelId, channels);

  const connectedChannels = useMemo(
    () => channels.filter((channel) => statuses[channel.id]?.status === 'connected').length,
    [channels, statuses],
  );
  const configuredCredentials = channels.filter((channel) => channel.hasCredentials).length;
  const autoStartChannels = channels.filter((channel) => Boolean(channel.config?.autoStart)).length;
  const setupProgress = Math.round(
    (((channels.length > 0 ? 1 : 0) + (connectedChannels > 0 ? 1 : 0) + (agents.length > 0 ? 1 : 0) + (configuredCredentials > 0 ? 1 : 0)) / 4) * 100,
  );

  const renderMiniChannel = (channel: Channel) => {
    const status = statuses[channel.id];
    const isConnected = status?.status === 'connected';
    return (
      <article key={channel.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-2xl">{getProviderIcon(channel.provider)}</span>
            <div>
              <h3 className="font-semibold text-slate-900">{channel.name}</h3>
              <p className="mt-0.5 text-xs text-slate-500 capitalize">{channel.provider} · Agent: {channel.config?.defaultAgentId ? String(channel.config.defaultAgentId).slice(0, 12) : 'Not selected'}</p>
              <span className={`mt-2 inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                <span className={`mr-1.5 h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {isConnected ? 'Connected' : status?.status || 'Stopped'}
              </span>
            </div>
          </div>
          <button onClick={() => handleOpenConfig(channel)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
        </div>
      </article>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <svg
          className="animate-spin h-6 w-6 text-blue-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" />
          <path className="opacity-75" d="M4 12a8 8 0 018-8" />
        </svg>
        <span className="ml-2 text-slate-600">Loading channels...</span>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-slate-50">
      <div className="grid min-h-[70vh] grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-r border-slate-200 bg-white p-5">
          <div className="mb-8 flex items-center gap-2 text-blue-600">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-600 font-black text-white">V</span>
            <strong className="text-sm tracking-wide">COWORK CONFIG</strong>
          </div>
          <nav className="grid gap-2">
            <button className={`rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${activeSection === 'console' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`} onClick={() => setActiveSection('console')}>▣ Console</button>
            <button className={`rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${activeSection === 'channels' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`} onClick={() => setActiveSection('channels')}>💬 Channels</button>
            <button className={`rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${activeSection === 'marketplace' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`} onClick={() => setActiveSection('marketplace')}>🧩 Add connectors</button>
            <button className={`rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${activeSection === 'credentials' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`} onClick={() => setActiveSection('credentials')}>🔐 Credentials</button>
            <button className={`rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${activeSection === 'agents' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`} onClick={() => setActiveSection('agents')}>🤖 Agents</button>
          </nav>
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-semibold text-slate-900">Configuration guide</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Use this console to connect apps, choose agents, save credentials, and control channel runtime.</p>
          </div>
        </aside>

        <section className="overflow-auto p-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">Cowork configuration</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">Manage connected apps and agent routing</h2>
              <p className="mt-1 text-sm text-slate-500">Configure how WhatsApp, Discord, Slack, Telegram, WeChat, Gmail, and email channels talk to Letta agents.</p>
            </div>
            <button onClick={() => setShowCreateModal(true)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">+ Add Channel</button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
              <button onClick={clearError} className="ml-2 font-bold text-red-500 hover:text-red-700">×</button>
            </div>
          )}

          {activeSection === 'console' && (
            <div className="grid gap-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Setup progress</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-950">Your Cowork channels are {setupProgress}% configured</h3>
                    <p className="mt-1 text-sm text-slate-500">Progress uses channel count, connected runtime, available agents, and saved credentials.</p>
                  </div>
                  <div className="min-w-40 text-center">
                    <strong className="text-3xl text-blue-600">{setupProgress}%</strong>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${setupProgress}%` }} /></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-500">Channels</p><strong className="mt-1 block text-3xl text-slate-950">{channels.length}</strong><span className="text-xs font-semibold text-emerald-600">{connectedChannels} connected</span></article>
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-500">Agents</p><strong className="mt-1 block text-3xl text-slate-950">{agents.length}</strong><span className="text-xs font-semibold text-blue-600">available</span></article>
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-500">Credentials</p><strong className="mt-1 block text-3xl text-slate-950">{configuredCredentials}</strong><span className="text-xs font-semibold text-amber-600">saved</span></article>
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-500">Auto-start</p><strong className="mt-1 block text-3xl text-slate-950">{autoStartChannels}</strong><span className="text-xs font-semibold text-violet-600">enabled</span></article>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-5">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div><h3 className="font-bold text-slate-950">Connected Channels</h3><p className="text-sm text-slate-500">Manage and monitor your configured platforms.</p></div>
                    <button onClick={() => setActiveSection('channels')} className="text-sm font-semibold text-blue-600">View all →</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {channels.slice(0, 6).map(renderMiniChannel)}
                    {!channels.length && <div className="col-span-2 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No channels yet. Add a channel to start routing messages.</div>}
                  </div>
                </section>

                <aside className="grid gap-4 content-start">
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="font-bold text-slate-950">Quick Actions</h3>
                    <button onClick={() => setShowCreateModal(true)} className="mt-4 block w-full border-t border-slate-100 py-3 text-left text-sm font-semibold text-slate-800">＋ Add New Channel</button>
                    <button onClick={() => setActiveSection('marketplace')} className="block w-full border-t border-slate-100 py-3 text-left text-sm font-semibold text-slate-800">🧩 Browse Connectors</button>
                    <button onClick={() => setActiveSection('credentials')} className="block w-full border-t border-slate-100 py-3 text-left text-sm font-semibold text-slate-800">🔐 Review Credentials</button>
                  </section>
                  <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                    <h3 className="font-bold text-slate-950">Need help?</h3>
                    <p className="mt-1 text-sm leading-5 text-slate-600">Each channel needs a provider, credentials if required, and a default agent before it can respond.</p>
                  </section>
                </aside>
              </div>
            </div>
          )}

          {activeSection === 'channels' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold text-slate-950">All Channels</h3><p className="text-sm text-slate-500">Start, stop, edit config, credentials, and delete channels.</p></div><button onClick={() => setShowCreateModal(true)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">+ Add Channel</button></div>
              <ChannelList channels={channels} statuses={statuses} onStart={onStart} onStop={onStop} onOpenCredentials={handleOpenCredentials} onOpenConfig={handleOpenConfig} onDelete={handleDeleteChannel} />
            </div>
          )}

          {activeSection === 'marketplace' && <ConnectorMarketplace onAddChannel={() => setShowCreateModal(true)} />}

          {activeSection === 'credentials' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-bold text-slate-950">Credential status</h3>
              <p className="mt-1 text-sm text-slate-500">Open a channel's credentials screen to add or rotate secrets for that provider.</p>
              <div className="mt-4 grid gap-3">
                {channels.map((channel) => <article key={channel.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4"><div><h4 className="font-semibold text-slate-900">{getProviderIcon(channel.provider)} {channel.name}</h4><p className="text-sm text-slate-500">{channel.hasCredentials ? 'Credentials saved' : 'No credentials saved'}</p></div><button onClick={() => handleOpenCredentials(channel)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Open credentials</button></article>)}
              </div>
            </div>
          )}

          {activeSection === 'agents' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-bold text-slate-950">Available agents</h3>
              <p className="mt-1 text-sm text-slate-500">These agents can be assigned as default responders in channel config.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">{agents.map((agent) => <article key={agent.id} className="rounded-2xl border border-slate-200 p-4"><h4 className="font-semibold text-slate-900">{agent.name || agent.id}</h4><p className="text-xs text-slate-500">{agent.id}</p></article>)}</div>
            </div>
          )}
        </section>
      </div>

      {/* Create Channel Modal */}
      {showCreateModal && (
        <CreateChannelModal
          agents={agents}
          channels={channels}
          organizationChannels={organizationChannels}
          onClose={() => setShowCreateModal(false)}
          onComplete={async () => {
            setShowCreateModal(false);
            await loadChannels();
            await loadStatuses();
          }}
        />
      )}

      {/* Credentials Modal */}
      {showCredentialsModal && selectedChannel && (
        <CredentialsModal
          channel={selectedChannel}
          credentials={credentials}
          setCredentials={setCredentials}
          saving={savingCredentials}
          onClose={() => setShowCredentialsModal(false)}
          onSave={handleSaveCredentials}
        />
      )}

      {/* Config Modal */}
      {showConfigModal && configChannel && (
        <ConfigModal
          channel={configChannel}
          configData={configData as Record<string, unknown>}
          setConfigData={setConfigData}
          agents={agents}
          saving={savingConfig}
          onClose={() => setShowConfigModal(false)}
          onSave={handleSaveConfig}
        />
      )}
    </div>
  );
}

export default ChannelsManager;
