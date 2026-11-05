/** ipcMain.on does not await promises. Observe the complete event handler at
 * this fire-and-forget boundary, NOT inside Stop-and-continue: a failed Stop
 * must still reject there so continuation never runs. */
export async function observeClientEvent<T>(
  event: T,
  dispatch: (event: T) => void | Promise<void>,
  report: (error: unknown, event: T) => void | Promise<void>,
): Promise<void> {
  try { await dispatch(event); }
  catch (error) {
    try { await report(error, event); } catch { /* failed logging cannot create a second unhandled rejection */ }
  }
}
export function safeClientEventFailure(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  return ['SDK_STOP_NOT_VERIFIED', 'SDK_STOP_SCOPE_UNAVAILABLE'].includes(text) ? text : 'CLIENT_EVENT_FAILED';
}
