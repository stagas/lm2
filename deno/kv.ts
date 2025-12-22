export type UserKv = {
  id: string
  n: string
  p: string
  l: LoopSummaryKv[]
}

export type LoopSummaryKv = {
  id: string
  t: string
  ts: number
  pub: 0 | 1
}

export type SessionKv = {
  u: string
  n: string
  l: LoopSummaryKv[]
}

export type LoopKv = {
  id: string
  u: string
  t: string
  c: string
  ts: number
  pub: 0 | 1
}

let kv: Deno.Kv | null = null

export async function getKv(): Promise<Deno.Kv> {
  if (kv) return kv
  const path = Deno.env.get('KV_PATH')
  kv = await Deno.openKv(path || undefined)
  return kv
}

export const k = {
  user: (id: string) => ['u', id] as const,
  userByName: (name: string) => ['u_by_n', name] as const,
  session: (token: string) => ['s', token] as const,
  sessionByUser: (userId: string) => ['s_by_u', userId] as const,
  loop: (id: string) => ['l', id] as const,
}


