import { useEffect } from 'react';
import { ChannelsManagerProps } from '../types';
import { useChannelBridge } from '../hooks/useChannelBridge';
import { useChannelManager } from '../hooks/useChannelManager';
import { ChannelList } from '../ChannelList';
import { CreateChannelModal } from '../CreateChannelModal';
import { CredentialsModal } from '../CredentialsModal';
import { ConfigModal } from '../ConfigModal';

export function ChannelsManager({ onAuthError }: ChannelsManagerProps) {
  const {
    channels,
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
    newProvider,
    setNewProvider,
    newName,
    setNewName,
    newAgentId,
    setNewAgentId,
    newAutoStart,
    setNewAutoStart,
    creating,
    handleCreateChannel,
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
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Channels</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          + Add Channel
        </button>
      </div>

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
          newName={newName}
          setNewName={setNewName}
          newProvider={newProvider}
          setNewProvider={setNewProvider}
          newAgentId={newAgentId}
          setNewAgentId={setNewAgentId}
          newAutoStart={newAutoStart}
          setNewAutoStart={setNewAutoStart}
          agents={agents}
          creating={creating}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateChannel}
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
