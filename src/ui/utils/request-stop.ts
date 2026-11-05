import {useAppStore} from '../store/useAppStore';
import {sessionErrorMessage} from '../../electron/libs/runner/session-error-display.js';
import type {ClientEvent} from '../types';

export function hasUnsettledStop(session: {ephemeral?: {stopState?: string;errorMessage?: string}} | undefined): boolean {
  return session?.ephemeral?.stopState === 'stopping' || session?.ephemeral?.stopState === 'unverified'
    || session?.ephemeral?.errorMessage === sessionErrorMessage('SDK_STOP_NOT_VERIFIED');
}
/** Stop progress/uncertainty is a warning, not a composer admission lock.
 * Backend FIFO/live SDK ownership decides when accepted intent can execute. */
export function isPromptTurnRunning(session:{ephemeral?:{stopState?:string;errorMessage?:string;status?:string}}|undefined,pendingStart=false):boolean {
  if(hasUnsettledStop(session)||session?.ephemeral?.errorMessage)return false;
  return pendingStart||['thinking','running_tool','generating','waiting_approval'].includes(session?.ephemeral?.status??'');
}
export function markStopRequested(sessionId: string, resumeDraft?: {queuedPrompt:string; typedText:string}): boolean {
  const current = useAppStore.getState().sessions[sessionId];
  if (!current || current.ephemeral.stopState === 'stopping') return false;
  useAppStore.setState(state => {
    const session = state.sessions[sessionId];
    if (!session) return state;
    return {pendingStart:false, sessions:{...state.sessions,[sessionId]:{...session,
      status:'running', ephemeral:{...session.ephemeral,stopState:'stopping',stopRequestId:undefined,pendingResultStatus:undefined,pendingResultError:undefined,
        stopResumeDraft:resumeDraft ?? session.ephemeral.stopResumeDraft}}}};
  });
  return true;
}
export function requestConversationStop(sessionId: string, send: (event: ClientEvent) => void): void {
  if (markStopRequested(sessionId)) send({type:'session.stop',payload:{sessionId}});
}
export function refuseInputDuringStop(sessionId: string): boolean {
  // Compatibility for existing callers; never discard a new explicit request.
  void sessionId;
  return false;
}
