import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { remoteOnlySection } from '../../app-mode';
import type { RemoteOnlySection } from '../../app-mode';
import { useAuth } from '../../hooks/useAuth';
import { LoginScreen } from '../auth/components/LoginScreen';
import { ConfigurationTab } from '../sidebar/components/ConfigurationTab';

const noAction = () => { };
const hiddenIntegrations = { showWhatsApp: false, showTelegram: false, showSlack: false, showDiscord: false, showEmailAutomation: false, showLettaEnv: false };

interface RemoteOnlyHomeProps {
  section: RemoteOnlySection;
  onSectionChange: (section: RemoteOnlySection) => void;
  email?: string;
  onLogout: () => void;
  accountControls?: ReactNode;
  children: ReactNode;
}

/** No chat/router/settings entry points: old full-app UI state is never mounted. */
export function RemoteOnlyHome({ section, onSectionChange, email, onLogout, accountControls, children }: RemoteOnlyHomeProps) {
  return (
    <div className="flex h-screen min-h-0 flex-col bg-[var(--color-bg-100)] text-ink-900">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-sidebar)] px-6 pb-4 pt-9">
        <div><div className="text-lg font-semibold">Vera Cowork</div><div className="text-xs text-muted">Remote-only app</div></div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">{email}</span>{accountControls}
          <button type="button" onClick={onLogout} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">Sign out</button>
        </div>
      </header>
      <nav aria-label="Remote app navigation" className="flex shrink-0 gap-2 border-b border-[var(--color-border)] px-6 py-3">
        {(['profile', 'remote-access'] as const).map(id => (
          <button key={id} type="button" aria-current={section === id ? 'page' : undefined}
            onClick={() => onSectionChange(id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${section === id ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface)] text-ink-700'}`}>
            {id === 'profile' ? 'Profile' : 'Remote Access'}
          </button>
        ))}
      </nav>
      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl"><h1 className="mb-1 text-xl font-semibold">{section === 'profile' ? 'Profile' : 'Remote Access'}</h1>
          <p className="mb-6 text-sm text-muted">{section === 'profile' ? 'Manage your identity and contact details.' : 'Connect this computer as an authorized remote tool runner.'}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

export function RemoteOnlyApp() {
  const auth = useAuth();
  const [section, setSection] = useState<RemoteOnlySection>('remote-access');
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => window.electron?.onAuthExpired?.(() => auth.handleAuthError(new Error('Authentication expired'))), [auth.handleAuthError]);

  if (auth.isLoading) return <div className="flex h-screen items-center justify-center bg-[var(--color-bg-100)] text-ink-900">Loading…</div>;
  if (!auth.isAuthenticated) return <><LoginScreen onLoginSuccess={auth.checkAuth} />{error && <div role="alert" className="fixed bottom-4 left-4 right-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}</>;
  const memberships = (auth.user?.memberships ?? []).filter(m => m.isActive && m.organization?.isActive !== false);
  const switchOrganization = async (id: string) => {
    if (switching || id === auth.user?.organizationId) return;
    setSwitching(true); setError(null);
    const result = await auth.switchOrganization(id);
    if (!result.success) { setError(result.error ?? 'Could not switch organization'); setSwitching(false); return; }
    // Clear mounted old-account panel state; never carry remote configuration across scope.
    window.location.reload();
  };

  return <RemoteOnlyHome section={section} onSectionChange={value => setSection(remoteOnlySection(value))}
    email={auth.user?.email} onLogout={() => { setError(null); void auth.logout().catch(() => setError('Sign-out could not be confirmed. The local view was cleared; check the server connection.')); }}
    accountControls={memberships.length > 1 ? <select aria-label="Organization" value={auth.user?.organizationId ?? ''} disabled={switching}
      className="max-w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 text-sm"
      onChange={event => { void switchOrganization(event.target.value); }}>
      {memberships.map(m => <option key={m.organizationId} value={m.organizationId}>{m.name ?? m.organization?.name ?? m.organizationId}</option>)}
    </select> : null}>
    {error && <p role="alert" className="mb-4 text-sm text-red-500">{error}</p>}
    <ConfigurationTab key={`${auth.user?.id}:${auth.user?.organizationId}`} section={section}
      coworkSettings={hiddenIntegrations} lettaEnvOpen={false} onLettaEnvOpenChange={noAction}
      onOpenSkillDownload={noAction} onOpenLettaCli={noAction} onOpenMcpServers={noAction}
      isEmailConnected={false} unreadLabel="" onConnectEmail={noAction} onDisconnectEmail={noAction}
      onOpenEmailView={noAction} onRefreshEmails={noAction} />
  </RemoteOnlyHome>;
}
