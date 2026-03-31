import { useState, useEffect } from "react";

// Complete channel config types matching server
interface WhatsAppConfig {
  selfChatMode?: boolean;
  autoStart?: boolean;
  respondToGroups?: boolean;
  respondOnlyWhenMentioned?: boolean;
  sessionPath?: string;
  allowedUsers?: string[];
  defaultAgentId?: string;
  typingIndicator?: boolean;
}

interface TelegramConfig {
  autoStart?: boolean;
  respondToGroups?: boolean;
  respondOnlyWhenMentioned?: boolean;
  allowedUsers?: string[];
  defaultAgentId?: string;
  typingIndicator?: boolean;
}

interface DiscordConfig {
  autoStart?: boolean;
  dmPolicy?: 'pairing' | 'allowlist' | 'open';
  respondToGroups?: boolean;
  respondOnlyWhenMentioned?: boolean;
  allowedUsers?: string[];
  defaultAgentId?: string;
  typingIndicator?: boolean;
}

interface SlackConfig {
  autoStart?: boolean;
  allowedUsers?: string[];
  defaultAgentId?: string;
  typingIndicator?: boolean;
}

type ChannelConfig = WhatsAppConfig | TelegramConfig | DiscordConfig | SlackConfig;

// Extended config type for state management
type ConfigDataState = {
  defaultAgentId?: string;
  autoStart?: boolean;
  typingIndicator?: boolean;
  allowedUsers?: string[];
  respondToGroups?: boolean;
  respondOnlyWhenMentioned?: boolean;
  selfChatMode?: boolean;
  sessionPath?: string;
  dmPolicy?: 'pairing' | 'allowlist' | 'open';
};

interface Channel {
  id: string;
  provider: 'whatsapp' | 'telegram' | 'discord' | 'slack' | 'email';
  name: string;
  hasCredentials: boolean;
  isActive: boolean;
  config?: ChannelConfig;
  createdAt: string;
}

interface ChannelStatus {
  channelId: string;
  provider: string;
  status: 'stopped' | 'starting' | 'connected' | 'qr' | 'reconnecting' | 'error';
  connected: boolean;
  qrDataUrl?: string;
  botId?: string;
  botUsername?: string;
  error?: string;
}

interface LettaAgent {
  id: string;
  name: string;
}

interface ChannelsManagerProps {
  onAuthError?: (error: Error) => void;
}

const getApi = () => (window as any).electron;

const PROVIDERS = [
  { id: 'telegram', name: 'Telegram', icon: '📱' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '💬' },
  { id: 'discord', name: 'Discord', icon: '🎮' },
  { id: 'slack', name: 'Slack', icon: '💼' },
] as const;

export function ChannelsManager({ onAuthError }: ChannelsManagerProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ChannelStatus>>({});
  const [agents, setAgents] = useState<LettaAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Create channel modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProvider, setNewProvider] = useState<string>('telegram');
  const [newName, setNewName] = useState('');
  const [newAgentId, setNewAgentId] = useState('');
  const [newAutoStart, setNewAutoStart] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Credentials modal
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [savingCredentials, setSavingCredentials] = useState(false);

  // Config modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configChannel, setConfigChannel] = useState<Channel | null>(null);
  const [configData, setConfigData] = useState<ConfigDataState>({});
  const [savingConfig, setSavingConfig] = useState(false);

  // Load agents
  const loadAgents = async () => {
    try {
      const api = getApi();
      console.log('[ChannelsManager] Loading agents...');
      const result = await api.listLettaAgents();
      console.log('[ChannelsManager] Agents loaded:', result?.length, 'agents');
      if (result) {
        result.forEach((agent: any) => {
          console.log(`[ChannelsManager] Agent: ${agent.name} (${agent.id})`);
        });
        setAgents(result);
      }
    } catch (err) {
      console.error('[ChannelsManager] Failed to load agents:', err);
    }
  };

  // Load channels
  const loadChannels = async () => {
    try {
      const api = getApi();
      console.log('[ChannelsManager] Loading channels...');
      const result = await api.apiListChannels();
      console.log('[ChannelsManager] Load result:', result);
      if (result.success) {
        setChannels(result.channels || []);
      } else {
        // Check for auth errors
        if (result.error?.includes('401') || result.error?.includes('Unauthorized') || result.error?.includes('Authentication expired')) {
          onAuthError?.(new Error(result.error));
        }
        setError(result.error || 'Failed to load channels');
      }
    } catch (err) {
      console.error('[ChannelsManager] Load error:', err);
      // Check for auth errors
      const errorMsg = err instanceof Error ? err.message : 'Failed to load channels';
      if (errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('Authentication expired')) {
        onAuthError?.(err instanceof Error ? err : new Error(errorMsg));
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Load statuses
  const loadStatuses = async () => {
    try {
      const api = getApi();
      console.log('[ChannelsManager] Loading statuses...');
      const result = await api.apiGetAllRuntimeStatus();
      console.log('[ChannelsManager] Status result:', result);
      if (result.success && result.channels) {
        const statusMap: Record<string, ChannelStatus> = {};
        for (const status of result.channels) {
          statusMap[status.channelId] = status;
          // Log each channel status
          console.log(`[ChannelsManager] Channel ${status.channelId.slice(0,8)}... (${status.provider}): ${status.status}`, 
            status.qrDataUrl ? '(has QR code)' : '',
            status.connected ? '(connected)' : '',
            status.error ? `(error: ${status.error})` : ''
          );
        }
        setStatuses(statusMap);
        console.log('[ChannelsManager] Updated statuses for', Object.keys(statusMap).length, 'channels');
      } else {
        console.warn('[ChannelsManager] Failed to load statuses:', result.error);
      }
    } catch (err) {
      console.error('[ChannelsManager] Failed to load statuses:', err);
    }
  };

  useEffect(() => {
    console.log('[ChannelsManager] Component mounted, loading initial data...');
    loadAgents();
    loadChannels();
    const interval = setInterval(loadStatuses, 3000);
    return () => {
      console.log('[ChannelsManager] Component unmounting, clearing interval');
      clearInterval(interval);
    };
  }, []);

  // Track configData changes for debugging
  useEffect(() => {
    console.log('[ChannelsManager] configData changed:', configData);
  }, [configData]);

  // Create channel
  const handleCreateChannel = async () => {
    if (!newName.trim()) return;
    
    setCreating(true);
    try {
      const api = getApi();
      const config: Record<string, unknown> = {};
      if (newAgentId.trim()) {
        config.defaultAgentId = newAgentId.trim();
      }
      if (newAutoStart) {
        config.autoStart = true;
      }
      
      console.log('[ChannelsManager] Creating channel:', { provider: newProvider, name: newName, config });
      const result = await api.apiCreateChannel({
        provider: newProvider,
        name: newName.trim(),
        config: Object.keys(config).length > 0 ? config : undefined,
      });
      
      console.log('[ChannelsManager] Create result:', result);
      if (result.success) {
        setShowCreateModal(false);
        setNewName('');
        setNewAgentId('');
        setNewAutoStart(false);
        await loadChannels();
      } else {
        setError(result.error || 'Failed to create channel');
      }
    } catch (err) {
      console.error('[ChannelsManager] Create error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  };

  // Delete channel
  const handleDeleteChannel = async (channelId: string) => {
    if (!confirm('Are you sure you want to delete this channel?')) return;
    
    try {
      const api = getApi();
      await api.apiDeleteChannel(channelId);
      await loadChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete channel');
    }
  };

  // Start channel
  const handleStartChannel = async (channelId: string) => {
    const channel = channels.find(c => c.id === channelId);
    console.log(`[ChannelsManager] Starting channel: ${channel?.name} (${channel?.provider}) [${channelId.slice(0,8)}...]`);
    
    // Check if channel has credentials (except for WhatsApp which uses QR)
    if (channel && !channel.hasCredentials && channel.provider !== 'whatsapp') {
      console.warn('[ChannelsManager] Channel has no credentials, cannot start');
      setError('Please set credentials before starting this channel');
      return;
    }
    
    if (channel?.provider === 'whatsapp') {
      console.log('[ChannelsManager] WhatsApp channel - will generate QR code on start');
    }
    
    try {
      const api = getApi();
      console.log('[ChannelsManager] Calling apiStartChannel...');
      const result = await api.apiStartChannel(channelId);
      console.log('[ChannelsManager] Start result:', result);
      if (!result.success) {
        console.error('[ChannelsManager] Start failed:', result.error);
        setError(result.error || 'Failed to start channel');
      } else {
        console.log('[ChannelsManager] Channel started successfully, status:', result.status);
        // Immediately refresh statuses
        await loadStatuses();
      }
      await loadStatuses();
    } catch (err) {
      console.error('[ChannelsManager] Start error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start channel');
    }
  };

  // Stop channel
  const handleStopChannel = async (channelId: string) => {
    const channel = channels.find(c => c.id === channelId);
    console.log(`[ChannelsManager] Stopping channel: ${channel?.name} (${channel?.provider}) [${channelId.slice(0,8)}...]`);
    try {
      const api = getApi();
      const result = await api.apiStopChannel(channelId);
      console.log('[ChannelsManager] Stop result:', result);
      if (!result.success) {
        console.error('[ChannelsManager] Stop failed:', result.error);
        setError(result.error || 'Failed to stop channel');
      } else {
        console.log('[ChannelsManager] Channel stopped successfully');
      }
      await loadStatuses();
    } catch (err) {
      console.error('[ChannelsManager] Stop error:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop channel');
    }
  };

  // Open credentials modal
  const handleOpenCredentials = (channel: Channel) => {
    console.log(`[ChannelsManager] Opening credentials modal for: ${channel.name} (${channel.provider})`);
    setSelectedChannel(channel);
    setCredentials({});
    setShowCredentialsModal(true);
  };

  // Save credentials
  const handleSaveCredentials = async () => {
    if (!selectedChannel) return;
    
    console.log(`[ChannelsManager] Saving credentials for: ${selectedChannel.name} (${selectedChannel.provider})`);
    console.log('[ChannelsManager] Credentials keys:', Object.keys(credentials));
    
    setSavingCredentials(true);
    try {
      const api = getApi();
      const result = await api.apiSetChannelCredentials(selectedChannel.id, { credentials });
      
      console.log('[ChannelsManager] Save credentials result:', result);
      if (result.success) {
        console.log('[ChannelsManager] Credentials saved successfully');
        setShowCredentialsModal(false);
        await loadChannels();
      } else {
        console.error('[ChannelsManager] Save credentials failed:', result.error);
        setError(result.error || 'Failed to save credentials');
      }
    } catch (err) {
      console.error('[ChannelsManager] Save credentials error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setSavingCredentials(false);
    }
  };

  // Open config modal
  const handleOpenConfig = (channel: Channel) => {
    console.log(`[ChannelsManager] Opening config for: ${channel.name} (${channel.provider})`);
    console.log('[ChannelsManager] Channel config:', channel.config);
    setConfigChannel(channel);
    setConfigData(channel.config || {});
    setShowConfigModal(true);
  };

  // Save config
  const handleSaveConfig = async () => {
    if (!configChannel) return;
    
    // Log the raw config data before cleaning
    console.log('[ChannelsManager] Raw configData before save:', configData);
    
    // Clean up config data - remove empty strings
    const cleanedConfig: Record<string, any> = {};
    for (const [key, value] of Object.entries(configData)) {
      // Skip empty strings, use null instead
      if (value === '' || value === undefined) {
        console.log(`[ChannelsManager] Skipping empty value for key: ${key}`);
        continue; // Don't include empty values
      }
      console.log(`[ChannelsManager] Including key: ${key} = ${value}`);
      cleanedConfig[key] = value;
    }
    
    console.log('[ChannelsManager] Final cleaned config to save:', cleanedConfig);
    console.log('[ChannelsManager] Has defaultAgentId:', !!cleanedConfig.defaultAgentId, cleanedConfig.defaultAgentId);
    
    setSavingConfig(true);
    try {
      const api = getApi();
      const result = await api.apiUpdateChannelConfig(configChannel.id, cleanedConfig);
      
      console.log('[ChannelsManager] Save config result:', result);
      if (result.success) {
        setShowConfigModal(false);
        await loadChannels();
      } else {
        setError(result.error || 'Failed to save config');
      }
    } catch (err) {
      console.error('[ChannelsManager] Save config error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setSavingConfig(false);
    }
  };

  const getCredentialFields = (provider: string) => {
    switch (provider) {
      case 'telegram':
        return [
          { key: 'botToken', label: 'Bot Token', placeholder: '123456:ABC-DEF...', type: 'text', required: true },
        ];
      case 'discord':
        return [
          { key: 'botToken', label: 'Bot Token', placeholder: 'MTk4NjIyNDgzNDc...', type: 'text', required: true },
        ];
      case 'slack':
        return [
          { key: 'botToken', label: 'Bot Token (xoxb-...)', placeholder: 'xoxb-123456789012-...', type: 'text', required: true },
          { key: 'appToken', label: 'App Token (xapp-...)', placeholder: 'xapp-1-A01BC...', type: 'text', required: true },
        ];
      case 'whatsapp':
        return [
          { key: 'sessionPath', label: 'Session Path (optional)', placeholder: './data/whatsapp-session', type: 'text', required: false },
        ];
      default:
        return [];
    }
  };

  const getCredentialsHelp = (provider: string) => {
    switch (provider) {
      case 'whatsapp':
        return 'WhatsApp uses QR code authentication. Click "Start" to generate a QR code, then scan it with your WhatsApp app.';
      case 'telegram':
        return 'Get your bot token from @BotFather on Telegram.';
      case 'discord':
        return 'Get your bot token from the Discord Developer Portal.';
      case 'slack':
        return 'Get your bot token and app token from your Slack App settings.';
      default:
        return null;
    }
  };

  const getStatusBadge = (channelId: string) => {
    const status = statuses[channelId];
    if (!status) {
      return <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">Unknown</span>;
    }

    switch (status.status) {
      case 'connected':
        return <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">Connected</span>;
      case 'starting':
        return <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">Starting...</span>;
      case 'qr':
        return <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-700">QR Code</span>;
      case 'reconnecting':
        return <span className="px-2 py-1 text-xs rounded bg-orange-100 text-orange-700">Reconnecting</span>;
      case 'error':
        return <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">Error</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">Stopped</span>;
    }
  };

  const getProviderIcon = (provider: string) => {
    const found = PROVIDERS.find(p => p.id === provider);
    return found?.icon || '📡';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <svg className="animate-spin h-6 w-6 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {channels.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <p>No channels configured</p>
          <p className="text-sm mt-1">Click "Add Channel" to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map((channel) => {
            const status = statuses[channel.id];
            return (
              <div key={channel.id} className="p-4 bg-white rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getProviderIcon(channel.provider)}</span>
                    <div>
                      <h3 className="font-medium text-slate-900">{channel.name}</h3>
                      <p className="text-sm text-slate-500 capitalize">{channel.provider}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(channel.id)}
                  </div>
                </div>

                {/* Show config info */}
                {channel.config && Object.keys(channel.config).length > 0 && (
                  <div className="mt-2 text-xs text-slate-500">
                    {channel.config.defaultAgentId && <span>Agent: {String(channel.config.defaultAgentId)}</span>}
                    {Boolean(channel.config.autoStart) && <span className="ml-2">• Auto-start</span>}
                  </div>
                )}

                {/* QR Code for WhatsApp */}
                {status?.status === 'qr' && status.qrDataUrl && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-lg text-center">
                    <p className="text-sm text-slate-600 mb-2">Scan this QR code with WhatsApp</p>
                    <img src={status.qrDataUrl} alt="WhatsApp QR" className="mx-auto w-40 h-40" />
                  </div>
                )}

                {/* Error message */}
                {status?.error && (
                  <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
                    {status.error}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {!channel.hasCredentials && channel.provider !== 'whatsapp' ? (
                    <button
                      onClick={() => handleOpenCredentials(channel)}
                      className="px-3 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600"
                    >
                      Set Credentials
                    </button>
                  ) : (
                    <>
                      {status?.connected ? (
                        <button
                          onClick={() => handleStopChannel(channel.id)}
                          className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          Stop
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartChannel(channel.id)}
                          className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          Start
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenCredentials(channel)}
                        className="px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                      >
                        {channel.provider === 'whatsapp' ? 'Session' : 'Edit Credentials'}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleOpenConfig(channel)}
                    className="px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                  >
                    Config
                  </button>
                  <button
                    onClick={() => handleDeleteChannel(channel.id)}
                    className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Channel Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add New Channel</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
                <select
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  {PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Channel Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Support Bot"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Default Agent (optional)</label>
                <select
                  value={newAgentId}
                  onChange={(e) => setNewAgentId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">Select an agent...</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.id.slice(0, 8)}...)
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">The Letta agent that will respond to messages</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoStart"
                  checked={newAutoStart}
                  onChange={(e) => setNewAutoStart(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <label htmlFor="autoStart" className="text-sm text-slate-700">
                  Auto-start when server starts
                </label>
              </div>
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateChannel}
                disabled={creating || !newName.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Channel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCredentialsModal && selectedChannel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {getProviderIcon(selectedChannel.provider)} Configure {selectedChannel.provider.charAt(0).toUpperCase() + selectedChannel.provider.slice(1)}
            </h3>
            
            {/* Help text */}
            {getCredentialsHelp(selectedChannel.provider) && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                {getCredentialsHelp(selectedChannel.provider)}
              </div>
            )}
            
            <div className="space-y-4">
              {getCredentialFields(selectedChannel.provider).map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type={field.type}
                    value={credentials[field.key] || ''}
                    onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCredentials}
                disabled={savingCredentials}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {savingCredentials ? 'Saving...' : 'Save Credentials'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfigModal && configChannel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {getProviderIcon(configChannel.provider)} {configChannel.name} Configuration
            </h3>
            
            <div className="space-y-4">
              {/* Default Agent - All providers */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Default Agent</label>
                <select
                  value={(configData as any).defaultAgentId || ''}
                  onChange={(e) => {
                    const selectedValue = e.target.value;
                    console.log('[ChannelsManager] Agent selected:', selectedValue || '(none)');
                    console.log('[ChannelsManager] Current configData:', configData);
                    setConfigData({ ...configData, defaultAgentId: selectedValue || undefined });
                    console.log('[ChannelsManager] New configData will have defaultAgentId:', selectedValue || undefined);
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">No agent selected</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.id.slice(0, 8)}...)
                    </option>
                  ))}
                </select>
                {agents.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No agents found. Check your Letta configuration.</p>
                )}
              </div>

              {/* Auto Start - All providers */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="configAutoStart"
                  checked={(configData as any).autoStart || false}
                  onChange={(e) => setConfigData({ ...configData, autoStart: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <label htmlFor="configAutoStart" className="text-sm text-slate-700">
                  Auto-start when server starts
                </label>
              </div>

              {/* Typing Indicator - All providers */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="configTypingIndicator"
                  checked={(configData as any).typingIndicator !== false}
                  onChange={(e) => setConfigData({ ...configData, typingIndicator: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <label htmlFor="configTypingIndicator" className="text-sm text-slate-700">
                  Show typing indicator while processing
                </label>
              </div>

              {/* Allowed Users - All providers */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Allowed Users</label>
                <input
                  type="text"
                  value={(configData as any).allowedUsers?.join(', ') || ''}
                  onChange={(e) => setConfigData({ 
                    ...configData, 
                    allowedUsers: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  })}
                  placeholder={configChannel.provider === 'whatsapp' ? '1234567890, 0987654321' : 'user_id_1, user_id_2'}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
                <p className="text-xs text-slate-500 mt-1">
                  {configChannel.provider === 'whatsapp' 
                    ? 'Phone numbers with country code (no + sign)' 
                    : 'Leave empty to allow all users'}
                </p>
              </div>

              {/* WhatsApp specific options */}
              {configChannel.provider === 'whatsapp' && (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="configSelfChatMode"
                      checked={(configData as WhatsAppConfig).selfChatMode || false}
                      onChange={(e) => setConfigData({ ...configData, selfChatMode: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    <label htmlFor="configSelfChatMode" className="text-sm text-slate-700">
                      Self chat mode (respond to own messages)
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="configRespondToGroups"
                      checked={(configData as WhatsAppConfig).respondToGroups || false}
                      onChange={(e) => setConfigData({ ...configData, respondToGroups: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    <label htmlFor="configRespondToGroups" className="text-sm text-slate-700">
                      Respond to group messages
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="configRespondOnlyWhenMentioned"
                      checked={(configData as WhatsAppConfig).respondOnlyWhenMentioned || false}
                      onChange={(e) => setConfigData({ ...configData, respondOnlyWhenMentioned: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    <label htmlFor="configRespondOnlyWhenMentioned" className="text-sm text-slate-700">
                      Respond only when mentioned (groups)
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Session Path</label>
                    <input
                      type="text"
                      value={(configData as WhatsAppConfig).sessionPath || ''}
                      onChange={(e) => setConfigData({ ...configData, sessionPath: e.target.value })}
                      placeholder="./data/whatsapp-session"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                    />
                    <p className="text-xs text-slate-500 mt-1">Path to store WhatsApp session data</p>
                  </div>
                </>
              )}

              {/* Telegram specific options */}
              {configChannel.provider === 'telegram' && (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="configRespondToGroups"
                      checked={(configData as TelegramConfig).respondToGroups || false}
                      onChange={(e) => setConfigData({ ...configData, respondToGroups: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    <label htmlFor="configRespondToGroups" className="text-sm text-slate-700">
                      Respond to group messages
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="configRespondOnlyWhenMentioned"
                      checked={(configData as TelegramConfig).respondOnlyWhenMentioned || false}
                      onChange={(e) => setConfigData({ ...configData, respondOnlyWhenMentioned: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    <label htmlFor="configRespondOnlyWhenMentioned" className="text-sm text-slate-700">
                      Respond only when mentioned (groups)
                    </label>
                  </div>
                </>
              )}

              {/* Discord specific options */}
              {configChannel.provider === 'discord' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">DM Policy</label>
                    <select
                      value={(configData as DiscordConfig).dmPolicy || 'pairing'}
                      onChange={(e) => setConfigData({ ...configData, dmPolicy: e.target.value as any })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                    >
                      <option value="pairing">Pairing (require explicit pairing)</option>
                      <option value="allowlist">Allowlist (only allowed users)</option>
                      <option value="open">Open (respond to all DMs)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="configRespondToGroups"
                      checked={(configData as DiscordConfig).respondToGroups || false}
                      onChange={(e) => setConfigData({ ...configData, respondToGroups: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    <label htmlFor="configRespondToGroups" className="text-sm text-slate-700">
                      Respond to group messages
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="configRespondOnlyWhenMentioned"
                      checked={(configData as DiscordConfig).respondOnlyWhenMentioned || false}
                      onChange={(e) => setConfigData({ ...configData, respondOnlyWhenMentioned: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    <label htmlFor="configRespondOnlyWhenMentioned" className="text-sm text-slate-700">
                      Respond only when mentioned (groups)
                    </label>
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {savingConfig ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
