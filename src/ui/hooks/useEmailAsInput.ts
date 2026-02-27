import { useCallback } from "react";
import type { ZohoEmail } from "../types";
import { useAppStore } from "../store/useAppStore";

export function useEmailAsInput() {
  const prompt = useAppStore((state) => state.prompt);
  const setPrompt = useAppStore((state) => state.setPrompt);

  const setEmailAsInput = useCallback(
    (email: ZohoEmail) => {
      const emailPrompt = [
        "Please help me with this email:",
        `From: ${email.sender || email.fromAddress || "Unknown sender"}`,
        `Subject: ${email.subject || "(No subject)"}`,
        `Summary: ${email.summary || "No preview"}`,
      ].join("\n");

      setPrompt(prompt.trim() ? `${prompt}\n\n${emailPrompt}` : emailPrompt);
    },
    [prompt, setPrompt]
  );

  return { setEmailAsInput };
}
