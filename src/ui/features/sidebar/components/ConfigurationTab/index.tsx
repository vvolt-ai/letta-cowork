import { memo, useEffect, useState } from "react";
import { IntegrationList } from "../IntegrationList";
import { MigrateAgentRow } from "./MigrateAgentRow";
import { useCoworkSettings } from "../../../../hooks/useCoworkSettings";

interface ConfigurationTabProps {
  coworkSettings: CoworkSettings;
  lettaEnvOpen: boolean;
  onLettaEnvOpenChange: (open: boolean) => void;
  onOpenChannels?: () => void;
  onOpenSkillDownload: () => void;
  onOpenLettaCli: () => void;
  onOpenMcpServers: () => void;
  // Email integration props
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

function ConfigSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ConfigRow({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3.5 text-left transition hover:border-[var(--color-accent)]/40 hover:bg-gray-50 hover:shadow-sm"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-ink-600">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium text-ink-900">{label}</div>
        {description && (
          <div className="mt-0.5 text-[12px] text-muted">{description}</div>
        )}
      </div>
      <svg className="ml-auto h-4 w-4 shrink-0 text-ink-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
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
    <div className="max-w-2xl">
      {/* Environment */}
      <ConfigSection title="Environment">
        <div className="flex flex-col gap-2">
          {coworkSettings.showLettaEnv && (
            <ConfigRow
              icon={
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
                </svg>
              }
              label="Environment Variables"
              description="Manage Letta environment configuration"
              onClick={() => onLettaEnvOpenChange(!lettaEnvOpen)}
            />
          )}
          <ConfigRow
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            }
            label="Download Skill"
            description="Install a new skill from a URL"
            onClick={onOpenSkillDownload}
          />
          <ConfigRow
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            }
            label="Letta CLI"
            description="Open the Letta command-line interface"
            onClick={onOpenLettaCli}
          />
        </div>
      </ConfigSection>

      {/* Tool access — migrate to letta_v1_agent for Bash / Skill / file ops */}
      <ConfigSection title="Tool Access">
        <MigrateAgentRow />
      </ConfigSection>

      {/* MCP servers — external tool providers (Model Context Protocol) */}
      <ConfigSection title="MCP Servers">
        <ConfigRow
          icon={
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              {/* server stack icon */}
              <rect x="3" y="4" width="18" height="6" rx="1.5" />
              <rect x="3" y="14" width="18" height="6" rx="1.5" />
              <circle cx="7" cy="7" r="0.5" fill="currentColor" />
              <circle cx="7" cy="17" r="0.5" fill="currentColor" />
            </svg>
          }
          label="Manage MCP Servers"
          description="Connect external tool providers (Ryze, Composio, custom MCP endpoints)"
          onClick={onOpenMcpServers}
        />
      </ConfigSection>

      {/* Channels */}
      <ConfigSection title="Channels">
        <ConfigRow
          icon={
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          }
          label="Manage Channels"
          description="Configure Discord, Telegram, and other channels"
          onClick={onOpenChannels}
        />
      </ConfigSection>


      {/* Profile */}
      <ConfigSection title="Profile">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <div className="mb-4">
            <h4 className="text-[13.5px] font-medium text-ink-900">User profile</h4>
            <p className="mt-1 text-[12px] text-muted">
              Your phone number is used to match external channel identities, like WhatsApp senders, to your Cowork user.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Email</span>
              <input
                value={profile.email}
                disabled
                className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">First name</span>
                <input
                  value={profile.firstName}
                  onChange={(event) => setProfile((prev) => ({ ...prev, firstName: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Last name</span>
                <input
                  value={profile.lastName}
                  onChange={(event) => setProfile((prev) => ({ ...prev, lastName: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Phone number</span>
              <input
                value={profile.phoneNumber}
                onChange={(event) => setProfile((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                placeholder="+918849286808"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Include country code. We normalize this before saving.</p>
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSaveProfile}
              disabled={profileSaving || !profile.firstName.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {profileSaving ? 'Saving...' : 'Save profile'}
            </button>
            {profileMessage ? (
              <span className={`text-sm ${profileMessage === 'Profile saved' ? 'text-green-600' : 'text-red-600'}`}>
                {profileMessage}
              </span>
            ) : null}
          </div>
        </div>
      </ConfigSection>

      {/* Features */}
      <ConfigSection title="Features">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <p className="mb-4 text-sm text-gray-600">Enable or disable features. Changes take effect immediately.</p>
          <div className="space-y-3">
            <SettingToggle
              label="Email Automation"
              description="Enable email automation for unread emails"
              enabled={settings.showEmailAutomation}
              onToggle={() => handleToggle('showEmailAutomation')}
            />
            <SettingToggle
              label="Vera Environment"
              description="Show Vera environment settings"
              enabled={settings.showLettaEnv}
              onToggle={() => handleToggle('showLettaEnv')}
            />
          </div>
          <div className="mt-4 border-t pt-4 flex justify-end">
            <button
              onClick={handleReset}
              disabled={settingsLoading}
              className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              {settingsLoading ? 'Resetting...' : 'Reset to defaults'}
            </button>
          </div>
        </div>
      </ConfigSection>

      {/* Email Integrations */}
      {coworkSettings.showEmailAutomation && (
        <ConfigSection title="Integrations">
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
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
          </div>
        </ConfigSection>
      )}
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
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
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
