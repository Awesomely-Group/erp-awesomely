"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateJiraAccountId } from "../actions";
import type { JiraUser } from "@/lib/jira";

interface Props {
  supplierId: string;
  currentAccountId: string | null;
  currentDisplayName: string | null;
  workspaceId: string | null;
}

export function JiraUserPicker({
  supplierId,
  currentAccountId,
  currentDisplayName,
  workspaceId,
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JiraUser[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(currentAccountId);
  const [selectedDisplayName, setSelectedDisplayName] = useState<string | null>(currentDisplayName);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim() || !workspaceId) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ query, workspaceId });
        const res = await fetch(`/api/jira/users?${params.toString()}`);
        if (res.ok) {
          const data = (await res.json()) as JiraUser[];
          setResults(data);
        }
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, workspaceId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleSelect(user: JiraUser): void {
    setOpen(false);
    startTransition(async () => {
      await updateJiraAccountId(supplierId, user.accountId);
      setSelectedAccountId(user.accountId);
      setSelectedDisplayName(user.displayName);
    });
  }

  function handleClear(): void {
    setOpen(false);
    startTransition(async () => {
      await updateJiraAccountId(supplierId, null);
      setSelectedAccountId(null);
      setSelectedDisplayName(null);
    });
  }

  if (!workspaceId) {
    return (
      <span className="text-xs text-gray-400 italic">
        Configura un workspace de Jira primero
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={isPending}
          className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-indigo-600 transition-colors disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
          {selectedDisplayName ? (
            <span>{selectedDisplayName}</span>
          ) : (
            <span className="text-gray-400">Sin usuario de Jira</span>
          )}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-300" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
        {selectedAccountId && !isPending && (
          <button
            type="button"
            onClick={handleClear}
            className="text-gray-300 hover:text-red-400 transition-colors"
            title="Desvincular usuario"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        {isPending && (
          <svg className="animate-spin h-3.5 w-3.5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        )}
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-white rounded-lg shadow-lg border border-gray-200">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar usuario de Jira..."
              className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto">
            {results.length === 0 && query.trim() && (
              <li className="px-3 py-2 text-xs text-gray-400 text-center">Sin resultados</li>
            )}
            {results.length === 0 && !query.trim() && (
              <li className="px-3 py-2 text-xs text-gray-400 text-center">Escribe para buscar</li>
            )}
            {results.map((user) => (
              <li key={user.accountId}>
                <button
                  type="button"
                  onClick={() => handleSelect(user)}
                  className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-2 transition-colors"
                >
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full shrink-0" />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-gray-200 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{user.displayName}</p>
                    <p className="text-xs text-gray-400 truncate">{user.emailAddress}</p>
                  </div>
                  {user.accountId === selectedAccountId && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-500 shrink-0 ml-auto" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
