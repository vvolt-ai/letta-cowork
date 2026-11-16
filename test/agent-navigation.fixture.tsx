import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/ui/index.css';
import { AgentWorkspaceNavigation } from '../src/ui/features/sidebar/components/AgentWorkspaceNavigation';
import { useAppStore } from '../src/ui/store/useAppStore';

const calls: string[] = [];
const scenario = new URLSearchParams(location.search);
let failAgents = scenario.has('failure'),
  failChats = scenario.has('chat-failure');
let owner = 'one',
  held: undefined | (() => void),
  holdA = false;
const agents = [
  { id: 'agent-a', name: 'AndrOptimus Prime', lastUsedAt: '2026-11-16T00:00:00Z' },
  { id: 'agent-b', name: 'Shelly', lastUsedAt: '2026-11-15T00:00:00Z' },
  ...Array.from({ length: 23 }, (_, i) => ({
    id: 'extra-agent-' + i,
    name: 'Extra fixture agent ' + i,
    lastUsedAt: new Date(1700000000000 - i * 1000).toISOString(),
  })),
];
const list = (id: string) =>
  id === 'agent-a'
    ? Array.from({ length: 120 }, (_, i) => ({
        id: 'chat-a-' + i,
        agentId: id,
        summary: i === 1 ? 'Email: fixture order' : 'Research conversation ' + i,
        lastMessageAt: new Date(1794780000000 - i * 1000).toISOString(),
      }))
    : [
        {
          id: 'chat-b',
          agentId: id,
          summary: 'Shelly fixture chat',
          lastMessageAt: '2026-11-16T00:00:00Z',
        },
      ];
const record = (value: string) => {
  calls.push(value);
};
(window as any).electron = new Proxy(
  {
    listLettaAgents: async (_query?: string, _connection?: string, favoritesOnly = false) => {
      record('list-agents:' + owner);
      if (failAgents) {
        failAgents = false;
        throw Error('Synthetic agent read failure');
      }
      if (scenario.has('empty')) return [];
      if (favoritesOnly) {
        record('list-favourites:' + owner);
        if (scenario.has('favorites-failure')) throw Error('Synthetic favourites unavailable');
        if (scenario.has('favorites-empty')) return [];
        return agents
          .filter((a) => a.id === 'agent-b' || a.id.startsWith('extra-agent-'))
          .slice(0, 13);
      }
      return owner === 'one' ? agents : [{ id: 'agent-other', name: 'Other workspace agent' }];
    },
    listLettaConversations: async (id: string) => {
      record('list-chats:' + id);
      if (failChats) {
        failChats = false;
        throw Error('Synthetic conversation read failure');
      }
      if (holdA && id === 'agent-a') {
        holdA = false;
        return new Promise((resolve) => {
          held = () => resolve(list(id));
        });
      }
      return list(id);
    },
  },
  {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      return () => {
        record('FORBIDDEN:' + String(key));
        throw Error('No fixture write/provider API allowed');
      };
    },
  },
);
const running: any = {
  id: 'chat-running',
  title: 'Active research',
  agentId: 'agent-a',
  agentName: agents[0].name,
  status: 'running',
  messages: [{ type: 'assistant', content: 'In-progress work' }],
  hydrated: true,
  permissionRequests: [],
  ephemeral: { status: 'generating' },
};
useAppStore.setState({
  sessions: scenario.has('empty') ? {} : { [running.id]: running },
  activeSessionId: scenario.has('empty') ? null : running.id,
  newConversationAgentId: scenario.has('empty') ? '' : 'agent-a',
  prompt: '',
  composerDrafts: {},
  ipcSendEvent: (event) => record('ipc:' + event.type),
});
(window as any).navigationFixture = {
  calls,
  holdNextA: () => {
    holdA = true;
  },
  releaseA: () => held?.(),
  snapshot: () => {
    const s = useAppStore.getState();
    return {
      active: s.activeSessionId,
      prompt: s.prompt,
      agent: s.newConversationAgentId,
      running: s.sessions['chat-running']?.status,
      modelCalls: calls.filter((c) => c === 'ipc:session.start').length,
    };
  },
};
function Fixture() {
  const [scope, setScope] = useState('one'),
    [view, setView] = useState('Chat'),
    [label, setLabel] = useState('AndrOptimus Prime');
  const active = useAppStore((s) => s.activeSessionId),
    prompt = useAppStore((s) => s.prompt);
  return (
    <div style={{ height: '100vh', display: 'flex', background: 'var(--color-bg-000)' }}>
      <div style={{ width: 336, flexShrink: 0 }}>
        <AgentWorkspaceNavigation
          key={scope}
          connected
          scopeKey={scope}
          footer={
            <button
              onClick={() => {
                owner = 'two';
                useAppStore.getState().resetOrganizationState();
                setScope('two');
              }}
            >
              Switch fixture workspace
            </button>
          }
          onNewChat={(id) => {
            record('new-chat:' + id);
            useAppStore.getState().setNewConversationAgentId(id ?? '');
            useAppStore.getState().setActiveSessionId(null, false);
            setView('Chat');
          }}
          onSelectedAgentChange={(_id, name) => setLabel(name ?? 'Choose an agent')}
          onDeleteSession={(id) => record('delete:' + id)}
          onResumeSession={(id) => record('resume:' + id)}
          onShowChat={() => setView('Chat')}
          onOpenMemory={(id) => {
            record('memory:' + id);
            setView('Memory');
          }}
          onOpenSchedules={() => setView('Schedules')}
          onOpenRemote={() => setView('Remote Access')}
          onOpenEmails={() => setView('Emails')}
          onOpenSettings={() => setView('Settings')}
        />
      </div>
      <main
        style={{
          minWidth: 0,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '30px 40px',
        }}
      >
        <h1>{view === 'Chat' ? (active ? 'Current conversation' : 'New chat') : view}</h1>
        <div style={{ margin: 'auto', width: 'min(100%,700px)' }}>
          <h2 style={{ fontSize: 26, marginBottom: 20 }}>Hi, I'm {label}</h2>
          <textarea
            aria-label='Chat draft'
            value={prompt}
            onChange={(e) => useAppStore.getState().setPrompt(e.target.value)}
            style={{
              width: '100%',
              minHeight: 90,
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: 14,
            }}
            placeholder='Type a message to start a new conversation…'
          />
          <p>Selected view: {view}</p>
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
