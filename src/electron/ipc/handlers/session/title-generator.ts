/**
 * Title generation from prompt
 */

/**
 * Generate a title from the first prompt message
 */
export function generateTitleFromPrompt(prompt: string): string {
    if (!prompt?.trim()) return "New conversation";

    const cleaned = prompt.trim();
    const withoutPrefix = cleaned
        .replace(/^(please|can you|could you|help me|i want|i need|let's|lets)\s*/i, "")
        .trim();

    const firstSentence = withoutPrefix.split(/[.!?]\s/)[0] || withoutPrefix;

    let title = firstSentence;
    if (title.length > 50) {
        const words = title.split(/\s+/);
        title = "";
        for (const word of words) {
            if ((title + " " + word).trim().length > 50) break;
            title = (title + " " + word).trim();
        }
        if (title.length === 0) {
            title = firstSentence.slice(0, 47) + "...";
        }
    }

    title = title.charAt(0).toUpperCase() + title.slice(1);
    return title || "New conversation";
}
