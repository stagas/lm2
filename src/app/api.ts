import type { CommentData, LoopData, LoopUpsertRequest, PublicLoopListEntry, SessionData } from '../../deno/types.ts'

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

  async fetchPublicLoops(): Promise<LoopData[]> {
    const rows = await this.requestJson<PublicLoopListEntry[]>('/api/public-loops')
    return rows.map(r => ({
      id: r[0],
      artist: r[1],
      artistId: r[2],
      likesCount: r[3],
      commentsCount: r[4],
      remixesCount: r[5],
      title: r[6],
      timestamp: r[7],
      isPublic: true,
    }))
  }

  async fetchPublicLoopData(id: string): Promise<LoopData> {
    return await this.requestJson<LoopData>(`/api/public-loop/${encodeURIComponent(id)}`)
  }

  async prefetchPublicLoopCodes(ids: string[]): Promise<Record<string, string>> {
    const q = ids.map(encodeURIComponent).join(',')
    return await this.requestJson<Record<string, string>>(`/api/prefetch?ids=${q}`)
  }

  async fetchLikedLoops(): Promise<LoopData[]> {
    return await this.requestJson<LoopData[]>('/api/liked-loops')
  }

  async toggleLike(loopId: string): Promise<SessionData> {
    return await this.requestJson<SessionData>(`/api/loop/${encodeURIComponent(loopId)}/like`, {
      method: 'POST',
    })
  }

  async fetchLoopComments(loopId: string): Promise<CommentData[]> {
    return await this.requestJson<CommentData[]>(`/api/loop/${encodeURIComponent(loopId)}/comments`)
  }

  async createLoopComment(loopId: string, content: string): Promise<CommentData> {
    return await this.requestJson<CommentData>(`/api/loop/${encodeURIComponent(loopId)}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    })
  }

  async deleteLoopComment(loopId: string, commentId: string, timestamp: number): Promise<void> {
    await this.requestJson<{ ok: true }>(
      `/api/loop/${encodeURIComponent(loopId)}/comments/${encodeURIComponent(commentId)}?ts=${encodeURIComponent(String(timestamp))}`,
      { method: 'DELETE' },
    )
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

  async upsertLoop(id: string, body: LoopUpsertRequest): Promise<void> {
    await this.requestJson<{ ok: true }>(`/api/loop/${encodeURIComponent(id)}`, {
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
