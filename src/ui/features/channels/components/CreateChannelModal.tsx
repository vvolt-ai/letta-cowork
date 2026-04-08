import { PROVIDERS, LettaAgent } from './types';

interface CreateChannelModalProps {
  newName: string;
  setNewName: (v: string) => void;
  newProvider: string;
  setNewProvider: (v: string) => void;
  newAgentId: string;
  setNewAgentId: (v: string) => void;
  newAutoStart: boolean;
  setNewAutoStart: (v: boolean) => void;
  agents: LettaAgent[];
  creating: boolean;
  onClose: () => void;
  onCreate: () => void;
}

export function CreateChannelModal({
  newName,
  setNewName,
  newProvider,
  setNewProvider,
  newAgentId,
  setNewAgentId,
  newAutoStart,
  setNewAutoStart,
  agents,
  creating,
  onClose,
  onCreate,
}: CreateChannelModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Add New Channel</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Provider
            </label>
            <select
              value={newProvider}
              onChange={(e) => setNewProvider(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            >
              {PROVIDERS.map((p: { id: string; name: string; icon: string }) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Channel Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="My Support Bot"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Agent (optional)
            </label>
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
            <p className="text-xs text-slate-500 mt-1">
              The Letta agent that will respond to messages
            </p>
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
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={creating || !newName.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Channel'}
          </button>
        </div>
      </div>
    </div>
  );
}
