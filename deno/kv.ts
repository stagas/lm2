export type UserKv = {
  id: string
  name: string
  email: string
  passwordHash: string
  loops: LoopSummaryKv[]
}

export type LoopSummaryKv = {
  id: string
  title: string
  timestamp: number
  isPublic: boolean
}

export type SessionKv = {
  userId: string
  name: string
  email: string
  loops: LoopSummaryKv[]
}

export type LoopKv = {
  id: string
  userId: string
  title: string
  code: string
  timestamp: number
  isPublic: boolean
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
  userByEmail: (email: string) => ['u_by_e', email] as const,
  session: (token: string) => ['s', token] as const,
  sessionByUserId: (userId: string) => ['s_by_u', userId] as const,
  loop: (id: string) => ['l', id] as const,
}
