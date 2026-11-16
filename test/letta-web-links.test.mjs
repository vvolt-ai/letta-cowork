import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cases = [
  ['chat header', 'src/ui/features/chat/components/ConversationHeader.tsx', '${agentId}', '${sessionId}'],
  ['conversation viewer', 'src/ui/features/chat/components/ConversationViewer/index.tsx', '${session.agentId}', '${sessionId}'],
  ['email conversation', 'src/ui/features/email/components/EmailInboxModal/hooks/useEmailInbox.ts', '${effectiveAgentId}', '${conversationId}'],
];
for (const [name, file, agent, conversation] of cases) {
  test(`${name} uses chat.letta.com while retaining the existing agent path and conversation query`, () => {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.ok(source.includes('https://chat.letta.com/projects/default-project/agents/' + agent + '?conversation=' + conversation));
    assert.equal(source.includes('https://app.letta.com/'), false);
  });
}
test('setup documentation points at the new web host without altering the settings path', () => {
  const source = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(source.includes('[chat.letta.com/settings](https://chat.letta.com/settings)'));
  assert.equal(source.includes('https://app.letta.com/'), false);
});
