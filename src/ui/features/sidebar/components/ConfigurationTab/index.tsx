import { memo } from "react";
import { SidebarSection } from "../SidebarSection";
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
    <div className="flex h-full flex-col space-y-4">
      <SidebarSection title="Environment">
        <div className="space-y-2 text-sm text-ink-700">
          {coworkSettings.showLettaEnv && (
            <button
              onClick={() => {
                onLettaEnvOpenChange(!lettaEnvOpen);
              }}
              className="flex h-8 w-full items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-sm transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Environment
            </button>
          )}
          <button
            onClick={onOpenSkillDownload}
            className="flex h-8 w-full items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-sm transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Download Skill
          </button>
          <button
            onClick={onOpenLettaCli}
            className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            Letta CLI
          </button>
        </div>
      </SidebarSection>

      <SidebarSection title="Channels">
        <div className="text-sm text-ink-600">
          <p>Manage channels in Settings</p>
          <button
            onClick={onOpenSettings}
            className="mt-2 text-xs font-medium text-[var(--color-accent)] hover:underline"
          >
            Open Settings →
          </button>
        </div>
      </SidebarSection>

      {coworkSettings.showEmailAutomation && (
        <SidebarSection title="Integrations">
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
        </SidebarSection>
      )}
    </div>
  );
});

export default ConfigurationTab;
