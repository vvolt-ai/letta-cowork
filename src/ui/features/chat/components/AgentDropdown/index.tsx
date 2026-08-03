import { useEffect, useMemo, useRef, useState } from "react";

interface Agent {
  id: string;
  name: string;
  description?: string | null;
}

interface AgentDropdownProps {
  value: string;
  onChange: (agentId: string) => void;
  disabled?: boolean;
}

export function AgentDropdown({ value, onChange, disabled = false }: AgentDropdownProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [searchResults, setSearchResults] = useState<Agent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevValueRef = useRef<string>(value);
  const requestIdRef = useRef(0);

  // Force close dropdown when value changes (user selects an agent)
  useEffect(() => {
    if (prevValueRef.current !== value && value) {
      setIsOpen(false);
    }
    prevValueRef.current = value;
  }, [value]);

  const fetchAgents = async (queryText = "") => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const fetchedAgents = await window.electron.listLettaAgents(queryText);
      if (requestId !== requestIdRef.current) return;
      if (queryText) setSearchResults(fetchedAgents);
      else {
        setAgents(fetchedAgents);
        setSearchResults(null);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error("Failed to fetch agents:", err);
      setError("Failed to load agents");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    // Load agents immediately on mount so selected value is displayed
    if (agents.length === 0) {
      fetchAgents();
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSearchResults(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const queryText = searchQuery.trim();
    if (!queryText) {
      setSearchResults(null);
      return;
    }
    const timer = window.setTimeout(() => void fetchAgents(queryText), 250);
    return () => window.clearTimeout(timer);
  }, [isOpen, searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openDropdown = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.stopPropagation();
    return !disabled && setIsOpen(!isOpen)
  }
  const selectedAgent = agents.find((agent) => agent.id === value)
    ?? searchResults?.find((agent) => agent.id === value);
  const locallyFilteredAgents = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return agents;
    return agents.filter((agent) =>
      [agent.name, agent.id, agent.description]
        .filter(Boolean)
        .some((field) => field!.toLocaleLowerCase().includes(query)),
    );
  }, [agents, searchQuery]);
  const displayedAgents = searchQuery.trim() && searchResults !== null
    ? searchResults
    : locallyFilteredAgents;

  return (
    <div className="relative w-full min-w-0" ref={dropdownRef}>
      <label className="text-xs text-ink-700">
        Agent
        <button
          type="button"
          className="mt-1 flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40 disabled:opacity-60"
          onClick={(e) => openDropdown(e)}
          disabled={disabled}
        >
          <span className={`min-w-0 truncate ${selectedAgent ? "text-ink-800" : "text-ink-500"}`}>
            {loading ? "Loading..." : selectedAgent ? selectedAgent.name : "Select an agent"}
          </span>
          <svg
            className={`h-4 w-4 shrink-0 text-ink-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </label>

      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-60 w-full min-w-0 overflow-auto rounded-lg border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border bg-surface-tertiary px-3 py-2">
            <span className="text-xs font-medium text-ink-600">Available Agents</span>
            <button
              onClick={() => void fetchAgents(searchQuery.trim())}
              disabled={loading}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-ink-600 hover:bg-surface hover:text-accent disabled:opacity-50"
              title="Refresh agents list"
            >
              <svg
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
          <div className="border-b border-border p-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search agents by name…"
              aria-label="Search agents"
              autoFocus
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none placeholder:text-ink-400 focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
          {loading && agents.length === 0 && (
            <div className="flex items-center justify-center p-4 text-sm text-ink-500">
              Loading agents...
            </div>
          )}
          {error && (
            <div className="flex items-center justify-between p-3 text-sm text-error">
              <span>{error}</span>
              <button
                onClick={() => void fetchAgents(searchQuery.trim())}
                className="text-xs text-accent hover:text-accent-hover"
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !error && agents.length === 0 && (
            <div className="p-4 text-sm text-ink-500">No agents found</div>
          )}
          {!loading && !error && agents.length > 0 && displayedAgents.length === 0 && (
            <div className="p-4 text-sm text-ink-500">No agents match “{searchQuery.trim()}”</div>
          )}
          {!error && displayedAgents.length > 0 && (
            <ul>
              {displayedAgents.map((agent) => (
                <li key={agent.id}>
                  <button
                    type="button"
                    className={`flex w-full items-start px-3 py-2 text-left text-sm hover:bg-surface-tertiary ${agent.id === value ? "bg-accent/10 text-accent" : "text-ink-700"
                      }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onChange(agent.id);
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{agent.name}</span>
                      {agent.description && (
                        <span className="text-xs text-ink-500 line-clamp-1">
                          {agent.description}
                        </span>
                      )}
                      <span className="truncate text-xs text-ink-400">{agent.id}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
