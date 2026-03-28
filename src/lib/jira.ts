// Jira REST API v3 client

export interface JiraProjectData {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  archived: boolean;
}

export interface JiraPaginatedResponse<T> {
  values: T[];
  startAt: number;
  maxResults: number;
  total: number;
  isLast: boolean;
}

export class JiraClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(domain: string, email: string, apiToken: string) {
    this.baseUrl = `https://${domain}/rest/api/3`;
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

  async getAllProjects(): Promise<JiraProjectData[]> {
    const all: JiraProjectData[] = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const res = await this.fetch<JiraPaginatedResponse<JiraProjectData>>(
        "/project/search",
        {
          startAt: startAt.toString(),
          maxResults: maxResults.toString(),
          expand: "description",
        }
      );

      all.push(...res.values);
      if (res.isLast || res.values.length < maxResults) break;
      startAt += maxResults;
    }

    return all;
  }
}
