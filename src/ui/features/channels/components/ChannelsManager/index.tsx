import { useEffect } from 'react';
import { ChannelsManagerProps } from '../types';
import { useChannelBridge } from '../hooks/useChannelBridge';
import { useChannelManager } from '../hooks/useChannelManager';
import { ChannelList } from '../ChannelList';
import { CreateChannelModal } from '../CreateChannelModal';
import { CredentialsModal } from '../CredentialsModal';
import { ConfigModal } from '../ConfigModal';
import { ConnectorMarketplace } from '../ConnectorMarketplace';

export function ChannelsManager({ onAuthError, embedded = false }: ChannelsManagerProps) {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
        <svg
          className="h-5 w-5 animate-spin text-[var(--color-accent)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" />
          <path className="opacity-75" d="M4 12a8 8 0 018-8" />
        </svg>
        <span className="ml-2 text-xs text-muted">Loading channels…</span>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-4" : "p-4"}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">Connected channels</h2>
          <p className="mt-0.5 text-xs text-muted">{channels.length} {channels.length === 1 ? "channel" : "channels"} configured</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-xl bg-[var(--color-accent)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-95"
        >
          + Add channel
        </button>
      </div>

      {!embedded ? <ConnectorMarketplace onAddChannel={() => setShowCreateModal(true)} /> : null}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
          <button
            onClick={clearError}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      <ChannelList
        channels={channels}
        statuses={statuses}
        onStart={onStart}
        onStop={onStop}
        onOpenCredentials={handleOpenCredentials}
        onOpenConfig={handleOpenConfig}
        onDelete={handleDeleteChannel}
      />

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
