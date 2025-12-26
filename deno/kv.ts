export type UserKv = {
  id: string
  name: string
  email: string
  passwordHash: string
  loops: LoopSummaryKv[]
  likes: string[]
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
  likes: string[]
}

export type LoopKv = {
  id: string
  userId: string
  title: string
  code: string
  timestamp: number
  isPublic: boolean
}

export type PublicLoopKv = {
  id: string
  title: string
  artist: string
  artistId: string
  timestamp: number
  isPublic: true
  likesCount: number
  commentsCount: number
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
  publicLoop: (id: string) => ['p', id] as const,
  publicLoops: () => ['p'] as const,
  loopLike: (loopId: string, userId: string) => ['lk', loopId, userId] as const,
  loopLikeCount: (loopId: string) => ['lkc', loopId] as const,
  loopCommentCount: (loopId: string) => ['cc', loopId] as const,
  loopComment: (loopId: string, timestamp: number, commentId: string) => ['c', loopId, timestamp, commentId] as const,
}
