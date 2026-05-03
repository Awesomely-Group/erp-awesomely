// Tempo REST API v4 client

export interface TempoWorklog {
  issue: { key: string };
  timeSpentSeconds: number;
  author: { accountId: string };
  startDate: string;
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

export class TempoClient {
  private readonly baseUrl = "https://api.tempo.io/4";
  private readonly authHeader: string;

  constructor(apiToken: string) {
    this.authHeader = `Bearer ${apiToken}`;
  }

  async getWorklogs(projectKey: string, from: string, to: string): Promise<TempoWorklog[]> {
    const all: TempoWorklog[] = [];
    let offset = 0;
    const limit = 1000;

    while (true) {
      const url = new URL(`${this.baseUrl}/worklogs`);
      url.searchParams.set("project", projectKey);
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
}
