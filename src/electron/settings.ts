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

// Session metadata stored in electron-store
export interface StoredSession {
  id: string; // conversation ID (conv-xxx)
  agentId: string;
  title: string;
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
}

// Default settings - all disabled
const defaultSettings: CoworkSettings = {
  showWhatsApp: false,
  showTelegram: false,
  showSlack: false,
  showDiscord: false,
  showEmailAutomation: false,
  showLettaEnv: false,
};

// Create the electron store
const store = new Store<{ coworkSettings: CoworkSettings; sessions: StoredSession[] }>({
  defaults: {
    coworkSettings: defaultSettings,
    sessions: [],
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

export type { CoworkSettings };
