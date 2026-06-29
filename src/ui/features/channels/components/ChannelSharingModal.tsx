import { useCallback, useEffect, useMemo, useState } from 'react';
import { Channel, ChannelShare, OrganizationUser } from './types';

const getApi = () => (window as any).electron;

interface ChannelSharingModalProps {
  channel: Channel;
  onClose: () => void;
  onChanged?: () => Promise<void> | void;
}

export function ChannelSharingModal({ channel, onClose, onChanged }: ChannelSharingModalProps) {
  const [shares, setShares] = useState<ChannelShare[]>([]);
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sharedUserIds = useMemo(
    () => new Set(shares.filter((share) => share.isActive).map((share) => share.sharedWithUserId)),
    [shares]
  );

  const availableUsers = useMemo(
    () => users.filter((user) => user.isActive && !sharedUserIds.has(user.id) && user.id !== channel.createdByUserId),
    [channel.createdByUserId, sharedUserIds, users]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = getApi();
      const [sharesResult, usersResult] = await Promise.all([
        api.apiListChannelShares(channel.id),
        api.apiListOrganizationUsers(),
      ]);
      if (!sharesResult?.success) {
        throw new Error(sharesResult?.error || 'Failed to load channel shares');
      }
      if (!usersResult?.success) {
        throw new Error(usersResult?.error || 'Failed to load organization users');
      }
      setShares(sharesResult.shares || []);
      setUsers(usersResult.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sharing settings');
    } finally {
      setLoading(false);
    }
  }, [channel.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleShare = useCallback(async () => {
    if (!selectedUserId) return;
    setSaving(true);
    setError(null);
    try {
      const api = getApi();
      const result = await api.apiShareChannel(channel.id, { userId: selectedUserId, permission: 'read' });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to share channel');
      }
      setSelectedUserId('');
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share channel');
    } finally {
      setSaving(false);
    }
  }, [channel.id, load, onChanged, selectedUserId]);

  const handleRevoke = useCallback(async (shareId: string) => {
    if (!confirm('Revoke access for this user?')) return;
    setSaving(true);
    setError(null);
    try {
      const api = getApi();
      const result = await api.apiRevokeChannelShare(channel.id, shareId);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to revoke channel access');
      }
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke channel access');
    } finally {
      setSaving(false);
    }
  }, [channel.id, load, onChanged]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Share channel</h3>
            <p className="text-sm text-slate-500">{channel.name}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">×</button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-6 text-center text-sm text-slate-500">Loading sharing settings...</div>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Add read access</label>
                <div className="flex gap-2">
                  <select
                    value={selectedUserId}
                    onChange={(event) => setSelectedUserId(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select a user...</option>
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.email || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.id}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleShare}
                    disabled={!selectedUserId || saving}
                    className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Share
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">Shared users can read this channel's email data. Credentials stay owned by you.</p>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-medium text-slate-700">Current shares</h4>
                {shares.filter((share) => share.isActive).length === 0 ? (
                  <div className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">Not shared with anyone yet.</div>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {shares.filter((share) => share.isActive).map((share) => (
                      <div key={share.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {share.sharedWithUserEmail || share.sharedWithUserId}
                          </div>
                          <div className="text-xs uppercase tracking-wide text-slate-500">{share.permission}</div>
                        </div>
                        <button
                          onClick={() => handleRevoke(share.id)}
                          disabled={saving}
                          className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
