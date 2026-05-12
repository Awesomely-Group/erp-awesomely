"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addJiraUser, removeJiraUser } from "../actions";
import type { JiraUser } from "@/lib/jira";

export interface JiraUserEntry {
  accountId: string;
  displayName: string | null;
}

interface Props {
  supplierId: string;
  initialUsers: JiraUserEntry[];
  workspaceId: string | null;
}

export function JiraUserList({ supplierId, initialUsers, workspaceId }: Props): React.JSX.Element {
  const [users, setUsers] = useState<JiraUserEntry[]>(initialUsers);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JiraUser[]>([]);
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

  function handleAdd(user: JiraUser): void {
    if (users.some((u) => u.accountId === user.accountId)) {
      setOpen(false);
      return;
    }
    setOpen(false);
    startTransition(async () => {
      await addJiraUser(supplierId, user.accountId);
      setUsers((prev) => [...prev, { accountId: user.accountId, displayName: user.displayName }]);
    });
  }

  function handleRemove(accountId: string): void {
    startTransition(async () => {
      await removeJiraUser(supplierId, accountId);
      setUsers((prev) => prev.filter((u) => u.accountId !== accountId));
    });
  }

  if (!workspaceId) {
    return (
      <span className="text-xs text-gray-400 italic">
        Configura un workspace de Jira primero
      </span>
    );
  }

  const linkedIds = new Set(users.map((u) => u.accountId));

  return (
    <div className="space-y-1.5">
      {users.map((user) => (
        <div key={user.accountId} className="flex items-center gap-1.5 group">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-gray-700">{user.displayName ?? user.accountId}</span>
          <button
            type="button"
            onClick={() => handleRemove(user.accountId)}
            disabled={isPending}
            className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
            title="Desvincular usuario"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      ))}

      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={isPending}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Añadir usuario
        </button>

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
              {results.map((user) => {
                const alreadyLinked = linkedIds.has(user.accountId);
                return (
                  <li key={user.accountId}>
                    <button
                      type="button"
                      onClick={() => handleAdd(user)}
                      disabled={alreadyLinked}
                      className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-default"
                    >
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full shrink-0" />
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-gray-200 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-800 truncate">{user.displayName}</p>
                          {user.active === false && (
                            <span className="shrink-0 text-xs text-gray-400">(inactivo)</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{user.emailAddress}</p>
                      </div>
                      {alreadyLinked && (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {isPending && (
          <svg className="animate-spin h-3.5 w-3.5 text-indigo-400 inline ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        )}
      </div>
    </div>
  );
}
