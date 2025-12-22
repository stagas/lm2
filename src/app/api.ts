import type { LoopData, LoopUpsertRequest, SessionData } from '../../deno/types.ts'

export class API {
  constructor(private fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {}

  private async requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await this.fetch(url, init)
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const message = (json && typeof json === 'object' && typeof (json as any).message === 'string')
        ? (json as any).message as string
        : `Request failed: ${res.status}`
      throw new Error(message)
    }
    return json as T
  }

  async fetchSessionData(): Promise<SessionData | null> {
    const res = await this.fetch('/api/session')
    const json = await res.json()
    if (res.status === 401) return null
    if (!res.ok) {
      throw new Error('Failed to fetch session: ' + json.message)
    }
    return json
  }

  async fetchLoopData(id: string): Promise<LoopData> {
    const res = await this.fetch(`/api/loop/${encodeURIComponent(id)}`)
    const json = await res.json()
    if (!res.ok) {
      throw new Error('Failed to fetch loop: ' + json.message)
    }
    return json
  }

  async login(email: string, password: string): Promise<SessionData> {
    return await this.requestJson<SessionData>('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  }

  async register(artistName: string, email: string, password: string): Promise<SessionData> {
    return await this.requestJson<SessionData>('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ artistName, email, password }),
    })
  }

  async logout(): Promise<void> {
    await this.requestJson<{ ok: true }>('/api/auth/logout', { method: 'POST' })
  }

  async upsertLoop(id: string, body: LoopUpsertRequest): Promise<SessionData> {
    return await this.requestJson<SessionData>(`/api/loop/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  async deleteLoop(id: string): Promise<SessionData> {
    return await this.requestJson<SessionData>(`/api/loop/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  }
}
