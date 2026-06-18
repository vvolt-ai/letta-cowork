import { memo } from "react";
import { ChannelsManager } from "../../../channels/components/ChannelsManager";

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

export const ConfigurationTab = memo(function ConfigurationTab(_props: ConfigurationTabProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-slate-50">
      <ChannelsManager />
    </div>
  );
});

export default ConfigurationTab;
