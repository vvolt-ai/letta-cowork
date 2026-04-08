import { useState, useCallback } from "react";
import type { ZohoEmail } from "../../../../../types";

/**
 * Hook for managing email filter state and logic
 */
export function useEmailFilters(onSearch?: (query: string) => void) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch && searchQuery.trim()) {
      onSearch(searchQuery.trim());
    }
  }, [onSearch, searchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    if (onSearch) {
      onSearch("");
    }
  }, [onSearch]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  return {
    searchQuery,
    handleSearch,
    handleClearSearch,
    handleSearchChange,
  };
}

/**
 * Filter emails based on criteria (for future use)
 */
export function filterEmails(
  emails: ZohoEmail[],
  filters?: {
    searchQuery?: string;
    showUnreadOnly?: boolean;
    showProcessedOnly?: boolean;
  }
): ZohoEmail[] {
  if (!filters) return emails;

  let filtered = emails;

  if (filters.searchQuery?.trim()) {
    const query = filters.searchQuery.toLowerCase();
    filtered = filtered.filter(email =>
      email.subject?.toLowerCase().includes(query) ||
      email.sender?.toLowerCase().includes(query) ||
      email.fromAddress?.toLowerCase().includes(query) ||
      email.summary?.toLowerCase().includes(query)
    );
  }

  return filtered;
}
