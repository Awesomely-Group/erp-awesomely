import { prisma } from "@/lib/prisma";

interface TempoUser {
  accountId: string;
  displayName: string;
  email?: string;
  active?: boolean;
}

interface TempoResponse {
  results: TempoUser[];
  metadata: { next?: string };
}

async function fetchTempoUsers(token: string): Promise<TempoUser[]> {
  const all: TempoUser[] = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const res = await fetch(`https://api.tempo.io/4/users?limit=${limit}&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Tempo ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as TempoResponse;
    all.push(...data.results);
    if (!data.metadata.next || data.results.length < limit) break;
    offset += limit;
  }

  return all;
}

export default async function TempoUsersDebugPage(): Promise<React.JSX.Element> {
  const workspace = await prisma.jiraWorkspace.findFirst({
    where: { tempoApiToken: { not: null } },
  });

  if (!workspace?.tempoApiToken) {
    return <div className="p-8 text-red-500">No hay token de Tempo configurado.</div>;
  }

  let users: TempoUser[] = [];
  let error: string | null = null;

  try {
    users = await fetchTempoUsers(workspace.tempoApiToken);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-xl font-semibold">Debug — Usuarios Tempo</h1>
      <p className="text-sm text-muted-foreground">
        Workspace: <strong>{workspace.name}</strong> · Total: <strong>{users.length}</strong>
      </p>

      {error && (
        <pre className="bg-red-50 text-red-700 p-4 rounded text-xs">{error}</pre>
      )}

      {users.length > 0 && (
        <div className="overflow-auto border rounded">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2 font-medium">displayName</th>
                <th className="text-left p-2 font-medium">accountId</th>
                <th className="text-left p-2 font-medium">email</th>
                <th className="text-left p-2 font-medium">active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.accountId} className="border-t">
                  <td className="p-2">{u.displayName}</td>
                  <td className="p-2 font-mono text-xs text-muted-foreground">{u.accountId}</td>
                  <td className="p-2 text-muted-foreground">{u.email ?? "—"}</td>
                  <td className="p-2">
                    {u.active === false ? (
                      <span className="text-red-500">inactivo</span>
                    ) : (
                      <span className="text-green-600">activo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
