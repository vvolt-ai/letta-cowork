import { memo, useEffect, useState } from "react";
import { IntegrationList } from "../IntegrationList";
import { useCoworkSettings } from "../../../../hooks/useCoworkSettings";

interface ConfigurationTabProps {
  coworkSettings: CoworkSettings;
  lettaEnvOpen: boolean;
  onLettaEnvOpenChange: (open: boolean) => void;
  onOpenChannels?: () => void;
  onOpenSkillDownload: () => void;
  onOpenLettaCli: () => void;
  onOpenMcpServers: () => void;
  isEmailConnected: boolean;
  unreadLabel: string;
  autoSyncEnabled: boolean;
  onToggleAutoSync: (enabled: boolean) => void;
  onConnectEmail: () => void;
  onDisconnectEmail: () => void;
  onOpenEmailView: () => void;
  onRefreshEmails: () => void;
  onOpenAddAgentsModal: () => void;
}

interface CoworkSettings {
  showWhatsApp: boolean;
  showTelegram: boolean;
  showSlack: boolean;
  showDiscord: boolean;
  showEmailAutomation: boolean;
  showLettaEnv: boolean;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[13px] font-semibold text-ink-900">{title}</h3>
        {description ? <p className="mt-1 text-[12px] leading-5 text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ActionCard({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex min-h-[92px] w-full items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 text-left transition hover:border-[var(--color-accent)]/50 hover:bg-gray-50 hover:shadow-sm"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-100">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-ink-900">{label}</span>
        <span className="mt-1 block text-[12px] leading-5 text-muted">{description}</span>
      </span>
      <svg className="mt-1 h-4 w-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export const ConfigurationTab = memo(function ConfigurationTab({
  coworkSettings,
  lettaEnvOpen,
  onLettaEnvOpenChange,
  onOpenChannels,
  onOpenSkillDownload,
  onOpenLettaCli,
  onOpenMcpServers,
  isEmailConnected,
  unreadLabel,
  autoSyncEnabled,
  onToggleAutoSync,
  onConnectEmail,
  onDisconnectEmail,
  onOpenEmailView,
  onRefreshEmails,
  onOpenAddAgentsModal,
}: ConfigurationTabProps) {
  const { updateCoworkSettings } = useCoworkSettings();
  const [settings, setSettings] = useState<CoworkSettings>(coworkSettings);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    email: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  useEffect(() => {
    setSettings(coworkSettings);
  }, [coworkSettings]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const currentUser = await window.electron.apiGetCurrentUser();
        if (!currentUser) return;
        setProfile({
          firstName: currentUser.firstName ?? '',
          lastName: currentUser.lastName ?? '',
          phoneNumber: currentUser.phoneNumber ?? '',
          email: currentUser.email ?? '',
        });
      } catch (error) {
        console.error("Failed to load profile:", error);
      }
    };

    loadProfile();
  }, []);

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const result = await window.electron.apiUpdateCurrentUserProfile({
        firstName: profile.firstName.trim() || undefined,
        lastName: profile.lastName.trim() || null,
        phoneNumber: profile.phoneNumber.trim() || null,
      });

      if (!result.success) {
        setProfileMessage(result.error || 'Failed to save profile');
        return;
      }

      const user = result.user;
      if (user) {
        setProfile({
          firstName: user.firstName ?? '',
          lastName: user.lastName ?? '',
          phoneNumber: user.phoneNumber ?? '',
          email: user.email ?? profile.email,
        });
      }
      setProfileMessage('Profile saved');
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Failed to save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleToggle = async (key: keyof CoworkSettings) => {
    const previousValue = settings[key];
    const nextValue = !previousValue;

    setSettings((prev) => ({ ...prev, [key]: nextValue }));
    updateCoworkSettings({ [key]: nextValue } as Partial<CoworkSettings>);

    try {
      await window.electron.updateCoworkSettings({ [key]: nextValue });
    } catch (error) {
      console.error("Failed to update settings:", error);
      setSettings((prev) => ({ ...prev, [key]: previousValue }));
      updateCoworkSettings({ [key]: previousValue } as Partial<CoworkSettings>);
    }
  };

  const handleReset = async () => {
    setSettingsLoading(true);
    try {
      const defaultSettings = await window.electron.resetCoworkSettings();
      setSettings(defaultSettings);
      updateCoworkSettings(defaultSettings);
    } catch (error) {
      console.error("Failed to reset settings:", error);
    } finally {
      setSettingsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="rounded-3xl border border-[var(--color-border)] bg-gradient-to-br from-white to-blue-50/40 p-5 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Configuration</p>
        <h2 className="mt-2 text-xl font-semibold text-ink-900">Set up your workspace</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Manage your identity, communication channels, integrations, and advanced developer options from one place.
        </p>
      </div>

      <Section
        title="Your profile"
        description="Keep your Cowork identity up to date. Phone number helps match external channel messages to your account."
      >
        <Panel>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-gray-700">Email</span>
              <input
                value={profile.email}
                disabled
                className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">First name</span>
              <input
                value={profile.firstName}
                onChange={(event) => setProfile((prev) => ({ ...prev, firstName: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Last name</span>
              <input
                value={profile.lastName}
                onChange={(event) => setProfile((prev) => ({ ...prev, lastName: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-gray-700">Phone number</span>
              <input
                value={profile.phoneNumber}
                onChange={(event) => setProfile((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                placeholder="+918849286808"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Include country code. We normalize this before saving.</p>
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-4">
            <button
              onClick={handleSaveProfile}
              disabled={profileSaving || !profile.firstName.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {profileSaving ? 'Saving...' : 'Save profile'}
            </button>
            {profileMessage ? (
              <span className={`text-sm ${profileMessage === 'Profile saved' ? 'text-green-600' : 'text-red-600'}`}>
                {profileMessage}
              </span>
            ) : null}
          </div>
        </Panel>
      </Section>

      <Section
        title="Communication"
        description="Connect where Cowork should listen and respond. Channels are for chat platforms; email automation handles mailbox workflows."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <ActionCard
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            }
            label="Channels"
            description="Configure Discord, Telegram, Slack, WhatsApp, and other chat entry points."
            onClick={onOpenChannels}
          />
          {settings.showEmailAutomation ? (
            <Panel className="md:col-span-2">
              <IntegrationList
                isEmailConnected={isEmailConnected}
                unreadLabel={unreadLabel}
                autoSyncEnabled={autoSyncEnabled}
                onToggleAutoSync={onToggleAutoSync}
                onConnect={onConnectEmail}
                onDisconnect={onDisconnectEmail}
                onOpenInbox={onOpenEmailView}
                onRefresh={onRefreshEmails}
                onManageRules={onOpenAddAgentsModal}
              />
            </Panel>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              Email automation is hidden. Enable it under Feature visibility below to configure mailbox workflows.
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Agent tools"
        description="Install skills, connect external MCP providers, or open the Letta CLI for advanced agent work."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <ActionCard
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            }
            label="Download skill"
            description="Install a reusable skill from a URL."
            onClick={onOpenSkillDownload}
          />
          <ActionCard
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="6" rx="1.5" />
                <rect x="3" y="14" width="18" height="6" rx="1.5" />
                <circle cx="7" cy="7" r="0.5" fill="currentColor" />
                <circle cx="7" cy="17" r="0.5" fill="currentColor" />
              </svg>
            }
            label="MCP servers"
            description="Connect external tool providers like Ryze, Composio, or custom MCP endpoints."
            onClick={onOpenMcpServers}
          />
          <ActionCard
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            }
            label="Letta CLI"
            description="Open a command-line interface for direct runtime operations."
            onClick={onOpenLettaCli}
          />
          {settings.showLettaEnv ? (
            <ActionCard
              icon={
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
                </svg>
              }
              label="Environment variables"
              description="Manage advanced Letta and Vera environment configuration."
              onClick={() => onLettaEnvOpenChange(!lettaEnvOpen)}
            />
          ) : null}
        </div>
      </Section>

      <Section
        title="Feature visibility"
        description="Control which configuration areas are visible in the app. These toggles take effect immediately."
      >
        <Panel>
          <div className="divide-y divide-gray-100">
            <SettingToggle
              label="Email automation"
              description="Show mailbox connection, auto-sync, and email workflow controls."
              enabled={settings.showEmailAutomation}
              onToggle={() => handleToggle('showEmailAutomation')}
            />
            <SettingToggle
              label="Environment variables"
              description="Show advanced Vera and Letta environment controls."
              enabled={settings.showLettaEnv}
              onToggle={() => handleToggle('showLettaEnv')}
            />
          </div>
          <div className="mt-4 border-t border-gray-100 pt-4 text-right">
            <button
              onClick={handleReset}
              disabled={settingsLoading}
              className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              {settingsLoading ? 'Resetting...' : 'Reset visibility defaults'}
            </button>
          </div>
        </Panel>
      </Section>
    </div>
  );
});

interface SettingToggleProps {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

function SettingToggle({ label, description, enabled, onToggle }: SettingToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-gray-500">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          enabled ? 'bg-blue-500' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export default ConfigurationTab;
