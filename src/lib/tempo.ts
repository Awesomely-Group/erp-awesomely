// Tempo REST API v4 client

export interface TempoWorklog {
  issue: { id: number; key?: string };
  timeSpentSeconds: number;
  author: { accountId: string };
  startDate: string;
  description?: string;
}

export interface TempoApprovedHoursResult {
  approvedHours: number;
  usedFallback: boolean;
}

interface TempoResponse {
  metadata: {
    count: number;
    offset: number;
    limit: number;
    next?: string;
  };
  results: TempoWorklog[];
}

interface TempoApprovalsResponse {
  results: Array<{
    status: { key: string };
    worklogs: Array<{ timeSpentSeconds: number }>;
  }>;
}

export class TempoClient {
  private readonly baseUrl = "https://api.tempo.io/4";
  private readonly authHeader: string;

  constructor(apiToken: string) {
    this.authHeader = `Bearer ${apiToken}`;
  }

  async getWorklogs(jiraProjectId: string | undefined, from: string, to: string): Promise<TempoWorklog[]> {
    const all: TempoWorklog[] = [];
    let offset = 0;
    const limit = 1000;

    while (true) {
      const url = new URL(`${this.baseUrl}/worklogs`);
      if (jiraProjectId !== undefined) url.searchParams.set("projectId", jiraProjectId);
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
      url.searchParams.set("limit", limit.toString());
      url.searchParams.set("offset", offset.toString());

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
        },
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        throw new Error(`Tempo API error ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as TempoResponse;
      all.push(...data.results);

      if (data.results.length < limit || !data.metadata.next) break;
      offset += limit;
    }

    return all;
  }

  /**
   * Returns accountIds for all users registered in this Tempo workspace.
   * Uses GET /4/users which is a single paginated request — much faster than
   * scanning worklogs. Throws if the endpoint is unavailable (caller should fall back).
   */
  async getUserAccountIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    let offset = 0;
    const limit = 200;

    while (true) {
      const url = new URL(`${this.baseUrl}/users`);
      url.searchParams.set("limit", limit.toString());
      url.searchParams.set("offset", offset.toString());

      const res = await fetch(url.toString(), {
        headers: { Authorization: this.authHeader, Accept: "application/json" },
        next: { revalidate: 0 },
      });

      if (!res.ok) throw new Error(`Tempo /users returned ${res.status}`);

      const data = (await res.json()) as {
        results: Array<{ accountId: string }>;
        metadata: { count: number; offset: number; limit: number; next?: string };
      };

      for (const u of data.results) {
        if (u.accountId) ids.add(u.accountId);
      }

      if (data.results.length < limit || !data.metadata.next) break;
      offset += limit;
    }

    return ids;
  }

  async getUniqueAuthorAccountIds(from: string, to: string): Promise<Set<string>> {
    const ids = new Set<string>();
    let offset = 0;
    const limit = 1000;

    while (true) {
      const url = new URL(`${this.baseUrl}/worklogs`);
      url.searchParams.set("from", from);
      url.searchParams.set("to", to);
      url.searchParams.set("limit", limit.toString());
      url.searchParams.set("offset", offset.toString());

      const res = await fetch(url.toString(), {
        headers: { Authorization: this.authHeader, Accept: "application/json" },
        next: { revalidate: 0 },
      });

      if (!res.ok) break;

      const data = (await res.json()) as TempoResponse;
      for (const w of data.results) ids.add(w.author.accountId);
      if (data.results.length < limit || !data.metadata.next) break;
      offset += limit;
    }

    return ids;
  }

  async getApprovedHours(
    jiraAccountId: string,
    from: string,
    to: string,
  ): Promise<TempoApprovedHoursResult> {
    const approvalsUrl = `${this.baseUrl}/approvals?accountId=${jiraAccountId}&from=${from}&to=${to}`;
    const approvalsRes = await fetch(approvalsUrl, {
      headers: { Authorization: this.authHeader, Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (approvalsRes.ok) {
      const data = (await approvalsRes.json()) as TempoApprovalsResponse;
      const approvedSeconds = data.results
        .filter((r) => r.status.key === "APPROVED")
        .flatMap((r) => r.worklogs)
        .reduce((sum, w) => sum + w.timeSpentSeconds, 0);
      return { approvedHours: Math.round((approvedSeconds / 3600) * 100) / 100, usedFallback: false };
    }

    const worklogs = await this.getWorklogs(undefined, from, to);
    const userSeconds = worklogs
      .filter((w) => w.author.accountId === jiraAccountId)
      .reduce((sum, w) => sum + w.timeSpentSeconds, 0);
    return { approvedHours: Math.round((userSeconds / 3600) * 100) / 100, usedFallback: true };
  }
}
