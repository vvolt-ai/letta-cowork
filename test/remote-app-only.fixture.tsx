import { createRoot } from 'react-dom/client';
import '../src/ui/index.css';
import App from '../src/ui/App';

// Local browser fixture only: no credentials, mailbox, real host or remote calls.
const user = { id: 'fixture-user', email: 'fixture@example.invalid', organizationId: 'fixture-org', role: 'super_admin', firstName: 'Fixture', lastName: 'User', phoneNumber: '' };
const state = { settings: { enabled: false, environmentName: 'Fixture remote host', allowedDirectories: [], autoApprove: false }, status: 'disabled', serverUrl: 'https://fixture.invalid' };
const calls: string[] = [];
const api = {
  apiIsAuthenticated: async () => { calls.push('auth'); return true; },
  apiGetCurrentUser: async () => { calls.push('profile'); return user; },
  getRemoteAccessState: async () => { calls.push('remote-state'); return state; },
  onRemoteAccessState: () => () => { },
  onAuthExpired: () => () => { },
  apiLogout: async () => { calls.push('logout'); },
};
(window as any).fixtureCalls = calls;
(window as any).electron = new Proxy(api, {
  get(target, key) {
    if (key in target) return target[key as keyof typeof target];
    return () => { calls.push('UNEXPECTED:' + String(key)); throw Error('Unexpected full-app fixture call: ' + String(key)); };
  }
});
// An old full-app destination must not revive a hidden view.
window.location.hash = '#/settings/administration';
createRoot(document.getElementById('root')!).render(<App />);
