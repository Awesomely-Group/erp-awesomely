"use client";

import { useEffect, useState } from "react";
import type { JiraUser } from "@/lib/jira";

interface Props {
  accountId: string;
  displayName: string | null;
  workspaceId: string | null;
}

export function JiraUserChip({ accountId, displayName: initialDisplayName, workspaceId }: Props): React.JSX.Element {
  const [displayName, setDisplayName] = useState<string | null>(initialDisplayName);

  useEffect(() => {
    if (initialDisplayName || !workspaceId) return;
    const params = new URLSearchParams({ accountId, workspaceId });
    fetch(`/api/jira/users?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as JiraUser[];
        if (data[0]?.displayName) setDisplayName(data[0].displayName);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 w-fit">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
      </svg>
      {displayName ?? <span className="italic text-gray-400">cargando…</span>}
    </span>
  );
}
