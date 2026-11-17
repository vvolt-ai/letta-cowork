import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../../store/useAppStore';
import { ConversationList } from './ConversationList';
import {
  agentGradient,
  mergeNavigationChats,
  navigationAgents,
  NAVIGATION_PAGE_SIZE,
  readAgentRecency,
  writeAgentRecency,
  type AgentRecency,
  type NavigationAgent,
  type NavigationChat,
  type NavigationConversation,
} from '../navigation';
import './agent-workspace.css';

type Props = {
  connected: boolean;
  scopeKey: string;
  suspended?: boolean;
  footer: ReactNode;
  onNewChat: (agentId?: string) => void;
  onDeleteSession: (id: string) => void;
  onResumeSession: (id: string) => void;
  onOpenMemory: (agentId: string) => void;
  onOpenSchedules: () => void;
  onOpenRemote: () => void;
  onOpenEmails: () => void;
  onOpenSettings?: () => void;
  onShowChat: () => void;
  onSelectedAgentChange: (agentId: string, name?: string) => void;
};
function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    chats: <path d='M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z' />,
    schedules: (
      <>
        <circle cx='12' cy='12' r='9' />
        <path d='M12 7v5l3 2' />
      </>
    ),
    remote: (
      <>
        <rect x='3' y='4' width='18' height='13' rx='2' />
        <path d='M8 21h8m-4-4v4' />
      </>
    ),
    emails: (
      <>
        <rect x='3' y='5' width='18' height='14' rx='2' />
        <path d='m3 6 9 7 9-7' />
      </>
    ),
    settings: (
      <>
        <circle cx='12' cy='12' r='3' />
        <path d='m9 3-.5 3-2 1-3-.5-1 3 2.5 2v2L2.5 16l2 2 3-1 2 1L11 21h3l1-3 2-1 3 1 2-3-2.5-2v-2L22 8l-2-2-3 1-2-1L14 3Z' />
      </>
    ),
    search: (
      <>
        <circle cx='10' cy='10' r='6' />
        <path d='m15 15 5 5' />
      </>
    ),
    plus: <path d='M12 5v14M5 12h14' />,
  };
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.7'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      {paths[name]}
    </svg>
  );
}
export function AgentWorkspaceNavigation(props: Props) {
  const tokens = useAppStore(
    useShallow((state) =>
      Object.values(state.sessions)
        .map((s) =>
          JSON.stringify({
            id: s.id,
            title: s.title,
            status: s.status,
            agentId: s.agentId,
            agentName: s.agentName,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            lettaConnectionId: s.lettaConnectionId,
            model: s.model,
            ephemeralStatus: s.ephemeral?.status,
          }),
        )
        .sort(),
    ),
  );
  const local = useMemo(() => tokens.map((t) => JSON.parse(t) as NavigationChat), [tokens]);
  const activeId = useAppStore((s) => s.activeSessionId),
    activeAgent = useAppStore((s) =>
      s.activeSessionId ? s.sessions[s.activeSessionId]?.agentId : undefined,
    );
  const newAgentId = useAppStore((s) => s.newConversationAgentId),
    setAgent = useAppStore((s) => s.setNewConversationAgentId);
  const pendingStart = useAppStore((s) => s.pendingStart),
    navigationDisabled = props.suspended || pendingStart;
  const selected = activeAgent ?? newAgentId;
  const [allChats, setAllChats] = useState(false),
    [agents, setAgents] = useState<NavigationAgent[]>([]),
    [remote, setRemote] = useState<NavigationConversation[]>([]),
    [remoteAgentId, setRemoteAgentId] = useState('');
  const [agentLoading, setAgentLoading] = useState(false),
    [chatLoading, setChatLoading] = useState(false),
    [agentError, setAgentError] = useState(''),
    [chatError, setChatError] = useState('');
  const [agentQuery, setAgentQuery] = useState(''),
    [chatQuery, setChatQuery] = useState(''),
    [searchOpen, setSearchOpen] = useState(false),
    [revision, setRevision] = useState(0);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const knownAgents = useRef(new Map<string, NavigationAgent>());
  let preferenceStorage: Storage | undefined;
  try {
    preferenceStorage = globalThis.localStorage;
  } catch {
    /* Private-mode storage can be unavailable. */
  }
  const [agentUsage, setAgentUsage] = useState<AgentRecency>(() =>
    readAgentRecency(preferenceStorage, props.scopeKey),
  );
  const usageRef = useRef({ scope: props.scopeKey, values: agentUsage });
  const [agentLimit, setAgentLimit] = useState(NAVIGATION_PAGE_SIZE),
    [chatLimit, setChatLimit] = useState(NAVIGATION_PAGE_SIZE);
  useEffect(() => {
    let values =
      usageRef.current.scope === props.scopeKey
        ? usageRef.current.values
        : readAgentRecency(preferenceStorage, props.scopeKey);
    if (selected && !props.suspended && (!activeId || activeAgent))
      values = { ...values, [selected]: Date.now() };
    usageRef.current = { scope: props.scopeKey, values };
    setAgentUsage(values);
    if (selected && !props.suspended) writeAgentRecency(preferenceStorage, props.scopeKey, values);
  }, [selected, activeId, activeAgent, props.scopeKey, props.suspended]);
  useEffect(() => {
    setAgentLimit(NAVIGATION_PAGE_SIZE);
  }, [agentQuery]);
  useEffect(() => {
    setChatLimit(NAVIGATION_PAGE_SIZE);
  }, [selected, allChats, chatQuery]);
  useEffect(() => {
    if (activeId) setAllChats(!activeAgent);
  }, [activeId, activeAgent]);

  useEffect(() => {
    let current = true;
    if (!props.connected || props.suspended) return;
    setAgentLoading(true);
    setAgentError('');
    const timer = setTimeout(
      () => {
        void window.electron
          .listLettaAgents(agentQuery.trim(), undefined, false)
          .then((items) => {
            if (current) {
              if (!Array.isArray(items)) throw Error('Invalid agent response');
              setAgents(items);
              setAgentsLoaded(true);
              for (const item of items)
                if (item && typeof item.id === 'string') knownAgents.current.set(item.id, item);
            }
          })
          .catch(() => {
            if (current)
              setAgentError('Could not load agents.');
          })
          .finally(() => {
            if (current) setAgentLoading(false);
          });
      },
      agentQuery ? 250 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [props.connected, props.suspended, props.scopeKey, agentQuery, revision]);
  useEffect(() => {
    let current = true;
    setChatError('');
    if (!selected || allChats || !props.connected || props.suspended) {
      setChatLoading(false);
      return;
    }
    setChatLoading(true);
    void window.electron
      .listLettaConversations(selected)
      .then((items) => {
        if (current) {
          setRemote(items ?? []);
          setRemoteAgentId(selected);
        }
      })
      .catch(() => {
        if (current)
          setChatError('Could not load all conversations. Cached chats remain available.');
      })
      .finally(() => {
        if (current) setChatLoading(false);
      });
    return () => {
      current = false;
    };
  }, [selected, allChats, props.connected, props.suspended, props.scopeKey, revision]);
  useEffect(() => {
    setChatQuery('');
  }, [selected, allChats]);
  const available = useMemo(
    () =>
      navigationAgents(
        agentsLoaded ? agents : [],
        local,
        usageRef.current.scope === props.scopeKey ? agentUsage : {},
        selected,
      ),
    [agents, local, agentUsage, selected, props.scopeKey, agentsLoaded],
  );
  const filteredAgents = available.filter(
    (a) =>
      !agentQuery.trim() ||
      `${a.name} ${a.id} ${a.description ?? ''}`
        .toLowerCase()
        .includes(agentQuery.trim().toLowerCase()),
  );
  const chats = useMemo(
    () =>
      mergeNavigationChats(
        allChats || remoteAgentId !== selected ? [] : remote,
        local,
        allChats ? undefined : selected || undefined,
      ),
    [allChats, remote, remoteAgentId, local, selected],
  );
  const visible = chats.filter(
    (c) =>
      !chatQuery.trim() ||
      `${c.title} ${c.id}`.toLowerCase().includes(chatQuery.trim().toLowerCase()),
  );
  const agent = available.find((a) => a.id === selected) ?? knownAgents.current.get(selected),
    title = allChats
      ? 'All conversations'
      : agent?.name || (selected ? 'Selected agent' : 'Choose an agent');
  useEffect(() => {
    props.onSelectedAgentChange(selected, agent?.name);
  }, [selected, agent?.name, props.onSelectedAgentChange]);
  const selectAgent = (id: string) => {
    if (navigationDisabled) return;
    setAllChats(false);
    setAgent(id);
    useAppStore.getState().setActiveSessionId(null, false);
    props.onShowChat();
  };
  const openChat = (id: string) => {
    if (navigationDisabled) return;
    const item = chats.find((c) => c.id === id);
    if (!item) return;
    useAppStore.getState().openExistingConversation({
      id: item.id,
      title: item.title,
      agentId: item.agentId,
      model: item.model,
      lettaConnectionId: item.lettaConnectionId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
    props.onShowChat();
  };
  const action = (name: string, icon: string, onClick: () => void, disabled = false) => (
    <button
      type='button'
      className='agent-nav-action'
      onClick={onClick}
      disabled={disabled || navigationDisabled}
    >
      <Icon name={icon} />
      <span>{name}</span>
    </button>
  );
  return (
    <div className='agentWorkspaceShell'>
      <nav className='agentRail' aria-label='Agents'>
        <button
          type='button'
          className='agentRailHome'
          aria-label='All conversations'
          aria-pressed={allChats}
          title='All conversations'
          onClick={() => setAllChats(true)}
          disabled={navigationDisabled}
        >
          <Icon name='chats' />
        </button>
        <button
          type='button'
          className='agentRailSearch'
          aria-label='Find agents'
          title='Find agents'
          onClick={() => {
            if (searchOpen) setAgentQuery('');
            setSearchOpen((v) => !v);
          }}
        >
          <Icon name='search' />
        </button>
        <div className='agentRailList'>
          {filteredAgents.slice(0, agentLimit).map((a) => (
            <button
              type='button'
              key={a.id}
              className='agentRailItem'
              aria-label={`Select agent ${a.name}`}
              aria-pressed={!allChats && selected === a.id}
              title={a.name}
              onClick={() => selectAgent(a.id)}
              disabled={navigationDisabled}
            >
              <span style={{ background: agentGradient(a.id) }}>
                {a.name
                  .split(/\s+/)
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || 'A'}
              </span>
            </button>
          ))}
          {filteredAgents.length > agentLimit ? (
            <button
              type='button'
              className='agentRailLoadMore'
              aria-label='Load more agents'
              title={`Load next ${Math.min(NAVIGATION_PAGE_SIZE, filteredAgents.length - agentLimit)} agents (${filteredAgents.length - agentLimit} remaining)`}
              onClick={() => setAgentLimit((n) => n + NAVIGATION_PAGE_SIZE)}
            >
              <span aria-hidden='true'>
                +{Math.min(NAVIGATION_PAGE_SIZE, filteredAgents.length - agentLimit)}
              </span>
            </button>
          ) : null}
        </div>
        <button
          type='button'
          className='agentRailSettings'
          aria-label='Settings'
          title='Settings'
          disabled={navigationDisabled}
          onClick={props.onOpenSettings}
        >
          <Icon name='settings' />
        </button>
      </nav>
      <aside className='agentConversationPanel' aria-label='Conversations'>
        <div className='agentPanelHeader'>
          <h2 title={title}>{title}</h2>
          <button
            type='button'
            aria-label='Agent and workspace settings'
            disabled={navigationDisabled}
            onClick={props.onOpenSettings}
          >
            ···
          </button>
        </div>
        {searchOpen ? (
          <label className='agentNavSearch'>
            <span className='sr-only'>Search agents</span>
            <input
              autoFocus
              type='search'
              placeholder='Find an agent…'
              value={agentQuery}
              onChange={(e) => setAgentQuery(e.target.value)}
            />
          </label>
        ) : null}
        <div className='agentNavFeedback'>
          {agentLoading ? (
            <span role='status'>Loading agents…</span>
          ) : agentError ? (
            <span role='alert'>
              {agentError} <button onClick={() => setRevision((v) => v + 1)}>Retry</button>
            </span>
          ) : !available.length ? (
            <span>No agents available.</span>
          ) : null}
        </div>
        <nav className='agentActions' aria-label='Workspace navigation'>
          {action('Schedules', 'schedules', props.onOpenSchedules)}
          {action('Remote Access', 'remote', props.onOpenRemote)}
          {action('Emails', 'emails', props.onOpenEmails)}
          <button
            type='button'
            className='agent-nav-action agentNewChat'
            onClick={() => {
              setAllChats(false);
              if (selected) setAgent(selected);
              props.onNewChat(selected || undefined);
            }}
            disabled={!props.connected || navigationDisabled}
          >
            <Icon name='plus' />
            <span>New chat</span>
          </button>
        </nav>
        <div className='agentChatHeading'>
          <span>Chats</span>
          <span>{chats.length}</span>
          <button
            type='button'
            aria-label='Refresh agents and conversations'
            onClick={() => setRevision((v) => v + 1)}
            disabled={navigationDisabled}
          >
            ↻
          </button>
        </div>
        <label className='agentNavSearch'>
          <span className='sr-only'>Search conversations</span>
          <input
            type='search'
            placeholder='Search conversations…'
            value={chatQuery}
            onChange={(e) => setChatQuery(e.target.value)}
          />
        </label>
        <div className='agentChatList'>
          {chatLoading ? (
            <p role='status' className='agentNavFeedback'>
              Loading conversations…
            </p>
          ) : null}
          {chatError ? (
            <p role='alert' className='agentNavFeedback'>
              {chatError} <button onClick={() => setRevision((v) => v + 1)}>Retry</button>
            </p>
          ) : null}
          <ConversationList
            sessions={visible.slice(0, chatLimit)}
            activeSessionId={activeId}
            onSelectSession={openChat}
            onDeleteSession={props.onDeleteSession}
            onResumeSession={props.onResumeSession}
            onRenameSession={(id, text) => useAppStore.getState().renameSession(id, text)}
            canManageSession={(chat) => Boolean(useAppStore.getState().sessions[chat.id])}
            maxVisible={Number.MAX_SAFE_INTEGER}
            emptyMessage={
              selected || allChats
                ? 'No conversations found.'
                : 'Choose an agent to browse its conversations.'
            }
          />
          {visible.length > chatLimit ? (
            <button
              type='button'
              className='agentLoadMoreChats'
              onClick={() => setChatLimit((n) => n + NAVIGATION_PAGE_SIZE)}
            >
              Load more conversations <span>({visible.length - chatLimit} remaining)</span>
            </button>
          ) : null}
        </div>
        <div className='agentAccountFooter'>{props.footer}</div>
      </aside>
    </div>
  );
}
