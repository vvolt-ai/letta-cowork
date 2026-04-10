import { memo } from "react";
import { IntegrationList } from "../IntegrationList";

interface ConfigurationTabProps {
  coworkSettings: {
    showEmailAutomation: boolean;
    showLettaEnv: boolean;
  };
  lettaEnvOpen: boolean;
  onLettaEnvOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  onOpenSkillDownload: () => void;
  onOpenLettaCli: () => void;
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
  onOpenSettings,
  onOpenSkillDownload,
  onOpenLettaCli,
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
          onClick={onOpenSettings}
        />
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

export default ConfigurationTab;
