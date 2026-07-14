/**
 * Per-conversation operation queue.
 *
 * A queued operation owns its conversation until its promise settles. Queue
 * generations let Stop/Delete invalidate work that was accepted earlier but
 * has not started yet, without affecting unrelated conversations.
 */

const conversationTurnTails = new Map<string, Promise<void>>();
const conversationQueueGenerations = new Map<string, number>();

export function cancelQueuedConversationTurns(conversationId: string): void {
    conversationQueueGenerations.set(
        conversationId,
        (conversationQueueGenerations.get(conversationId) ?? 0) + 1
    );
}

export function cancelAllQueuedConversationTurns(): void {
    for (const conversationId of conversationTurnTails.keys()) {
        cancelQueuedConversationTurns(conversationId);
    }
}

export async function enqueueConversationTurn(
    conversationId: string,
    task: (isCancelled: () => boolean) => Promise<void>
): Promise<void> {
    const generation = conversationQueueGenerations.get(conversationId) ?? 0;
    const isCancelled = (): boolean =>
        (conversationQueueGenerations.get(conversationId) ?? 0) !== generation;
    const previous = conversationTurnTails.get(conversationId) ?? Promise.resolve();
    const current = previous
        .catch(() => undefined)
        .then(async () => {
            if (isCancelled()) return;
            await task(isCancelled);
        });

    conversationTurnTails.set(conversationId, current);
    try {
        await current;
    } finally {
        if (conversationTurnTails.get(conversationId) === current) {
            conversationTurnTails.delete(conversationId);
            conversationQueueGenerations.delete(conversationId);
        }
    }
}
