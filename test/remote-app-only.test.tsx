import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RemoteOnlyHome } from '../src/ui/features/remote-only/RemoteOnlyApp';
import { remoteOnlySection } from '../src/ui/app-mode';

for (const section of ['profile', 'remote-access'] as const) {
  test(`remote-only home shows only its two feature links: ${section}`, () => {
    const html = renderToStaticMarkup(createElement(RemoteOnlyHome, { section, onSectionChange: () => { }, onLogout: () => { }, email: 'fixture@example.invalid', children: createElement('p', null, 'Selected panel') }));
    expect(html).toContain('Profile'); expect(html).toContain('Remote Access'); expect(html).toContain('Remote-only app'); expect(html).toContain('Sign out');
    expect(html).not.toMatch(/Skills|Schedules|Communication|MCP servers|Runtime secrets|Administration|Back to Cowork|New session|Chat workspace/);
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1);
  });
}
test('stale or unsupported navigation never opens hidden app features', () => {
  expect(remoteOnlySection('profile')).toBe('profile');
  for (const value of ['remote-access', 'skills', 'schedules', 'administration', 'chat', null, undefined, {}]) expect(remoteOnlySection(value)).toBe('remote-access');
});
