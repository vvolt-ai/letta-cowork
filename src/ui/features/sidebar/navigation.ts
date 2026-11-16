import type { SidebarSessionSummary } from './types';

export type NavigationAgent = {
  id: string;
  name: string;
  description?: string | null;
  lastUsedAt?: string | null;
};
export const NAVIGATION_PAGE_SIZE = 10;
export type AgentRecency = Record<string, number>;
const recencyKey = (scope: string) => `cowork.agent-recency.v1:${encodeURIComponent(scope)}`;
export function readAgentRecency(
  storage: Pick<Storage, 'getItem'> | undefined,
  scope: string,
): AgentRecency {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(recencyKey(scope)) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          ([id, time]) =>
            id.length > 0 &&
            id.length <= 200 &&
            !['__proto__', 'constructor', 'prototype'].includes(id) &&
            typeof time === 'number' &&
            Number.isFinite(time) &&
            time > 0,
        )
        .slice(0, 500),
    );
  } catch {
    return {};
  }
}
export function writeAgentRecency(
  storage: Pick<Storage, 'setItem'> | undefined,
  scope: string,
  usage: AgentRecency,
): void {
  try {
    storage?.setItem(
      recencyKey(scope),
      JSON.stringify(
        Object.fromEntries(
          Object.entries(usage)
            .filter(([, time]) => Number.isFinite(time) && time > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 500),
        ),
      ),
    );
  } catch {
    /* A preference-storage failure never blocks navigation. */
  }
}
export type NavigationConversation = {
  id: string;
  agentId?: string;
  summary?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastMessageAt?: string | null;
  model?: string | null;
};
export type NavigationChat = SidebarSessionSummary & { lettaConnectionId?: string; model?: string };
export const navigationDate = (value?: string | null) => {
  const n = value ? Date.parse(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
export function mergeNavigationChats(
  remote: NavigationConversation[],
  local: NavigationChat[],
  agentId?: string,
): NavigationChat[] {
  const byId = new Map<string, NavigationChat>();
  for (const item of remote) {
    if (agentId && item.agentId && item.agentId !== agentId) continue;
    byId.set(item.id, {
      id: item.id,
      status: 'idle',
      agentId: item.agentId ?? agentId,
      title: item.summary?.trim() || 'New conversation',
      createdAt: navigationDate(item.createdAt),
      updatedAt: navigationDate(item.lastMessageAt ?? item.updatedAt ?? item.createdAt),
      model: item.model?.trim() || undefined,
    });
  }
  for (const item of local) {
    if (agentId && item.agentId !== agentId) continue;
    const previous = byId.get(item.id);
    byId.set(item.id, {
      ...previous,
      ...item,
      title:
        item.title && !item.title.startsWith('conv-')
          ? item.title
          : (previous?.title ?? 'New conversation'),
      updatedAt: Math.max(item.updatedAt ?? 0, previous?.updatedAt ?? 0),
    });
  }
  return [...byId.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}
export function navigationAgents(
  agents: NavigationAgent[],
  chats: NavigationChat[],
  usage: AgentRecency = {},
  activeAgentId?: string,
): NavigationAgent[] {
  const byId = new Map(
    agents
      .filter((agent) => agent && typeof agent.id === 'string' && agent.id)
      .map((agent) => [
        agent.id,
        {
          ...agent,
          name: typeof agent.name === 'string' && agent.name.trim() ? agent.name : agent.id,
        },
      ]),
  );
  for (const chat of chats)
    if (chat.agentId && !byId.has(chat.agentId))
      byId.set(chat.agentId, { id: chat.agentId, name: chat.agentName || chat.agentId });
  const recent = new Map<string, number>();
  for (const agent of byId.values())
    recent.set(agent.id, Math.max(usage[agent.id] ?? 0, navigationDate(agent.lastUsedAt) ?? 0));
  for (const chat of chats)
    if (chat.agentId)
      recent.set(
        chat.agentId,
        Math.max(recent.get(chat.agentId) ?? 0, chat.updatedAt ?? chat.createdAt ?? 0),
      );
  return [...byId.values()].sort((a, b) => {
    if (a.id === activeAgentId && b.id !== activeAgentId) return -1;
    if (b.id === activeAgentId && a.id !== activeAgentId) return 1;
    return (recent.get(b.id) ?? 0) - (recent.get(a.id) ?? 0) || a.name.localeCompare(b.name);
  });
}
export function agentGradient(id: string): string {
  const palettes = [
    ['#17697a', '#deac77'],
    ['#695886', '#d9959d'],
    ['#416b63', '#98b9b0'],
    ['#82633b', '#d3a557'],
    ['#75576a', '#b18eaa'],
  ];
  const hash = [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0),
    p = palettes[hash % palettes.length];
  return `linear-gradient(145deg, ${p[0]}, ${p[1]})`;
}
