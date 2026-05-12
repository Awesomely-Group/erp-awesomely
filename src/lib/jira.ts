// Jira REST API v3 client
import type { TempoClient } from "./tempo";

export interface JiraProjectData {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  archived: boolean;
}

export interface JiraIssueData {
  numericId: number;
  key: string;
  summary: string;
  assigneeName: string | null;
  originalEstimateSeconds: number | null;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress: string;
  avatarUrl: string | null;
  active?: boolean;
}

export interface JiraPaginatedResponse<T> {
  values: T[];
  startAt: number;
  maxResults: number;
  total: number;
  isLast: boolean;
}

type JiraSearchIssue = {
  id: string;
  key: string;
  fields: {
    summary: string;
    assignee: { displayName: string } | null;
    timeoriginalestimate: number | null;
  };
};

export class JiraClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(domain: string, email: string, apiToken: string) {
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    this.baseUrl = `https://${cleanDomain}/rest/api/3`;
    this.authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
  }

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`Jira API error ${res.status}: ${await res.text()}`);
    }

    return res.json() as Promise<T>;
  }

  private mapIssue(i: JiraSearchIssue): JiraIssueData {
    return {
      numericId: Number(i.id),
      key: i.key,
      summary: i.fields.summary,
      assigneeName: i.fields.assignee?.displayName ?? null,
      originalEstimateSeconds: i.fields.timeoriginalestimate,
    };
  }

  async getUsersByAccountIds(
    accountIds: string[],
    tempoFallback?: TempoClient,
  ): Promise<Map<string, string>> {
    if (accountIds.length === 0) return new Map();
    const unique = [...new Set(accountIds)];

    // 1. Try Jira bulk endpoint (handles inactive users, one request)
    let jiraMap = new Map<string, string>();
    try {
      const url = new URL(`${this.baseUrl}/user/bulk`);
      unique.forEach((id) => url.searchParams.append("accountId", id));
      url.searchParams.set("maxResults", "100");
      const res = await fetch(url.toString(), {
        headers: { Authorization: this.authHeader, Accept: "application/json" },
        next: { revalidate: 0 },
      });
      if (!res.ok) throw new Error(`bulk ${res.status}`);
      const data = await res.json() as { values: Array<{ accountId: string; displayName: string }> };
      jiraMap = new Map(data.values.map((u) => [u.accountId, u.displayName]));
    } catch {
      // Fallback: individual calls
      const entries = await Promise.all(
        unique.map(async (accountId) => {
          try {
            const user = await this.fetch<{ displayName: string }>("/user", { accountId });
            return [accountId, user.displayName] as [string, string];
          } catch {
            return null;
          }
        })
      );
      for (const e of entries) { if (e) jiraMap.set(e[0], e[1]); }
    }

    // 2. For IDs not resolved by Jira (deleted users), try Tempo's user cache
    const unresolved = unique.filter((id) => !jiraMap.has(id));
    if (unresolved.length > 0 && tempoFallback) {
      try {
        const tempoMap = await tempoFallback.getUserDisplayNames();
        for (const id of unresolved) {
          const name = tempoMap.get(id);
          if (name) jiraMap.set(id, name);
        }
      } catch {
        // Tempo not available — keep what we have
      }
    }

    return jiraMap;
  }

  async getIssuesByKeys(keys: string[]): Promise<JiraIssueData[]> {
    const valid = keys.filter((k) => k != null && k.trim().length > 0);
    if (valid.length === 0) return [];
    const jql = `issueKey IN (${valid.map((k) => `"${k}"`).join(",")})`;
    const res = await this.fetch<{ issues: JiraSearchIssue[] }>("/search/jql", {
      jql,
      fields: "summary,assignee,timeoriginalestimate",
      maxResults: "200",
    });
    return res.issues.map((i) => this.mapIssue(i));
  }

  // Tempo v4 devuelve issue.id (numérico), no issue.key.
  // Este método resuelve los IDs numéricos a datos completos incluyendo key.
  async getIssuesByIds(ids: number[]): Promise<JiraIssueData[]> {
    if (ids.length === 0) return [];
    const jql = `id IN (${ids.join(",")})`;
    const res = await this.fetch<{ issues: JiraSearchIssue[] }>("/search/jql", {
      jql,
      fields: "summary,assignee,timeoriginalestimate",
      maxResults: "200",
    });
    return res.issues.map((i) => this.mapIssue(i));
  }

  async searchUsers(query: string): Promise<JiraUser[]> {
    if (!query.trim()) return [];
    const results = await this.fetch<
      Array<{
        accountId: string;
        displayName: string;
        emailAddress: string;
        active: boolean;
        avatarUrls: { "48x48": string };
      }>
    >("/user/search", { query, maxResults: "50", includeInactive: "true" });
    return results.map((u) => ({
      accountId: u.accountId,
      displayName: u.displayName,
      emailAddress: u.emailAddress,
      avatarUrl: u.avatarUrls?.["48x48"] ?? null,
      active: u.active,
    }));
  }

  async getUserByAccountId(accountId: string): Promise<JiraUser | null> {
    try {
      const u = await this.fetch<{
        accountId: string;
        displayName: string;
        emailAddress: string;
        active: boolean;
        avatarUrls: { "48x48": string };
      }>("/user", { accountId });
      return {
        accountId: u.accountId,
        displayName: u.displayName,
        emailAddress: u.emailAddress,
        avatarUrl: u.avatarUrls?.["48x48"] ?? null,
        active: u.active,
      };
    } catch {
      return null;
    }
  }

  async getAllProjects(): Promise<JiraProjectData[]> {
    const all: JiraProjectData[] = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const res = await this.fetch<JiraPaginatedResponse<JiraProjectData>>("/project/search", {
        startAt: startAt.toString(),
        maxResults: maxResults.toString(),
        expand: "description",
      });

      all.push(...res.values);
      if (res.isLast || res.values.length < maxResults) break;
      startAt += maxResults;
    }

    return all;
  }
}
