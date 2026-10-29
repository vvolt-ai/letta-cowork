/** Browser-safe presentation only. Never returns raw server bodies, URLs,
 * credentials or stack traces, and never triggers an automatic retry. */
export const TEMPORARY_SESSION_ERROR = 'A connection or server problem interrupted this request. It may be temporary—please try again in about 5 minutes. If any action may already have run, check its result before retrying.';
const MESSAGES = {
 auth:'Authentication failed. Check the selected account connection in Settings, and sign in again if your session has expired.',
 permission:'This account does not have permission to complete the request. Check access to the selected agent, conversation or resource before retrying.',
 scope:'The selected agent or account does not match this conversation. Select the correct conversation/account before retrying. Waiting alone will not fix this mismatch.',
 missing:'The selected agent, conversation or resource is no longer available. Check the selection before retrying.',
 model:'The selected model or request settings are not supported. Check the model and settings before retrying.',
 stop:'The previous request could not be confirmed stopped. Do not resend yet; check its status or contact support before starting another attempt.',
 unknown:'Something went wrong with this request. You can try again in about 5 minutes; if the problem continues, check your connection or contact support. Check any actions that may already have completed before retrying.',
};
export function sessionErrorMessage(value:unknown):string{
 const text=typeof value==='string'?value:value instanceof Error?`${value.name}: ${value.message}`:'';
 if(text===TEMPORARY_SESSION_ERROR||Object.values(MESSAGES).includes(text))return text;
 // Permission/identity/configuration errors take precedence over incidental
 // timeout words in a wrapped stack. They must not be labelled temporary.
 if(/SDK_STOP|STOP_PROOF|STOP_UNVERIFIED|STOP_NOT_VERIFIED|SDK_UNSETTLED|SDK_UNCERTAIN|SDK_TOOL_EFFECT|SDK_RUN_VERIFICATION_UNAVAILABLE|MEMORY_WRITE_OUTCOME_UNCERTAIN|SDK_TRANSPORT_CLEANUP_UNVERIFIED|SDK_STREAM_ENDED_WITHOUT_TERMINAL_RESULT|INVALID_SDK_TERMINAL_RESULT|tool effects?.*(?:unverified|reconciliation)/i.test(text))return MESSAGES.stop;
 if(/SCOPE_MISMATCH|IDENTITY_MISMATCH|ACTOR_CHANGED|MEMORY_SCOPE_CHANGED|does not belong to|Invalid conversation ID/i.test(text))return MESSAGES.scope;
 if(/\b401\b|unauthori[sz]ed|authentication failed|invalid api key|expired token|sign.?in required|AUTH_REQUIRED/i.test(text))return MESSAGES.auth;
 if(/\b403\b|forbidden|permission denied|not authorized|access denied/i.test(text))return MESSAGES.permission;
 if(/\b404\b|conversation.*not found|agent.*not found|resource.*not found/i.test(text))return MESSAGES.missing;
 if(/Invalid model|unsupported model|model.*not supported|SDK_WORKER_INCOMPATIBLE|invalid request|validation failed/i.test(text))return MESSAGES.model;
 if(/AbortError|timed? ?out|timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|network error|connection.*(?:lost|closed|failed)|socket.*(?:closed|disconnected)|\b(?:429|500|502|503|504)\b|temporarily unavailable|active or queued work/i.test(text))return TEMPORARY_SESSION_ERROR;
 return MESSAGES.unknown;
}
/** Unstamped cleanup is not a successful new turn or user acknowledgement. */
export function preserveSessionFailure(errorMessage:string|undefined,status:string):boolean{
 return Boolean(errorMessage)&&(status==='idle'||status==='completed');
}
/** Reject startup only after its owned cleanup settles; the IPC FIFO must not
 * admit a retry while the failed runtime can still emit terminal events. */
export async function waitForSessionInitialization<T>(identity:Promise<T>,settled:Promise<unknown>):Promise<T>{
 try{return await identity;}catch(error){await settled;throw error;}
}
/** SDK cleanup may set an abort signal after a genuine startup failure. */
export function wasUserCancellation(signalAbortedAtFailure:boolean,_error?:unknown):boolean{
 return signalAbortedAtFailure;
}
