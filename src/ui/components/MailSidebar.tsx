import React from "react";
import { ZohoEmail } from "../types";

interface MailSidebarProps {
    emails: ZohoEmail[];
    selectedId?: string;
    onSelect: (email: ZohoEmail) => void;
    isFetching: boolean;
}

export const MailSidebar: React.FC<MailSidebarProps> = ({
    emails,
    selectedId,
    onSelect,
    isFetching
}) => {
    const formatDate = (timestamp: string) => {
        const date = new Date(Number(timestamp));
        return date.toLocaleDateString();
    };

    return (
        <aside className="flex flex-col w-70 bg-surface-cream bg-sidebar border-r border-gray-200 h-full">

            {/* Header */}
            <div className="p-4 border-b border-gray-200 font-semibold text-lg">
                Inbox
            </div>

            {/* Loading State */}
            {isFetching ? (
                <div className="p-4 text-sm text-gray-500">
                    Loading emails...
                </div>
            ) : <>

                {/* Mail List */}
                <div className="flex-1 overflow-y-auto">
                    {emails.length === 0 && (
                        <div className="p-4 text-sm text-gray-500">
                            No emails found
                        </div>
                    )}

                    {emails.map((email) => (
                        <div
                            key={email.messageId}
                            onClick={() => onSelect(email)}
                            className={`
              cursor-pointer p-4 border-b border-gray-100
              hover:bg-gray-100 transition
              ${selectedId === email.messageId ? "bg-gray-200" : ""}
            `}
                        >
                            <div className="flex justify-between items-center">
                                <span className="font-medium truncate">
                                    {email.sender}
                                </span>
                                <span className="text-xs text-gray-500">
                                    {formatDate(email.receivedTime)}
                                </span>
                            </div>

                            <div className="text-sm font-semibold truncate">
                                {email.subject}
                            </div>

                            <div className="text-xs text-gray-600 truncate">
                                {email.summary}
                            </div>

                            {email.hasAttachment && (
                                <div className="text-xs text-blue-500 mt-1">
                                    📎 Attachment
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </>}
        </aside>
    );
};
