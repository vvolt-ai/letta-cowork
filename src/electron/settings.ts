import Store from 'electron-store';

// Define the settings schema
interface CoworkSettings {
  showWhatsApp: boolean;
  showTelegram: boolean;
  showSlack: boolean;
  showDiscord: boolean;
  showEmailAutomation: boolean;
  showLettaEnv: boolean;
}

export interface AutoSyncRoutingRule {
  fromPattern: string;
  agentId: string;
}

export type AutoSyncProcessingMode = 'unread_only' | 'today_all';

export interface AutoSyncUnreadConfig {
  enabled: boolean;
  agentIds: string[];
  routingRules: AutoSyncRoutingRule[];
  sinceDate: string;
  processingMode: AutoSyncProcessingMode;
  markAsReadAfterProcess: boolean;
}

// Session metadata stored in electron-store
export interface StoredSession {
  id: string; // conversation ID (conv-xxx)
  agentId: string;
  agentName?: string;
  title: string;
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
}

export interface ProcessedUnreadEmailEntry {
  id: string;
  processedAt: number;
}

export type ProcessedUnreadEmailsStore = Record<string, ProcessedUnreadEmailEntry[] | string[]>;

export interface ProcessedUnreadEmailDebugInfo {
  mailboxKey: string;
  accountId: string;
  folderId: string;
  count: number;
  retentionDays: number;
  maxEntries: number;
  oldestProcessedAt?: number;
  newestProcessedAt?: number;
  entries: ProcessedUnreadEmailEntry[];
}

// ─── Email credentials (replaces keytar) ─────────────────────────────────────

interface EmailCredentials {
  email_access_token?: string;
  email_refresh_token?: string;
  email_account_id?: string;
  email_inbox_folder_id?: string;
}

type EmailCredentialKey = keyof EmailCredentials;

/** XOR + base64 — lightweight at-rest obfuscation (not cryptographic). */
const OBFUSCATION_KEY = 'vera-cowork-creds-2025';

function obfuscate(value: string): string {
  const keyBuf = Buffer.from(OBFUSCATION_KEY, 'utf8');
  const valBuf = Buffer.from(value, 'utf8');
  const result = Buffer.alloc(valBuf.length);
  for (let i = 0; i < valBuf.length; i++) {
    result[i] = valBuf[i] ^ keyBuf[i % keyBuf.length];
  }
  return result.toString('base64');
}

function deobfuscate(value: string): string {
  const keyBuf = Buffer.from(OBFUSCATION_KEY, 'utf8');
  const valBuf = Buffer.from(value, 'base64');
  const result = Buffer.alloc(valBuf.length);
  for (let i = 0; i < valBuf.length; i++) {
    result[i] = valBuf[i] ^ keyBuf[i % keyBuf.length];
  }
  return result.toString('utf8');
}

// ─────────────────────────────────────────────────────────────────────────────

interface SettingsStoreSchema {
  coworkSettings: CoworkSettings;
  autoSyncUnreadConfig: AutoSyncUnreadConfig;
  sessions: StoredSession[];
  processedUnreadEmails: ProcessedUnreadEmailsStore;
  emailCredentials: EmailCredentials;
}

const PROCESSED_UNREAD_RETENTION_DAYS = 30;
const PROCESSED_UNREAD_RETENTION_MS = PROCESSED_UNREAD_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const PROCESSED_UNREAD_MAX_ENTRIES = 5000;

// Default settings - all disabled
const defaultSettings: CoworkSettings = {
  showWhatsApp: false,
  showTelegram: false,
  showSlack: false,
  showDiscord: false,
  showEmailAutomation: false,
  showLettaEnv: false,
};

const defaultAutoSyncUnreadConfig: AutoSyncUnreadConfig = {
  enabled: false,
  agentIds: [],
  routingRules: [],
  sinceDate: '',
  processingMode: 'unread_only',
  markAsReadAfterProcess: true,
};

const sanitizeAutoSyncAgentIds = (agentIds: unknown): string[] => {
  if (!Array.isArray(agentIds)) return [];
  return Array.from(
    new Set(
      agentIds
        .filter((agentId): agentId is string => typeof agentId === 'string')
        .map((agentId) => agentId.trim())
        .filter((agentId) => agentId.length > 0)
    )
  );
};

const sanitizeAutoSyncRoutingRules = (routingRules: unknown): AutoSyncRoutingRule[] => {
  if (!Array.isArray(routingRules)) return [];

  const deduped = new Map<string, AutoSyncRoutingRule>();
  for (const rule of routingRules) {
    if (!rule || typeof rule !== 'object') continue;
    const candidate = rule as Partial<AutoSyncRoutingRule>;
    const fromPattern = typeof candidate.fromPattern === 'string' ? candidate.fromPattern.trim().toLowerCase() : '';
    const agentId = typeof candidate.agentId === 'string' ? candidate.agentId.trim() : '';
    if (!fromPattern || !agentId) continue;
    deduped.set(`${fromPattern}::${agentId}`, { fromPattern, agentId });
  }

  return Array.from(deduped.values());
};

const sanitizeAutoSyncSinceDate = (sinceDate: unknown): string => {
  return typeof sinceDate === 'string' ? sinceDate : '';
};

const sanitizeAutoSyncProcessingMode = (processingMode: unknown): AutoSyncProcessingMode => {
  return processingMode === 'today_all' ? 'today_all' : 'unread_only';
};

const sanitizeAutoSyncUnreadConfig = (config: Partial<AutoSyncUnreadConfig> | undefined): AutoSyncUnreadConfig => ({
  enabled: Boolean(config?.enabled),
  agentIds: sanitizeAutoSyncAgentIds(config?.agentIds),
  routingRules: sanitizeAutoSyncRoutingRules(config?.routingRules),
  sinceDate: sanitizeAutoSyncSinceDate(config?.sinceDate),
  processingMode: sanitizeAutoSyncProcessingMode(config?.processingMode),
  markAsReadAfterProcess: config?.markAsReadAfterProcess ?? true,
});

const buildProcessedUnreadMailboxKey = (accountId: string, folderId: string): string =>
  `${accountId}::${folderId}`;

const isValidProcessedUnreadEntry = (value: unknown): value is ProcessedUnreadEmailEntry => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProcessedUnreadEmailEntry>;
  return typeof candidate.id === 'string'
    && candidate.id.length > 0
    && typeof candidate.processedAt === 'number'
    && Number.isFinite(candidate.processedAt)
    && candidate.processedAt > 0;
};

function normalizeProcessedUnreadEntries(
  entries: ProcessedUnreadEmailEntry[] | string[] | undefined,
  now: number,
): ProcessedUnreadEmailEntry[] {
  if (!Array.isArray(entries) || entries.length === 0) return [];

  return entries
    .map((entry) => {
      if (typeof entry === 'string') {
        const id = entry.trim();
        return id ? { id, processedAt: now } : null;
      }

      if (isValidProcessedUnreadEntry(entry)) {
        return {
          id: entry.id.trim(),
          processedAt: entry.processedAt,
        };
      }

      return null;
    })
    .filter((entry): entry is ProcessedUnreadEmailEntry => Boolean(entry && entry.id.length > 0));
}

function sanitizeProcessedUnreadEntries(
  entries: ProcessedUnreadEmailEntry[] | string[] | undefined,
  now: number = Date.now(),
): ProcessedUnreadEmailEntry[] {
  const threshold = now - PROCESSED_UNREAD_RETENTION_MS;
  const deduped = new Map<string, ProcessedUnreadEmailEntry>();

  for (const entry of normalizeProcessedUnreadEntries(entries, now)) {
    if (entry.processedAt < threshold) continue;
    const existing = deduped.get(entry.id);
    if (!existing || entry.processedAt > existing.processedAt) {
      deduped.set(entry.id, entry);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.processedAt - a.processedAt)
    .slice(0, PROCESSED_UNREAD_MAX_ENTRIES);
}

function getProcessedUnreadEmailsStore(): ProcessedUnreadEmailsStore {
  return store.get('processedUnreadEmails', {});
}

function readProcessedUnreadEntries(accountId: string, folderId: string): ProcessedUnreadEmailEntry[] {
  const mailboxKey = buildProcessedUnreadMailboxKey(accountId, folderId);
  const processedUnreadEmails = getProcessedUnreadEmailsStore();
  const rawEntries = processedUnreadEmails[mailboxKey];
  const sanitizedEntries = sanitizeProcessedUnreadEntries(rawEntries);

  const rawSerialized = JSON.stringify(rawEntries ?? []);
  const sanitizedSerialized = JSON.stringify(sanitizedEntries);
  if (rawSerialized !== sanitizedSerialized) {
    store.set('processedUnreadEmails', {
      ...processedUnreadEmails,
      [mailboxKey]: sanitizedEntries,
    });
  }

  return sanitizedEntries;
}

// Create the electron store
const store = new Store<SettingsStoreSchema>({
  defaults: {
    coworkSettings: defaultSettings,
    autoSyncUnreadConfig: defaultAutoSyncUnreadConfig,
    sessions: [],
    processedUnreadEmails: {},
    emailCredentials: {},
  },
});

export function getCoworkSettings(): CoworkSettings {
  return store.get('coworkSettings', defaultSettings);
}

export function updateCoworkSettings(updates: Partial<CoworkSettings>): CoworkSettings {
  const current = getCoworkSettings();
  const updated = { ...current, ...updates };
  store.set('coworkSettings', updated);
  return updated;
}

export function resetCoworkSettings(): CoworkSettings {
  store.set('coworkSettings', defaultSettings);
  return defaultSettings;
}

export function getAutoSyncUnreadConfig(): AutoSyncUnreadConfig {
  return sanitizeAutoSyncUnreadConfig(store.get('autoSyncUnreadConfig', defaultAutoSyncUnreadConfig));
}

export function updateAutoSyncUnreadConfig(updates: Partial<AutoSyncUnreadConfig>): AutoSyncUnreadConfig {
  const current = getAutoSyncUnreadConfig();
  const updated = sanitizeAutoSyncUnreadConfig({
    ...current,
    ...updates,
  });
  store.set('autoSyncUnreadConfig', updated);
  return updated;
}

export function resetAutoSyncUnreadConfig(): AutoSyncUnreadConfig {
  store.set('autoSyncUnreadConfig', defaultAutoSyncUnreadConfig);
  return defaultAutoSyncUnreadConfig;
}

// Session storage functions
export function getStoredSessions(): StoredSession[] {
  return store.get('sessions', []);
}

export function addStoredSession(session: StoredSession): void {
  const sessions = getStoredSessions();
  // Check if session already exists
  const existingIndex = sessions.findIndex(s => s.id === session.id);
  if (existingIndex >= 0) {
    // Update existing session
    sessions[existingIndex] = session;
  } else {
    // Add new session
    sessions.unshift(session);
  }
  store.set('sessions', sessions);
}

export function removeStoredSession(sessionId: string): void {
  const sessions = getStoredSessions().filter(s => s.id !== sessionId);
  store.set('sessions', sessions);
}

export function updateStoredSession(sessionId: string, updates: Partial<StoredSession>): void {
  const sessions = getStoredSessions();
  const index = sessions.findIndex(s => s.id === sessionId);
  if (index >= 0) {
    sessions[index] = { ...sessions[index], ...updates };
    store.set('sessions', sessions);
  }
}

export function getProcessedUnreadEmailIds(accountId: string, folderId: string): string[] {
  return readProcessedUnreadEntries(accountId, folderId).map((entry) => entry.id);
}

export function setProcessedUnreadEmailIds(accountId: string, folderId: string, ids: string[]): string[] {
  const mailboxKey = buildProcessedUnreadMailboxKey(accountId, folderId);
  const processedUnreadEmails = getProcessedUnreadEmailsStore();
  const existingEntries = readProcessedUnreadEntries(accountId, folderId);
  const now = Date.now();
  const existingById = new Map(existingEntries.map((entry) => [entry.id, entry]));
  const mergedEntries = ids
    .filter((id) => typeof id === 'string' && id.length > 0)
    .map((id) => existingById.get(id) ?? { id, processedAt: now });
  const sanitizedEntries = sanitizeProcessedUnreadEntries(mergedEntries, now);

  store.set('processedUnreadEmails', {
    ...processedUnreadEmails,
    [mailboxKey]: sanitizedEntries,
  });

  return sanitizedEntries.map((entry) => entry.id);
}

export function clearProcessedUnreadEmailIds(accountId: string, folderId: string): void {
  const mailboxKey = buildProcessedUnreadMailboxKey(accountId, folderId);
  const processedUnreadEmails = getProcessedUnreadEmailsStore();
  if (!(mailboxKey in processedUnreadEmails)) {
    return;
  }

  const nextStore = { ...processedUnreadEmails };
  delete nextStore[mailboxKey];
  store.set('processedUnreadEmails', nextStore);
}

export function getProcessedUnreadEmailDebugInfo(
  accountId: string,
  folderId: string,
  limit: number = 10,
): ProcessedUnreadEmailDebugInfo {
  const mailboxKey = buildProcessedUnreadMailboxKey(accountId, folderId);
  const entries = readProcessedUnreadEntries(accountId, folderId);
  const sampledEntries = entries.slice(0, Math.max(0, limit));

  return {
    mailboxKey,
    accountId,
    folderId,
    count: entries.length,
    retentionDays: PROCESSED_UNREAD_RETENTION_DAYS,
    maxEntries: PROCESSED_UNREAD_MAX_ENTRIES,
    oldestProcessedAt: entries.length > 0 ? entries[entries.length - 1].processedAt : undefined,
    newestProcessedAt: entries.length > 0 ? entries[0].processedAt : undefined,
    entries: sampledEntries,
  };
}

// ─── Email credential helpers (electron-store backed, replaces keytar) ────────

export function getEmailCredential(key: EmailCredentialKey): string | null {
  const creds = store.get('emailCredentials', {});
  const val = creds[key];
  if (!val) return null;
  try {
    return deobfuscate(val);
  } catch {
    return null;
  }
}

export function setEmailCredential(key: EmailCredentialKey, value: string): void {
  const creds = store.get('emailCredentials', {});
  store.set('emailCredentials', { ...creds, [key]: obfuscate(value) });
}

export function deleteEmailCredential(key: EmailCredentialKey): void {
  const creds = store.get('emailCredentials', {}) as Record<string, string | undefined>;
  const next = { ...creds };
  delete next[key];
  store.set('emailCredentials', next as EmailCredentials);
}

export function clearAllEmailCredentials(): void {
  store.set('emailCredentials', {});
}

// ─────────────────────────────────────────────────────────────────────────────

export type { CoworkSettings };
