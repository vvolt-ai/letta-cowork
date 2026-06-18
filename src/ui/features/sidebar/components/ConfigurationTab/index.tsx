import { memo, useState } from "react";
import { ChannelsManager } from "../../../channels/components/ChannelsManager";
import { SecretManager } from "../../../settings/components/SecretManager/SecretManager";

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

function DashboardAction({
  icon,
  title,
  description,
  actionLabel,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex min-h-[140px] flex-col items-start rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-2xl transition group-hover:bg-blue-100">
        {icon}
      </span>
      <span className="mt-4 text-lg font-bold text-slate-950">{title}</span>
      <span className="mt-1 text-sm leading-5 text-slate-500">{description}</span>
      <span className="mt-auto pt-4 text-sm font-bold text-blue-600">{actionLabel} →</span>
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
  const [secretManagerOpen, setSecretManagerOpen] = useState(false);
  const enabledSurfaces = [
    coworkSettings.showWhatsApp,
    coworkSettings.showTelegram,
    coworkSettings.showSlack,
    coworkSettings.showDiscord,
    coworkSettings.showEmailAutomation,
    coworkSettings.showLettaEnv,
  ].filter(Boolean).length;

  return (
    <div className="h-full min-h-0 overflow-auto rounded-2xl border border-[var(--color-border)] bg-slate-50">
      <div className="space-y-6 p-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-600">Vera Cowork</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Cowork Configuration</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Configure channels, agent tools, skills, MCP servers, runtime secrets, email automation, and advanced Letta runtime options from one dashboard.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-right">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Enabled surfaces</p>
              <p className="mt-1 text-3xl font-black text-blue-600">{enabledSurfaces}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardAction icon="💬" title="Channels" description="Open the full channel dashboard for WhatsApp, Slack, Discord, Telegram, Gmail, and more." actionLabel="View channels" onClick={onOpenChannels ?? (() => undefined)} />
          <DashboardAction icon="🧠" title="Skills" description="Install reusable skills from a URL so agents can gain repeatable capabilities." actionLabel="Download skill" onClick={onOpenSkillDownload} />
          <DashboardAction icon="🧩" title="MCP Servers" description="Connect external tool providers like Ryze, Composio, or custom MCP endpoints." actionLabel="Manage MCP" onClick={onOpenMcpServers} />
          <DashboardAction icon="🔐" title="Runtime Secrets" description="Add encrypted account secrets for agents and tools, exposed as environment variables." actionLabel="Open secrets" onClick={() => setSecretManagerOpen(true)} />
          <DashboardAction icon="💻" title="Letta CLI" description="Open a command-line interface for direct runtime operations and debugging." actionLabel="Open CLI" onClick={onOpenLettaCli} />
          <DashboardAction icon="⚙️" title="Environment Variables" description="Manage advanced Letta and Vera environment configuration." actionLabel={lettaEnvOpen ? "Hide env" : "Show env"} onClick={() => onLettaEnvOpenChange(!lettaEnvOpen)} />
          <DashboardAction icon="🤖" title="Agents" description="Add or route agents used by conversations, channels, and automation rules." actionLabel="Add agents" onClick={onOpenAddAgentsModal} />
          <DashboardAction icon="📧" title="Email" description={`${isEmailConnected ? "Connected" : "Not connected"}${unreadLabel ? ` · ${unreadLabel}` : ""}. ${autoSyncEnabled ? "Auto-sync is on." : "Auto-sync is off."}`} actionLabel={isEmailConnected ? "Open inbox" : "Connect email"} onClick={isEmailConnected ? onOpenEmailView : onConnectEmail} />
        </section>

        {isEmailConnected ? (
          <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="font-semibold text-slate-900">Email controls</span>
            <button onClick={onRefreshEmails} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh emails</button>
            <button onClick={() => onToggleAutoSync(!autoSyncEnabled)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{autoSyncEnabled ? "Disable auto-sync" : "Enable auto-sync"}</button>
            <button onClick={onDisconnectEmail} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Disconnect email</button>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <ChannelsManager />
        </section>
      </div>

      {secretManagerOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSecretManagerOpen(false)} />
          <div className="relative mx-4 flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="text-xl font-semibold text-gray-900">Runtime secrets</h2>
              <button onClick={() => setSecretManagerOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-auto">
              <SecretManager />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default ConfigurationTab;
