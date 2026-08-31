import { useCallback, useRef, useState } from "react";

import type { ZohoEmail } from "../types";

interface UseEmailSelectionArgs {
  fetchEmailById: (folderId: string, messageId: string, accountIdOverride?: string) => Promise<unknown>;
  markMessagesAsRead: (messageIds: (number | string)[], accountIdOverride?: string) => Promise<unknown>;
  refreshEmailsForFolder: (folderId: string) => Promise<unknown>;
}

export function useEmailSelection({
  fetchEmailById,
  markMessagesAsRead,
  refreshEmailsForFolder,
}: UseEmailSelectionArgs) {
  const [selectedEmailId, setSelectedEmailId] = useState<string | undefined>(undefined);
  const [isEmailDetailsOpen, setIsEmailDetailsOpen] = useState(false);
  const [isEmailDetailsLoading, setIsEmailDetailsLoading] = useState(false);
  const [emailDetailsError, setEmailDetailsError] = useState<string | null>(null);
  const [viewingEmail, setViewingEmail] = useState<ZohoEmail | null>(null);
  const [emailDetails, setEmailDetails] = useState<unknown>(null);
  const viewRequestRef = useRef(0);

  const handleSelectEmail = useCallback(async (email: ZohoEmail) => {
    setSelectedEmailId(email.messageId);

    try {
      await markMessagesAsRead([email.messageId], email.accountId);
      await refreshEmailsForFolder(email.folderId);
    } catch (err) {
      console.error("failed to mark email as read", err);
    }

    fetchEmailById(email.folderId, email.messageId, email.accountId).catch((err) => {
      console.error("failed to load email by id", err);
    });

    const downloadAccountId = email.accountId;
    if (downloadAccountId && email.folderId) {
      window.electron
        .downloadEmailAttachment(email.folderId, email.messageId, downloadAccountId)
        .then((res) => {
          console.log("Download result:", res);
        })
        .catch((err) => {
          console.error("Failed to download attachments:", err);
        });
    }
  }, [fetchEmailById, markMessagesAsRead, refreshEmailsForFolder]);

  const handleViewEmail = useCallback(async (email: ZohoEmail) => {
    const requestId = ++viewRequestRef.current;
    setViewingEmail(email);
    setIsEmailDetailsOpen(true);
    setIsEmailDetailsLoading(true);
    setEmailDetailsError(null);
    setEmailDetails(null);

    try {
      const details = await fetchEmailById(email.folderId, email.messageId, email.accountId) as {
        emailContent: any,
        attachments: any
      };
      if (requestId !== viewRequestRef.current) return;
      setEmailDetails(details.emailContent);
    } catch (err) {
      console.error("failed to fetch email details", err);
      if (requestId === viewRequestRef.current) {
        setEmailDetailsError("Failed to load email details.");
      }
    } finally {
      if (requestId === viewRequestRef.current) {
        setIsEmailDetailsLoading(false);
      }
    }
  }, [fetchEmailById]);

  return {
    selectedEmailId,
    handleSelectEmail,
    isEmailDetailsOpen,
    isEmailDetailsLoading,
    emailDetailsError,
    viewingEmail,
    emailDetails,
    setIsEmailDetailsOpen,
    handleViewEmail,
  };
}
