import type { LoopData, SessionData } from '../../deno/types.ts'

export class API {
  constructor(private fetch: typeof globalThis.fetch) {}

  async fetchSessionData(): Promise<SessionData> {
    const res = await this.fetch('/api/session')
    const json = await res.json()
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
}
