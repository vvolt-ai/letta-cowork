import { useState, useEffect, useCallback } from 'react';
import { Channel, ChannelStatus, ChannelsManagerProps } from '../types';

const getApi = () => (window as any).electron;

export function useChannelBridge(onAuthError?: ChannelsManagerProps['onAuthError']) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ChannelStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load channels
  const loadChannels = useCallback(async () => {
    try {
      const api = getApi();
      console.log('[useChannelBridge] Loading channels...');
      const result = await api.apiListChannels();
      console.log('[useChannelBridge] Load result:', result);
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
      console.error('[useChannelBridge] Load error:', err);
      // Check for auth errors
      const errorMsg = err instanceof Error ? err.message : 'Failed to load channels';
      if (errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('Authentication expired')) {
        onAuthError?.(err instanceof Error ? err : new Error(errorMsg));
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  // Load statuses
  const loadStatuses = useCallback(async () => {
    try {
      const api = getApi();
      console.log('[useChannelBridge] Loading statuses...');
      const result = await api.apiGetAllRuntimeStatus();
      console.log('[useChannelBridge] Status result:', result);
      if (result.success && result.channels) {
        const statusMap: Record<string, ChannelStatus> = {};
        for (const status of result.channels) {
          statusMap[status.channelId] = status;
          // Log each channel status
          console.log(`[useChannelBridge] Channel ${status.channelId.slice(0,8)}... (${status.provider}): ${status.status}`,
            status.qrDataUrl ? '(has QR code)' : '',
            status.connected ? '(connected)' : '',
            status.error ? `(error: ${status.error})` : ''
          );
        }
        setStatuses(statusMap);
        console.log('[useChannelBridge] Updated statuses for', Object.keys(statusMap).length, 'channels');
      } else {
        console.warn('[useChannelBridge] Failed to load statuses:', result.error);
      }
    } catch (err) {
      console.error('[useChannelBridge] Failed to load statuses:', err);
    }
  }, []);

  // Initial load and status polling
  useEffect(() => {
    console.log('[useChannelBridge] Component mounted, loading initial data...');
    loadChannels();
    const interval = setInterval(loadStatuses, 3000);
    return () => {
      console.log('[useChannelBridge] Component unmounting, clearing interval');
      clearInterval(interval);
    };
  }, [loadChannels, loadStatuses]);

  // Clear error
  const clearError = useCallback(() => setError(null), []);

  return {
    channels,
    statuses,
    loading,
    error,
    loadChannels,
    loadStatuses,
    clearError,
    setChannels,
  };
}
