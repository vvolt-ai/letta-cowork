// Local browser fixture: actual draft/store/hook/message component, no provider,
// authentication, live conversation or Electron operation.
import { createRoot } from 'react-dom/client';
import { useMessageWindow } from '../src/ui/hooks/useMessageWindow';
import { useAppStore } from '../src/ui/store/useAppStore';
import { AssistantMessage } from '../src/ui/features/chat/components/AssistantMessage';
import type { ServerEvent } from '../src/ui/types';
const sessionId = 'browser-streaming-fixture';
useAppStore.setState({ fetchSessionHistory: () => undefined });
useAppStore
  .getState()
  .handleServerEvent({ type: 'session.status', payload: { sessionId, status: 'running' } });
function Fixture() {
  const session = useAppStore((state) => state.sessions[sessionId]);
  const window = useMessageWindow(session?.messages ?? [], sessionId);
  const dispatch = (event: ServerEvent) => {
    useAppStore.getState().handleServerEvent(event);
    // Main chat also forwards raw lifecycle events; typed deltas must not double.
    window.handlePartialMessages(event);
  };
  const append = (content: string) =>
    dispatch({
      type: 'stream.message',
      payload: {
        sessionId,
        message: { type: 'assistant', uuid: 'message-browser-stream', content },
      },
    });
  return (
    <main>
      <h1>SDK progressive assistant rendering</h1>
      <button id='first' onClick={() => append('Live')}>
        First token
      </button>
      <button id='next' onClick={() => append(' response')}>
        Next tokens
      </button>
      <button
        id='finish'
        onClick={() =>
          dispatch({
            type: 'stream.message',
            payload: {
              sessionId,
              message: { type: 'result', success: true, durationMs: 1, conversationId: sessionId },
            },
          })
        }
      >
        Finish turn
      </button>
      <output id='state'>{session?.ephemeral.status}</output>
      <section id='progressive'>
        {window.showPartialMessage ? (
          <AssistantMessage agentName='Fixture' fallbackText={window.partialMessage} isStreaming />
        ) : null}
      </section>
      <section id='canonical'>
        {session?.messages
          .filter((message) => message.type === 'assistant')
          .map((message) => (
            <AssistantMessage key={message.uuid} agentName='Fixture' message={message} />
          ))}
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
