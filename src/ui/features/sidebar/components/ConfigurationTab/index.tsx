import { memo, useEffect, useState } from "react";
import { IntegrationList } from "../IntegrationList";
import { ChannelsManager } from "../../../channels/components/ChannelsManager";

interface ConfigurationTabProps {
  section?: "all" | "profile" | "communication" | "agent-tools" | "remote-access" | "administration";
  coworkSettings: CoworkSettings;
  lettaEnvOpen: boolean;
  onLettaEnvOpenChange: (open: boolean) => void;
  onOpenChannels?: () => void;
  onOpenSkillDownload: () => void;
  onOpenLettaCli: () => void;
  onOpenMcpServers: () => void;
  onOpenSuperAdmin?: () => void;
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

interface RemoteAccessSettings {
  enabled: boolean;
  environmentName: string;
  allowedDirectories: string[];
  autoApprove: boolean;
}

interface RemoteAccessState {
  settings: RemoteAccessSettings;
  status: "disabled" | "connecting" | "online" | "offline" | "error";
  environmentId?: string;
  lastHeartbeatAt?: string;
  lastError?: string;
  serverUrl?: string;
}

function Section({
  title,
  description,
  hideHeading = false,
  children,
}: {
  title: string;
  description?: string;
  hideHeading?: boolean;
  children: React.ReactNode;
}) {
  if (hideHeading) {
    return <section className="min-w-0">{children}</section>;
  }

  return (
    <section className="border-b border-[var(--color-border)] pb-6 last:border-b-0 last:pb-0">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-ink-900">{title}</h3>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
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
      className="group flex min-h-[68px] w-full items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left shadow-[var(--shadow-soft)] transition hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-surface-secondary)]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition group-hover:bg-blue-100">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-ink-900">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-4 text-muted">{description}</span>
      </span>
      <svg className="mt-1 h-4 w-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)] ${className}`}>
      {children}
    </div>
  );
}

export const ConfigurationTab = memo(function ConfigurationTab({
  section = "all",
  onOpenSuperAdmin,
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
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    email: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [verifiedPhoneNumber, setVerifiedPhoneNumber] = useState('');
  const [mobileOtp, setMobileOtp] = useState('');
  const [mobileOtpSending, setMobileOtpSending] = useState(false);
  const [mobileOtpVerifying, setMobileOtpVerifying] = useState(false);
  const [mobileOtpRequestedFor, setMobileOtpRequestedFor] = useState<string | null>(null);
  const [mobileOtpMessage, setMobileOtpMessage] = useState<string | null>(null);
  const [remoteState, setRemoteState] = useState<RemoteAccessState | null>(null);
  const [remoteDirsText, setRemoteDirsText] = useState("");
  const [remoteSaving, setRemoteSaving] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);


  useEffect(() => {
    const loadRemoteAccessState = async () => {
      try {
        const state = await window.electron.getRemoteAccessState();
        setRemoteState(state);
        setRemoteDirsText((state.settings.allowedDirectories ?? []).join('\n'));
      } catch (error) {
        console.error("Failed to load remote access state:", error);
      }
    };

    loadRemoteAccessState();
    const unsubscribe = window.electron.onRemoteAccessState?.((state: RemoteAccessState) => {
      setRemoteState(state);
      setRemoteDirsText((state.settings.allowedDirectories ?? []).join('\n'));
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const currentUser = await window.electron.apiGetCurrentUser();
        if (!currentUser) return;
        setCurrentUserRole(currentUser.role ?? null);
        const phoneNumber = currentUser.phoneNumber ?? '';
        setProfile({
          firstName: currentUser.firstName ?? '',
          lastName: currentUser.lastName ?? '',
          phoneNumber,
          email: currentUser.email ?? '',
        });
        setVerifiedPhoneNumber(phoneNumber);
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
      });

      if (!result.success) {
        setProfileMessage(result.error || 'Failed to save profile');
        return;
      }

      const user = result.user;
      if (user) {
        const phoneNumber = user.phoneNumber ?? verifiedPhoneNumber;
        setProfile({
          firstName: user.firstName ?? '',
          lastName: user.lastName ?? '',
          phoneNumber,
          email: user.email ?? profile.email,
        });
        setVerifiedPhoneNumber(phoneNumber);
      }
      setProfileMessage('Profile saved');
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Failed to save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleRequestMobileOtp = async () => {
    const phoneNumber = profile.phoneNumber.trim();
    if (!phoneNumber) {
      setMobileOtpMessage('Enter a phone number first');
      return;
    }

    setMobileOtpSending(true);
    setMobileOtpMessage(null);
    setMobileOtp('');
    try {
      const result = await window.electron.apiRequestMobileOtp(phoneNumber);
      if (!result.success) {
        setMobileOtpMessage(result.error || 'Failed to send verification code');
        return;
      }
      const normalizedPhone = result.phoneNumber || phoneNumber;
      setProfile((prev) => ({ ...prev, phoneNumber: normalizedPhone }));
      setMobileOtpRequestedFor(normalizedPhone);
      setMobileOtpMessage(`Code sent. It expires in ${result.expiresInMinutes ?? 10} minutes.`);
    } catch (error) {
      setMobileOtpMessage(error instanceof Error ? error.message : 'Failed to send verification code');
    } finally {
      setMobileOtpSending(false);
    }
  };

  const handleVerifyMobileOtp = async () => {
    const phoneNumber = (mobileOtpRequestedFor || profile.phoneNumber).trim();
    if (!phoneNumber || !mobileOtp.trim()) {
      setMobileOtpMessage('Enter the verification code');
      return;
    }

    setMobileOtpVerifying(true);
    setMobileOtpMessage(null);
    try {
      const result = await window.electron.apiVerifyMobileOtp(phoneNumber, mobileOtp.trim());
      if (!result.success) {
        setMobileOtpMessage(result.error || 'Failed to verify code');
        return;
      }
      const user = result.user;
      const savedPhoneNumber = user?.phoneNumber ?? phoneNumber;
      setProfile((prev) => ({
        ...prev,
        firstName: user?.firstName ?? prev.firstName,
        lastName: user?.lastName ?? prev.lastName,
        email: user?.email ?? prev.email,
        phoneNumber: savedPhoneNumber,
      }));
      setVerifiedPhoneNumber(savedPhoneNumber);
      setMobileOtp('');
      setMobileOtpRequestedFor(null);
      setMobileOtpMessage('Phone verified and saved');
    } catch (error) {
      setMobileOtpMessage(error instanceof Error ? error.message : 'Failed to verify code');
    } finally {
      setMobileOtpVerifying(false);
    }
  };


  const handleSaveRemoteAccess = async (updates: Partial<RemoteAccessSettings> = {}) => {
    if (!remoteState) return;
    setRemoteSaving(true);
    try {
      const nextSettings: RemoteAccessSettings = {
        ...remoteState.settings,
        allowedDirectories: remoteDirsText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        ...updates,
      };
      const state = await window.electron.updateRemoteAccessSettings(nextSettings);
      setRemoteState(state);
      setRemoteDirsText((state.settings.allowedDirectories ?? []).join('\n'));
    } catch (error) {
      console.error("Failed to update remote access:", error);
    } finally {
      setRemoteSaving(false);
    }
  };

  const handleAddRemoteDirectory = async () => {
    const dir = await window.electron.selectDirectory();
    if (!dir) return;
    setRemoteDirsText((prev) => Array.from(new Set([...prev.split('\n').filter(Boolean), dir])).join('\n'));
  };


  const phoneNumberChanged = profile.phoneNumber.trim() !== verifiedPhoneNumber.trim();
  const canVerifyRequestedPhone = Boolean(
    mobileOtpRequestedFor && mobileOtpRequestedFor === profile.phoneNumber.trim(),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {(section === "all" || section === "profile") ? <Section
        title="Your profile"
        description="Keep your Cowork identity up to date. Phone number helps match external channel messages to your account."
        hideHeading={section !== "all"}
      >
        <Panel>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-ink-700">Email</span>
              <input
                value={profile.email}
                disabled
                className="mt-1 h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 text-sm text-muted"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-ink-700">First name</span>
              <input
                value={profile.firstName}
                onChange={(event) => setProfile((prev) => ({ ...prev, firstName: event.target.value }))}
                className="mt-1 h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-ink-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-ink-700">Last name</span>
              <input
                value={profile.lastName}
                onChange={(event) => setProfile((prev) => ({ ...prev, lastName: event.target.value }))}
                className="mt-1 h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-ink-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>

            <div className="block sm:col-span-2">
              <label className="block">
                <span className="text-sm font-medium text-ink-700">Phone number</span>
                <input
                  value={profile.phoneNumber}
                  onChange={(event) => {
                    setProfile((prev) => ({ ...prev, phoneNumber: event.target.value }));
                    setMobileOtpMessage(null);
                    if (mobileOtpRequestedFor && event.target.value.trim() !== mobileOtpRequestedFor) {
                      setMobileOtpRequestedFor(null);
                      setMobileOtp('');
                    }
                  }}
                  placeholder="+918849286808"
                  className="mt-1 h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-ink-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted">Include country code.</span>
                {!phoneNumberChanged && verifiedPhoneNumber ? (
                  <span className="font-medium text-green-600">Verified</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestMobileOtp}
                    disabled={mobileOtpSending || !profile.phoneNumber.trim() || !phoneNumberChanged}
                    className="rounded-md border border-blue-200 px-2.5 py-1 font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                  >
                    {mobileOtpSending ? 'Sending...' : 'Send OTP'}
                  </button>
                )}
                {canVerifyRequestedPhone ? (
                  <>
                    <input
                      value={mobileOtp}
                      onChange={(event) => setMobileOtp(event.target.value)}
                      placeholder="Enter OTP"
                      className="h-7 w-28 rounded-md border border-gray-300 px-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyMobileOtp}
                      disabled={mobileOtpVerifying || !mobileOtp.trim()}
                      className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 font-medium text-white hover:brightness-95 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {mobileOtpVerifying ? 'Verifying...' : 'Verify'}
                    </button>
                  </>
                ) : null}
              </div>
              {mobileOtpMessage ? (
                <p className={`mt-1 text-xs ${mobileOtpMessage.includes('sent') || mobileOtpMessage.includes('verified') ? 'text-green-600' : 'text-red-600'}`}>
                  {mobileOtpMessage}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3 border-t border-[var(--color-border)] pt-3">
            <button
              onClick={handleSaveProfile}
              disabled={profileSaving || !profile.firstName.trim()}
              className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:brightness-95 disabled:cursor-not-allowed disabled:bg-gray-300"
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
      </Section> : null}

      {(section === "all" || section === "administration") && currentUserRole === 'super_admin' && onOpenSuperAdmin ? (
        <Section
          title="Administration"
          description="Super-admin only controls for global users, organizations, assignments, channels, and channel shares."
          hideHeading={section !== "all"}
        >
          <ActionCard
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3 4 7v6c0 5 3.4 7.6 8 8 4.6-.4 8-3 8-8V7l-8-4Z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            }
            label="Super-admin management"
            description="Manage every workspace user, organization, membership, channel, and channel share."
            onClick={onOpenSuperAdmin}
          />
        </Section>
      ) : null}

      {(section === "all" || section === "communication") ? <Section
        title="Communication"
        description="Connect where Cowork should listen and respond. Channels are for chat platforms; email automation handles mailbox workflows."
        hideHeading={section !== "all"}
      >
        <div className="grid gap-3">
          <Panel className="md:col-span-2">
            <ChannelsManager embedded />
          </Panel>
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
        </div>
      </Section> : null}

      {(section === "all" || section === "remote-access") ? <Section
        title="Remote access"
        description="Expose this desktop as an online tool runner for server-routed conversations such as WhatsApp. Phase 1 uses auto-approval plus path guardrails."
        hideHeading={section !== "all"}
      >
        <Panel>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Remote runner</p>
              <p className="mt-0.5 text-xs leading-5 text-muted">
                Status: <span className="font-semibold">{remoteState?.status ?? 'loading'}</span>
                {remoteState?.environmentId ? ` · ${remoteState.environmentId}` : ''}
              </p>
              {remoteState?.lastError ? <p className="mt-1 text-xs text-red-600">{remoteState.lastError}</p> : null}
            </div>
            <button
              onClick={() => handleSaveRemoteAccess({ enabled: !(remoteState?.settings.enabled ?? false) })}
              disabled={remoteSaving || !remoteState}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                remoteState?.settings.enabled ? 'bg-blue-500' : 'bg-gray-200'
              } disabled:opacity-50`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                remoteState?.settings.enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          <div className="mt-4 grid gap-4 border-t border-[var(--color-border)] pt-4">
            <label className="block">
              <span className="text-sm font-medium text-ink-700">Environment name</span>
              <input
                value={remoteState?.settings.environmentName ?? ''}
                onChange={(event) => setRemoteState((prev) => prev ? { ...prev, settings: { ...prev.settings, environmentName: event.target.value } } : prev)}
                placeholder="Bhavesh MacBook"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink-700">Allowed directories</span>
              <textarea
                value={remoteDirsText}
                onChange={(event) => setRemoteDirsText(event.target.value)}
                placeholder="One absolute directory per line"
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-muted">Tools can only read/run inside these directories.</p>
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={handleAddRemoteDirectory}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-gray-50"
              >
                Add directory
              </button>
              <button
                onClick={() => handleSaveRemoteAccess()}
                disabled={remoteSaving || !remoteState}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:brightness-95 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {remoteSaving ? 'Saving...' : 'Save remote access'}
              </button>
            </div>
          </div>
        </Panel>
      </Section> : null}

    </div>
  );
});


export default ConfigurationTab;
