import { randomUUID } from 'node:crypto';
import { ipcMainHandle } from '../../utils/index.js';
import { runClientTool } from '../../services/client-tools/index.js';
import { getLivePatchProposal } from '../../services/client-tools/runners/coding.js';

function rendererToolContext() {
  return {
    signal: new AbortController().signal,
    toolCallId: `renderer-${randomUUID()}`,
  };
}

function displayOutput(output: string): string {
  try {
    const parsed = JSON.parse(output) as { output?: unknown };
    if (typeof parsed.output === 'string') return parsed.output;
  } catch {
    // Preserve plain-text tool output.
  }
  return output;
}

/** Renderer bridge for reviewing stored proposals. It accepts only proposal-owned selection IDs, never raw patches or paths. */
export function registerLivePatchHandlers(): void {
  ipcMainHandle('live-patch:get', async (_event, proposalId: string) => {
    return getLivePatchProposal(proposalId);
  });

  ipcMainHandle('live-patch:apply', async (
    _event,
    proposalId: string,
    selection?: { fileIds?: string[]; hunkIds?: string[] },
  ) => {
    const result = await runClientTool('LiveApplyPatch', { proposalId, ...selection }, rendererToolContext());
    if (result.isError) throw new Error(result.output);

    const proposal = await getLivePatchProposal(proposalId);
    return { proposal, output: displayOutput(result.output) };
  });

  ipcMainHandle('live-patch:undo', async (_event, proposalId: string) => {
    const result = await runClientTool('LiveUndoPatch', { proposalId }, rendererToolContext());
    if (result.isError) throw new Error(result.output);
    return { proposal: await getLivePatchProposal(proposalId), output: displayOutput(result.output) };
  });

  ipcMainHandle('live-patch:reject', async (_event, proposalId: string, reason?: string) => {
    const result = await runClientTool(
      'LiveRejectPatch',
      { proposalId, reason },
      rendererToolContext(),
    );
    if (result.isError) throw new Error(result.output);
    return getLivePatchProposal(proposalId);
  });
}
