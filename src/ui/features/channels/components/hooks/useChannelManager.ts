import { useState, useCallback } from 'react';
import { Channel, LettaAgent, ConfigDataState } from '../types';

const getApi = () => (window as any).electron;

export function useChannelManager(
  loadChannels: () => Promise<void>,
  loadStatuses: () => Promise<void>,
  setError: (error: string | null) => void
) {
  const [agents, setAgents] = useState<LettaAgent[]>([]);

  // Create channel modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProvider, setNewProvider] = useState<string>('telegram');
  const [newName, setNewName] = useState('');
  const [newAgentId, setNewAgentId] = useState('');
  const [newAutoStart, setNewAutoStart] = useState(false);
  const [creating, setCreating] = useState(false);

  // Credentials modal state
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [savingCredentials, setSavingCredentials] = useState(false);

  // Config modal state
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configChannel, setConfigChannel] = useState<Channel | null>(null);
  const [configData, setConfigData] = useState<ConfigDataState>({});
  const [savingConfig, setSavingConfig] = useState(false);

  // Load agents
  const loadAgents = useCallback(async () => {
    try {
      const api = getApi();
      console.log('[useChannelManager] Loading agents...');
      const result = await api.listLettaAgents();
      console.log('[useChannelManager] Agents loaded:', result?.length, 'agents');
      if (result) {
        result.forEach((agent: any) => {
          console.log(`[useChannelManager] Agent: ${agent.name} (${agent.id})`);
        });
        setAgents(result);
      }
    } catch (err) {
      console.error('[useChannelManager] Failed to load agents:', err);
    }
  }, []);

  // Create channel
  const handleCreateChannel = useCallback(async () => {
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

      console.log('[useChannelManager] Creating channel:', { provider: newProvider, name: newName, config });
      const result = await api.apiCreateChannel({
        provider: newProvider,
        name: newName.trim(),
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      console.log('[useChannelManager] Create result:', result);
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
      console.error('[useChannelManager] Create error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  }, [newName, newProvider, newAgentId, newAutoStart, loadChannels, setError]);

  // Delete channel
  const handleDeleteChannel = useCallback(async (channelId: string) => {
    if (!confirm('Are you sure you want to delete this channel?')) return;

    try {
      const api = getApi();
      await api.apiDeleteChannel(channelId);
      await loadChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete channel');
    }
  }, [loadChannels, setError]);

  // Start channel
  const handleStartChannel = useCallback(async (channelId: string, channels: Channel[]) => {
    const channel = channels.find(c => c.id === channelId);
    console.log(`[useChannelManager] Starting channel: ${channel?.name} (${channel?.provider}) [${channelId.slice(0,8)}...]`);

    // Check if channel has credentials (except for WhatsApp which uses QR)
    if (channel && !channel.hasCredentials && channel.provider !== 'whatsapp') {
      console.warn('[useChannelManager] Channel has no credentials, cannot start');
      setError('Please set credentials before starting this channel');
      return;
    }

    if (channel?.provider === 'whatsapp') {
      console.log('[useChannelManager] WhatsApp channel - will generate QR code on start');
    }

    try {
      const api = getApi();
      console.log('[useChannelManager] Calling apiStartChannel...');
      const result = await api.apiStartChannel(channelId);
      console.log('[useChannelManager] Start result:', result);
      if (!result.success) {
        console.error('[useChannelManager] Start failed:', result.error);
        setError(result.error || 'Failed to start channel');
      } else {
        console.log('[useChannelManager] Channel started successfully, status:', result.status);
      }
      await loadStatuses();
    } catch (err) {
      console.error('[useChannelManager] Start error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start channel');
    }
  }, [loadStatuses, setError]);

  // Stop channel
  const handleStopChannel = useCallback(async (channelId: string, channels: Channel[]) => {
    const channel = channels.find(c => c.id === channelId);
    console.log(`[useChannelManager] Stopping channel: ${channel?.name} (${channel?.provider}) [${channelId.slice(0,8)}...]`);
    try {
      const api = getApi();
      const result = await api.apiStopChannel(channelId);
      console.log('[useChannelManager] Stop result:', result);
      if (!result.success) {
        console.error('[useChannelManager] Stop failed:', result.error);
        setError(result.error || 'Failed to stop channel');
      } else {
        console.log('[useChannelManager] Channel stopped successfully');
      }
      await loadStatuses();
    } catch (err) {
      console.error('[useChannelManager] Stop error:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop channel');
    }
  }, [loadStatuses, setError]);

  // Open credentials modal
  const handleOpenCredentials = useCallback((channel: Channel) => {
    console.log(`[useChannelManager] Opening credentials modal for: ${channel.name} (${channel.provider})`);
    setSelectedChannel(channel);
    setCredentials({});
    setShowCredentialsModal(true);
  }, []);

  // Save credentials
  const handleSaveCredentials = useCallback(async () => {
    if (!selectedChannel) return;

    console.log(`[useChannelManager] Saving credentials for: ${selectedChannel.name} (${selectedChannel.provider})`);
    console.log('[useChannelManager] Credentials keys:', Object.keys(credentials));

    setSavingCredentials(true);
    try {
      const api = getApi();
      const result = await api.apiSetChannelCredentials(selectedChannel.id, { credentials });

      console.log('[useChannelManager] Save credentials result:', result);
      if (result.success) {
        console.log('[useChannelManager] Credentials saved successfully');
        setShowCredentialsModal(false);
        await loadChannels();
      } else {
        console.error('[useChannelManager] Save credentials failed:', result.error);
        setError(result.error || 'Failed to save credentials');
      }
    } catch (err) {
      console.error('[useChannelManager] Save credentials error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setSavingCredentials(false);
    }
  }, [selectedChannel, credentials, loadChannels, setError]);

  // Open config modal
  const handleOpenConfig = useCallback((channel: Channel) => {
    console.log(`[useChannelManager] Opening config for: ${channel.name} (${channel.provider})`);
    console.log('[useChannelManager] Channel config:', channel.config);
    setConfigChannel(channel);
    setConfigData((channel.config || {}) as ConfigDataState);
    setShowConfigModal(true);
  }, []);

  // Save config
  const handleSaveConfig = useCallback(async () => {
    if (!configChannel) return;

    // Log the raw config data before cleaning
    console.log('[useChannelManager] Raw configData before save:', configData);

    // Clean up config data - remove empty strings
    const cleanedConfig: Record<string, any> = {};
    for (const [key, value] of Object.entries(configData)) {
      // Skip empty strings, use null instead
      if (value === '' || value === undefined) {
        console.log(`[useChannelManager] Skipping empty value for key: ${key}`);
        continue; // Don't include empty values
      }
      console.log(`[useChannelManager] Including key: ${key} = ${value}`);
      cleanedConfig[key] = value;
    }

    console.log('[useChannelManager] Final cleaned config to save:', cleanedConfig);
    console.log('[useChannelManager] Has defaultAgentId:', !!cleanedConfig.defaultAgentId, cleanedConfig.defaultAgentId);

    setSavingConfig(true);
    try {
      const api = getApi();
      const result = await api.apiUpdateChannelConfig(configChannel.id, cleanedConfig);

      console.log('[useChannelManager] Save config result:', result);
      if (result.success) {
        setShowConfigModal(false);
        await loadChannels();
      } else {
        setError(result.error || 'Failed to save config');
      }
    } catch (err) {
      console.error('[useChannelManager] Save config error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setSavingConfig(false);
    }
  }, [configChannel, configData, loadChannels, setError]);

  return {
    // Agents
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
    // Delete channel
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
  };
}
