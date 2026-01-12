import { hash, verify } from '@felix/bcrypt'
import { Hono } from '@hono/hono'
import type { Context } from '@hono/hono'
import { serveStatic } from '@hono/hono/deno'
import type { ContentfulStatusCode } from '@hono/hono/utils/http-status'
import { z, type ZodError } from '@zod/zod'
import { clearSessionCookie, getSessionKvByToken, getSessionToken, setSessionCookie } from './auth.ts'
import { newId } from './id.ts'
import { getKv, k, type LoopKv, type LoopSummaryKv, type PublicLoopKv, type SessionKv, type UserKv } from './kv.ts'
import { runMigrations } from './migrations.ts'
import { parsePublicLoopKv } from './public-loop-kv.ts'
import {
  AuthLoginRequestSchema,
  AuthRegisterRequestSchema,
  type CommentData,
  CommentDataSchema,
  CreateCommentRequestSchema,
  ErrorResponseSchema,
  type LoopData,
  LoopDataSchema,
  LoopUpsertRequestSchema,
  OkEpochResponseSchema,
  type PublicLoopListEntry,
  type SessionData,
  SessionDataSchema,
  SessionEpochResponseSchema,
  UpdateArtistNameRequestSchema,
} from './types.ts'

const ADMIN_EMAILS = [
  'gstagas@gmail.com',
] as const

async function hashPasswordSha256(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function validatePassword(password: string, passwordHash: string): Promise<boolean> {
  const bcryptOk = await verify(password, passwordHash).catch(() => false)
  if (bcryptOk) return true
  const sha256Hash = await hashPasswordSha256(password)
  return sha256Hash === passwordHash
}

function jsonError(message: string, status: ContentfulStatusCode = 400) {
  return { body: ErrorResponseSchema.parse({ message }), status }
}

const fieldLabel: Record<string, string> = {
  artistName: 'Name',
  email: 'Email',
  password: 'Password',
  epoch: 'Epoch',
  title: 'Title',
  code: 'Code',
  isPublic: 'Public',
  timestamp: 'Timestamp',
  content: 'Comment',
}

function zodIssueMessage(issue: z.core.$ZodIssue): string {
  const key = typeof issue.path?.[0] === 'string' ? issue.path[0] : null
  const label = (key && fieldLabel[key]) || (key ? `${key[0]?.toUpperCase()}${key.slice(1)}` : 'Request')

  if (issue.code === 'invalid_type') {
    const input = ('input' in issue ? (issue as { input: unknown }).input : undefined) ?? undefined
    if (input === undefined) return key ? `${label} is required` : 'Request body is required'

    const expected = 'expected' in issue ? (issue as { expected: unknown }).expected : null
    if (expected === 'string') return `${label} must be a string`
    if (expected === 'number') return `${label} must be a number`
    if (expected === 'boolean') return `${label} must be a boolean`
    return `${label} is invalid`
  }

  if (issue.code === 'too_small') {
    if ('minimum' in issue && (issue as { minimum: unknown }).minimum === 1) return `${label} is required`
    return `${label} is too short`
  }

  if (issue.code === 'invalid_format') {
    if ('format' in issue && (issue as { format: unknown }).format === 'email') return `${label} is invalid`
    return `${label} is invalid`
  }

  if (issue.code === 'unrecognized_keys') {
    const k = issue.keys?.[0]
    return k ? `Unexpected field: ${k}` : 'Unexpected fields in request'
  }

  return key ? `${label} is invalid` : (issue.message || 'Invalid request')
}

function zodErrorMessage(err: ZodError): string {
  const issue = err.issues[0]
  if (!issue) return 'Invalid request'
  return zodIssueMessage(issue)
}

async function kvGetManyAll(kv: Deno.Kv, keys: readonly Deno.KvKey[]) {
  const out: Deno.KvEntryMaybe<unknown>[] = []
  for (let i = 0; i < keys.length; i += 10) {
    const chunk = keys.slice(i, i + 10) as unknown as readonly Deno.KvKey[]
    out.push(...(await kv.getMany(chunk)))
  }
  return out
}

async function appendHotLoopEvent(kv: Deno.Kv, loopId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const entry = await kv.get<unknown>(k.hotLoopEvents())
    const prev = Array.isArray(entry.value) ? entry.value : []
    const ids = prev.filter(x => typeof x === 'string') as string[]
    ids.push(loopId)
    while (ids.length > 200) ids.shift()

    const atomic = kv.atomic()
    if (entry.versionstamp) atomic.check(entry)
    atomic.set(k.hotLoopEvents(), ids)
    const res = await atomic.commit()
    if (res.ok) return
  }
}

function sessionToApi(session: SessionKv): SessionData {
  const likedLoopIds = Array.isArray((session as unknown as { likes?: unknown }).likes)
    ? (session as unknown as { likes: string[] }).likes
    : []
  const loops: LoopData[] = session.loops.map(loop => ({
    id: loop.id,
    title: loop.title,
    artist: session.name,
    artistId: session.userId,
    likesCount: 0,
    commentsCount: 0,
    remixesCount: 0,
    remixOfId: loop.remixOfId,
    isPublic: loop.isPublic,
    timestamp: loop.timestamp,
  }))

  const isAdmin = (session as SessionKv & { isAdmin?: boolean }).isAdmin ?? false
  return SessionDataSchema.parse({
    user: { id: session.userId, name: session.name, email: session.email, isAdmin },
    loops,
    likedLoopIds,
  })
}

function loopToApi(loop: LoopKv, user: { id: string; name: string }, remixesCount: number): LoopData {
  return LoopDataSchema.parse({
    id: loop.id,
    title: loop.title,
    artist: user.name,
    artistId: user.id,
    code: loop.code,
    likesCount: 0,
    commentsCount: 0,
    remixesCount,
    remixOfId: loop.remixOfId,
    isPublic: loop.isPublic,
    timestamp: loop.timestamp,
    comments: [],
  })
}

function publicLoopToApi(loop: PublicLoopKv): LoopData {
  return LoopDataSchema.parse({
    id: loop[0],
    title: loop[6],
    artist: loop[1],
    artistId: loop[2],
    likesCount: loop[3],
    commentsCount: loop[4],
    remixesCount: loop[5],
    remixOfId: loop[8] ? loop[8] : undefined,
    isPublic: true,
    timestamp: loop[7],
  })
}

async function requireSession(c: Context): Promise<{ token: string | null; session: SessionKv | null }> {
  const token = getSessionToken(c)
  if (!token) return { token: null, session: null as SessionKv | null }
  const session = await getSessionKvByToken(token)
  if (!session) return { token, session: null as SessionKv | null }
  const likes = Array.isArray((session as unknown as { likes?: unknown }).likes)
    ? (session as unknown as { likes: string[] }).likes
    : []
  return { token, session: { ...session, likes } }
}

async function requireAdmin(
  c: Context,
): Promise<{ token: string | null; session: SessionKv | null; response?: Response }> {
  const { token, session } = await requireSession(c)
  if (!token || !session) {
    const err = jsonError('Not authenticated', 401)
    return { token: null, session: null, response: c.json(err.body, err.status) }
  }
  const isAdmin = (session as SessionKv & { isAdmin?: boolean }).isAdmin ?? false
  if (!isAdmin) {
    const err = jsonError('Admin access required', 403)
    return { token: null, session: null, response: c.json(err.body, err.status) }
  }
  return { token, session }
}

const app = new Hono()

app.use('*', async (c, next) => {
  c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  c.res.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  await next()
})

app.use('/*', async (c, next) => {
  if (c.req.path.startsWith('/api/')) {
    await next()
    return
  }
  return serveStatic({ root: './dist' })(c, next)
})

app.get('/api/health', c => c.json({ ok: true }))

app.get('/api/session', async c => {
  const { session } = await requireSession(c)
  if (!session) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }
  return c.json(sessionToApi(session))
})

app.put('/api/user', async c => {
  const { token, session } = await requireSession(c)
  if (!token || !session) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  const raw = await c.req.json().catch(() => null)
  if (raw === null) {
    const err = jsonError('Invalid JSON', 400)
    return c.json(err.body, err.status)
  }
  const parsed = UpdateArtistNameRequestSchema.safeParse(raw)
  if (!parsed.success) {
    const err = jsonError(zodErrorMessage(parsed.error), 400)
    return c.json(err.body, err.status)
  }

  const kv = await getKv()
  const [sessionEntry, userEntry] = await kv.getMany([
    k.session(token),
    k.user(session.userId),
  ] as const)

  const currentSession = sessionEntry.value as SessionKv | null
  const user = userEntry.value as UserKv | null
  if (!currentSession || !user) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  const name = parsed.data.artistName
  const nextUser: UserKv = { ...user, name }
  const nextSession: SessionKv = { ...currentSession, name }

  await kv.atomic()
    .set(k.user(session.userId), nextUser)
    .set(k.session(token), nextSession)
    .commit()

  for (const loop of user.loops) {
    if (!loop.isPublic) continue
    const publicEntry = await kv.get<unknown>(k.publicLoop(loop.id))
    const pub = parsePublicLoopKv(publicEntry.value)
    if (!pub) continue
    const nextPublic: PublicLoopKv = [pub[0], name, pub[2], pub[3], pub[4], pub[5], pub[6], pub[7], pub[8]]
    await kv.atomic().set(k.publicLoop(loop.id), nextPublic).commit()
  }

  return c.json(sessionToApi(nextSession))
})

app.get('/api/public-loops', async c => {
  const kv = await getKv()
  const loops: PublicLoopListEntry[] = []
  for await (const entry of kv.list<unknown>({ prefix: k.publicLoops() })) {
    const v = parsePublicLoopKv(entry.value)
    if (v) loops.push(v)
  }
  loops.sort((a, b) => b[7] - a[7])
  return c.json(loops)
})

app.get('/api/best-loops', async c => {
  const kv = await getKv()
  const loops: PublicLoopListEntry[] = []
  for await (const entry of kv.list<unknown>({ prefix: k.publicLoops() })) {
    const v = parsePublicLoopKv(entry.value)
    if (v) loops.push(v)
  }

  const now = Date.now()
  const score = (l: PublicLoopListEntry) => {
    const likes = l[3]
    const comments = l[4]
    const remixes = l[5]
    const ts = l[7]
    const ageHr = Math.max(0, (now - ts) / 3_600_000)
    const denom = Math.pow(ageHr + 2, 1.5)
    return (likes * 3 + comments * 2 + remixes * 4) / denom
  }

  loops.sort((a, b) => score(b) - score(a) || (b[7] - a[7]))
  return c.json(loops)
})

app.get('/api/hot-loops', async c => {
  const kv = await getKv()
  const entry = await kv.get<unknown>(k.hotLoopEvents())
  const raw = Array.isArray(entry.value) ? entry.value : []
  const ids = raw.filter(x => typeof x === 'string') as string[]
  if (ids.length === 0) return c.json([])

  const counts = new Map<string, { count: number; last: number }>()
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!
    const prev = counts.get(id)
    if (prev) {
      prev.count++
      prev.last = i
    }
    else {
      counts.set(id, { count: 1, last: i })
    }
  }

  const rankedIds = Array.from(counts.entries())
    .sort((a, b) => (b[1].count - a[1].count) || (b[1].last - a[1].last))
    .map(([id]) => id)

  const entries = await kvGetManyAll(
    kv,
    rankedIds.map(id => k.publicLoop(id)) as unknown as readonly Deno.KvKey[],
  )
  const byId = new Map<string, PublicLoopListEntry>()
  for (let i = 0; i < rankedIds.length; i++) {
    const id = rankedIds[i]!
    const v = parsePublicLoopKv(entries[i]?.value ?? null)
    if (v) byId.set(id, v)
  }

  const out: PublicLoopListEntry[] = []
  for (const id of rankedIds) {
    const v = byId.get(id)
    if (v) out.push(v)
  }
  return c.json(out)
})

app.get('/api/public-loop/:id', async c => {
  const kv = await getKv()
  const id = c.req.param('id')
  const [loopEntry, publicEntry] = await kv.getMany([
    k.loop(id),
    k.publicLoop(id),
  ] as const)
  const loop = loopEntry.value as LoopKv | null
  const pub = parsePublicLoopKv(publicEntry.value)
  if (!loop || !pub || loop.isPublic !== true) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }
  return c.json(LoopDataSchema.parse({ ...publicLoopToApi(pub), code: loop.code }))
})

app.get('/api/public-loop/:id/remixes', async c => {
  const kv = await getKv()
  const id = c.req.param('id')

  const [loopEntry, publicEntry] = await kv.getMany([
    k.loop(id),
    k.publicLoop(id),
  ] as const)
  const loop = loopEntry.value as LoopKv | null
  const pub = parsePublicLoopKv(publicEntry.value)
  if (!loop || !pub || loop.isPublic !== true) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  const remixes: PublicLoopListEntry[] = []
  for await (const entry of kv.list<unknown>({ prefix: k.loops() })) {
    const v = entry.value as LoopKv | null
    if (!v || typeof v !== 'object') continue
    if (v.isPublic !== true) continue
    if (v.remixOfId !== id) continue
    const pubEntry = await kv.get<unknown>(k.publicLoop(v.id))
    const r = parsePublicLoopKv(pubEntry.value)
    if (r) remixes.push(r)
  }
  remixes.sort((a, b) => b[7] - a[7])
  return c.json(remixes)
})

app.get('/api/prefetch', async c => {
  const idsParam = c.req.query('ids') ?? ''
  const ids = Array.from(
    new Set(
      idsParam
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
        .map(x => decodeURIComponent(x)),
    ),
  )
  if (ids.length === 0) return c.json({})

  const kv = await getKv()
  const keys = ids.flatMap(id => [k.loop(id), k.publicLoop(id)])
  const entries = await kvGetManyAll(kv, keys as unknown as readonly Deno.KvKey[])

  const codes: Record<string, string> = {}
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!
    const loop = (entries[i * 2]?.value ?? null) as LoopKv | null
    const pub = parsePublicLoopKv(entries[i * 2 + 1]?.value ?? null)
    if (!loop || !pub || loop.isPublic !== true) continue
    codes[id] = loop.code
  }

  return c.json(codes)
})

app.get('/api/liked-loops', async c => {
  const { token, session } = await requireSession(c)
  if (!token || !session) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  const ids = session.likes
  if (ids.length === 0) return c.json([])

  const kv = await getKv()
  const entries = await kvGetManyAll(
    kv,
    ids.map(id => k.publicLoop(id)) as unknown as readonly Deno.KvKey[],
  )
  const loops: PublicLoopKv[] = []
  for (const e of entries) {
    const v = parsePublicLoopKv(e.value)
    if (v) loops.push(v)
  }
  loops.sort((a, b) => b[7] - a[7])
  return c.json(loops.map(publicLoopToApi))
})

app.post('/api/loop/:id/like', async c => {
  const { token, session } = await requireSession(c)
  if (!token || !session) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  const epoch = c.req.query('epoch')?.trim() ?? ''
  if (epoch.length === 0) {
    const err = jsonError('Epoch is required', 400)
    return c.json(err.body, err.status)
  }

  const id = c.req.param('id')
  const kv = await getKv()

  const [sessionEntry, userEntry, loopEntry, publicEntry, likeEntry, likeCountEntry] = await kv.getMany([
    k.session(token),
    k.user(session.userId),
    k.loop(id),
    k.publicLoop(id),
    k.loopLike(id, session.userId),
    k.loopLikeCount(id),
  ] as const)

  const currentSession = sessionEntry.value as SessionKv | null
  const user = userEntry.value as UserKv | null
  const loop = loopEntry.value as LoopKv | null
  const pub = parsePublicLoopKv(publicEntry.value)
  const hasLike = likeEntry.value === true
  const likeCount = (likeCountEntry.value as number | null) ?? pub?.[3] ?? 0

  if (!currentSession || !user) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }
  const currentLikes = Array.isArray((currentSession as unknown as { likes?: unknown }).likes)
    ? (currentSession as unknown as { likes: string[] }).likes
    : []

  if (!loop || !pub || loop.isPublic !== true) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  if (loop.userId === session.userId) {
    const err = jsonError('You can\'t like your own loop', 403)
    return c.json(err.body, err.status)
  }

  const nextLiked = !hasLike
  const nextCount = nextLiked ? likeCount + 1 : Math.max(0, likeCount - 1)
  const nextLikes = nextLiked
    ? (currentLikes.includes(id) ? currentLikes : [id, ...currentLikes])
    : currentLikes.filter(x => x !== id)

  const nextUser: UserKv = { ...user, likes: nextLikes }
  const nextSession: SessionKv = { ...currentSession, likes: nextLikes }
  const nextPublic: PublicLoopKv = [pub[0], pub[1], pub[2], nextCount, pub[4], pub[5], pub[6], pub[7], pub[8]]

  const a = kv.atomic()
    .set(k.user(session.userId), nextUser)
    .set(k.session(token), nextSession)
    .set(k.publicLoop(id), nextPublic)
    .set(k.loopLikeCount(id), nextCount)

  if (nextLiked) a.set(k.loopLike(id, session.userId), true)
  else a.delete(k.loopLike(id, session.userId))

  await a.commit()
  if (nextLiked) await appendHotLoopEvent(kv, id)
  return c.json(SessionEpochResponseSchema.parse({ epoch, sessionData: sessionToApi(nextSession) }))
})

app.get('/api/loop/:id/comments', async c => {
  const kv = await getKv()
  const id = c.req.param('id')

  const loopEntry = await kv.get<LoopKv>(k.loop(id))
  const loop = loopEntry.value ?? null
  if (!loop || loop.isPublic !== true) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  const comments: CommentData[] = []
  for await (const entry of kv.list<CommentData>({ prefix: ['c', id] })) {
    if (entry.value) comments.push(entry.value)
  }
  comments.sort((a, b) => b.timestamp - a.timestamp)
  return c.json(comments)
})

app.post('/api/loop/:id/comments', async c => {
  const { token, session } = await requireSession(c)
  if (!token || !session) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  const raw = await c.req.json().catch(() => null)
  if (raw === null) {
    const err = jsonError('Invalid JSON', 400)
    return c.json(err.body, err.status)
  }
  const parsed = CreateCommentRequestSchema.safeParse(raw)
  if (!parsed.success) {
    const err = jsonError(zodErrorMessage(parsed.error), 400)
    return c.json(err.body, err.status)
  }

  const kv = await getKv()
  const id = c.req.param('id')

  const [sessionEntry, userEntry, loopEntry, publicEntry, commentCountEntry] = await kv.getMany([
    k.session(token),
    k.user(session.userId),
    k.loop(id),
    k.publicLoop(id),
    k.loopCommentCount(id),
  ] as const)

  const currentSession = sessionEntry.value as SessionKv | null
  const user = userEntry.value as UserKv | null
  const loop = loopEntry.value as LoopKv | null
  const pub = parsePublicLoopKv(publicEntry.value)
  const commentsCount = (commentCountEntry.value as number | null) ?? 0

  if (!currentSession || !user) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }
  if (!loop || !pub || loop.isPublic !== true) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  const timestamp = Date.now()
  const commentId = newId(6)
  const comment = CommentDataSchema.parse({
    id: commentId,
    loopId: id,
    content: parsed.data.content,
    author: { id: user.id, name: user.name, email: user.email },
    timestamp,
  })

  const nextCount = commentsCount + 1
  const nextPublic: PublicLoopKv = [pub[0], pub[1], pub[2], pub[3], nextCount, pub[5], pub[6], pub[7], pub[8]]

  await kv.atomic()
    .set(k.loopComment(id, timestamp, commentId), comment)
    .set(k.loopCommentCount(id), nextCount)
    .set(k.publicLoop(id), nextPublic)
    .commit()

  await appendHotLoopEvent(kv, id)
  return c.json(comment)
})

app.delete('/api/loop/:id/comments/:commentId', async c => {
  const { token, session } = await requireSession(c)
  if (!token || !session) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  const id = c.req.param('id')
  const commentId = c.req.param('commentId')
  const tsParam = c.req.query('ts')
  const timestamp = tsParam ? Number(tsParam) : NaN
  if (!Number.isFinite(timestamp)) {
    const err = jsonError('Timestamp is required', 400)
    return c.json(err.body, err.status)
  }

  const kv = await getKv()
  const [sessionEntry, userEntry, loopEntry, publicEntry, commentCountEntry, commentEntry] = await kv.getMany([
    k.session(token),
    k.user(session.userId),
    k.loop(id),
    k.publicLoop(id),
    k.loopCommentCount(id),
    k.loopComment(id, timestamp, commentId),
  ] as const)

  const currentSession = sessionEntry.value as SessionKv | null
  const user = userEntry.value as UserKv | null
  const loop = loopEntry.value as LoopKv | null
  const pub = parsePublicLoopKv(publicEntry.value)
  const commentsCount = (commentCountEntry.value as number | null) ?? 0
  const comment = commentEntry.value as CommentData | null

  if (!currentSession || !user) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }
  if (!loop || !pub || loop.isPublic !== true) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }
  if (!comment) {
    const err = jsonError('Comment not found', 404)
    return c.json(err.body, err.status)
  }

  const isOwner = loop.userId === session.userId
  const isAuthor = comment.author.id === session.userId
  if (!isOwner && !isAuthor) {
    const err = jsonError('Not allowed', 403)
    return c.json(err.body, err.status)
  }

  const nextCount = Math.max(0, commentsCount - 1)
  const nextPublic: PublicLoopKv = [pub[0], pub[1], pub[2], pub[3], nextCount, pub[5], pub[6], pub[7], pub[8]]

  await kv.atomic()
    .delete(k.loopComment(id, timestamp, commentId))
    .set(k.loopCommentCount(id), nextCount)
    .set(k.publicLoop(id), nextPublic)
    .commit()

  return c.json({ ok: true })
})

app.post('/api/auth/register', async c => {
  const kv = await getKv()
  const raw = await c.req.json().catch(() => null)
  if (raw === null) {
    const err = jsonError('Invalid JSON', 400)
    return c.json(err.body, err.status)
  }
  const parsed = AuthRegisterRequestSchema.safeParse(raw)
  if (!parsed.success) {
    const err = jsonError(zodErrorMessage(parsed.error), 400)
    return c.json(err.body, err.status)
  }

  const name = parsed.data.artistName.trim()
  const email = parsed.data.email.trim().toLowerCase()
  const password = parsed.data.password
  const pw = await hash(password)
  for (let i = 0; i < 5; i++) {
    const userId = newId(6)
    const token = newId(6)
    const user: UserKv = { id: userId, name, email, passwordHash: pw, loops: [], likes: [] }
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase() as typeof ADMIN_EMAILS[number])
    const session: SessionKv = { userId, name, email, loops: user.loops, likes: user.likes, isAdmin } as SessionKv

    const commit = await kv.atomic()
      .check({ key: k.userByEmail(email), versionstamp: null })
      .check({ key: k.user(userId), versionstamp: null })
      .check({ key: k.session(token), versionstamp: null })
      .set(k.user(userId), user)
      .set(k.userByEmail(email), userId)
      .set(k.session(token), session)
      .set(k.sessionByUserId(userId), token)
      .commit()

    if (!commit.ok) {
      const existing = (await kv.get<string>(k.userByEmail(email))).value ?? null
      if (existing) {
        const err = jsonError('Email is already registered', 409)
        return c.json(err.body, err.status)
      }
      continue
    }

    setSessionCookie(c, token)
    return c.json(sessionToApi(session))
  }

  const err = jsonError('Failed to register', 500)
  return c.json(err.body, err.status)
})

app.post('/api/auth/login', async c => {
  const kv = await getKv()
  const raw = await c.req.json().catch(() => null)
  if (raw === null) {
    const err = jsonError('Invalid JSON', 400)
    return c.json(err.body, err.status)
  }
  const parsed = AuthLoginRequestSchema.safeParse(raw)
  if (!parsed.success) {
    const err = jsonError(zodErrorMessage(parsed.error), 400)
    return c.json(err.body, err.status)
  }

  const email = parsed.data.email.trim().toLowerCase()
  const password = parsed.data.password

  const userIdEntry = await kv.get<string>(k.userByEmail(email))
  const userId = userIdEntry.value ?? null
  if (!userId) {
    const err = jsonError('Invalid email or password', 401)
    return c.json(err.body, err.status)
  }

  const userEntry = await kv.get<UserKv>(k.user(userId))
  const user = userEntry.value ?? null
  if (!user) {
    const err = jsonError('Invalid email or password', 401)
    return c.json(err.body, err.status)
  }

  const ok = await validatePassword(password, user.passwordHash)
  if (!ok) {
    const err = jsonError('Invalid email or password', 401)
    return c.json(err.body, err.status)
  }

  const needsBcryptUpgrade = !user.passwordHash.startsWith('$2')
  if (needsBcryptUpgrade) {
    const newHash = await hash(password)
    await kv.set(k.user(userId), { ...user, passwordHash: newHash })
  }

  const prevTokenEntry = await kv.get<string>(k.sessionByUserId(userId))
  const prevToken = prevTokenEntry.value ?? null

  const likes = Array.isArray((user as unknown as { likes?: unknown }).likes)
    ? (user as unknown as { likes: string[] }).likes
    : []
  const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase() as typeof ADMIN_EMAILS[number])
  const session: SessionKv = { userId: user.id, name: user.name, email: user.email, loops: user.loops, likes,
    isAdmin } as SessionKv

  for (let i = 0; i < 5; i++) {
    const token = newId(6)
    const a = kv.atomic()
      .check({ key: k.session(token), versionstamp: null })
    if (prevToken) a.delete(k.session(prevToken))
    a.set(k.session(token), session)
    a.set(k.sessionByUserId(userId), token)
    const commit = await a.commit()
    if (!commit.ok) continue

    setSessionCookie(c, token)
    return c.json(sessionToApi(session))
  }

  const err = jsonError('Failed to login', 500)
  return c.json(err.body, err.status)
})

app.post('/api/auth/logout', async c => {
  const kv = await getKv()
  const token = getSessionToken(c)
  if (token) {
    const session = await getSessionKvByToken(token)
    const a = kv.atomic().delete(k.session(token))
    if (session) a.delete(k.sessionByUserId(session.userId))
    await a.commit()
  }
  clearSessionCookie(c)
  return c.json({ ok: true })
})

app.get('/api/loop/:id', async c => {
  const { token, session } = await requireSession(c)
  if (!token || !session) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  const kv = await getKv()
  const id = c.req.param('id')
  const [loopEntry, remixCountEntry] = await kv.getMany([
    k.loop(id),
    k.loopRemixCount(id),
  ] as const)
  const loop = loopEntry.value as LoopKv | null
  const remixesCount = (remixCountEntry.value as number | null) ?? 0
  if (!loop || loop.userId !== session.userId) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  return c.json(loopToApi(loop, { id: session.userId, name: session.name }, remixesCount))
})

app.put('/api/loop/:id', async c => {
  const { token, session } = await requireSession(c)
  if (!token || !session) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  const raw = await c.req.json().catch(() => null)
  if (raw === null) {
    const err = jsonError('Invalid JSON', 400)
    return c.json(err.body, err.status)
  }
  const parsed = LoopUpsertRequestSchema.safeParse(raw)
  if (!parsed.success) {
    const err = jsonError(zodErrorMessage(parsed.error), 400)
    return c.json(err.body, err.status)
  }

  const id = c.req.param('id')
  const kv = await getKv()

  const [sessionEntry, userEntry, loopEntry, likeCountEntry, commentCountEntry, remixCountEntry] = await kv.getMany([
    k.session(token),
    k.user(session.userId),
    k.loop(id),
    k.loopLikeCount(id),
    k.loopCommentCount(id),
    k.loopRemixCount(id),
  ] as const)

  const currentSession = sessionEntry.value as SessionKv | null
  const user = userEntry.value as UserKv | null
  const prevLoop = loopEntry.value as LoopKv | null
  const likesCount = (likeCountEntry.value as number | null) ?? 0
  const commentsCount = (commentCountEntry.value as number | null) ?? 0
  const ownRemixesCount = (remixCountEntry.value as number | null) ?? 0

  if (!currentSession || !user) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  if (prevLoop && prevLoop.userId !== session.userId) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  const data = parsed.data
  const epoch = data.epoch
  const nextRemixOfId = (() => {
    if (data.remixOfId === undefined) return prevLoop?.remixOfId
    if (data.remixOfId === null) return undefined
    const id = data.remixOfId.trim()
    return id.length > 0 ? id : undefined
  })()

  const prevContrib = prevLoop?.isPublic === true && prevLoop.remixOfId ? prevLoop.remixOfId : null
  const nextContrib = data.isPublic === true && nextRemixOfId ? nextRemixOfId : null

  const deltaByParent = new Map<string, number>()
  if (prevContrib) deltaByParent.set(prevContrib, (deltaByParent.get(prevContrib) ?? 0) - 1)
  if (nextContrib) deltaByParent.set(nextContrib, (deltaByParent.get(nextContrib) ?? 0) + 1)

  const parentIds = Array.from(deltaByParent).filter(([, d]) => d !== 0).map(([id]) => id)
  const parentEntries = parentIds.length === 0
    ? []
    : await kv.getMany(
      parentIds.flatMap(pid => [k.loopRemixCount(pid), k.publicLoop(pid)]) as unknown as readonly Deno.KvKey[],
    )

  const timestamp = Date.now()
  const loop: LoopKv = {
    id,
    userId: session.userId,
    title: data.title,
    code: data.code,
    timestamp,
    isPublic: data.isPublic,
    remixOfId: nextRemixOfId,
  }

  const becamePublic = loop.isPublic === true && prevLoop?.isPublic !== true

  const summary: LoopSummaryKv = {
    id,
    title: loop.title,
    timestamp: loop.timestamp,
    isPublic: loop.isPublic,
    remixOfId: loop.remixOfId,
  }

  const upsertSummary = (list: LoopSummaryKv[]) => {
    const idx = list.findIndex(x => x.id === id)
    if (idx === -1) return [summary, ...list]
    const next = list.slice()
    next[idx] = summary
    return next
  }

  const nextUser: UserKv = { ...user, loops: upsertSummary(user.loops) }
  const nextSession: SessionKv = { ...currentSession, loops: upsertSummary(currentSession.loops) }

  const a = kv.atomic()
    .set(k.loop(id), loop)
    .set(k.user(session.userId), nextUser)
    .set(k.session(token), nextSession)

  for (let i = 0; i < parentIds.length; i++) {
    const parentId = parentIds[i]!
    const delta = deltaByParent.get(parentId) ?? 0
    if (delta === 0) continue
    const remixEntry = parentEntries[i * 2]
    const pubEntry = parentEntries[i * 2 + 1]
    const curr = (remixEntry?.value as number | null) ?? 0
    const next = Math.max(0, curr + delta)
    a.set(k.loopRemixCount(parentId), next)
    const pub = parsePublicLoopKv(pubEntry?.value ?? null)
    if (pub) {
      const nextPub: PublicLoopKv = [pub[0], pub[1], pub[2], pub[3], pub[4], next, pub[6], pub[7], pub[8]]
      a.set(k.publicLoop(parentId), nextPub)
    }
  }

  if (loop.isPublic) {
    const pub: PublicLoopKv = [id, user.name, session.userId, likesCount, commentsCount, ownRemixesCount, loop.title,
      loop.timestamp, nextRemixOfId ?? '']
    a.set(k.publicLoop(id), pub)
  }
  else {
    a.delete(k.publicLoop(id))
  }
  await a.commit()

  if (becamePublic) await appendHotLoopEvent(kv, id)
  return c.json(OkEpochResponseSchema.parse({ ok: true, epoch }))
})

app.delete('/api/loop/:id', async c => {
  const { token, session } = await requireSession(c)
  if (!token || !session) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  const epoch = c.req.query('epoch')?.trim() ?? ''
  if (epoch.length === 0) {
    const err = jsonError('Epoch is required', 400)
    return c.json(err.body, err.status)
  }

  const id = c.req.param('id')
  const kv = await getKv()

  const [sessionEntry, userEntry, loopEntry] = await kv.getMany([
    k.session(token),
    k.user(session.userId),
    k.loop(id),
  ] as const)

  const currentSession = sessionEntry.value as SessionKv | null
  const user = userEntry.value as UserKv | null
  const loop = loopEntry.value as LoopKv | null

  if (!currentSession || !user) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  if (!loop || loop.userId !== session.userId) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  const parentId = loop.isPublic === true && loop.remixOfId ? loop.remixOfId : null
  const [parentRemixEntry, parentPubEntry] = parentId
    ? await kv.getMany([k.loopRemixCount(parentId), k.publicLoop(parentId)] as const)
    : ([null, null] as const)

  const remove = (list: LoopSummaryKv[]) => list.filter(x => x.id !== id)
  const nextUser: UserKv = { ...user, loops: remove(user.loops) }
  const nextSession: SessionKv = { ...currentSession, loops: remove(currentSession.loops) }

  const a = kv.atomic()
    .delete(k.loop(id))
    .delete(k.publicLoop(id))
    .set(k.user(session.userId), nextUser)
    .set(k.session(token), nextSession)
  if (parentId) {
    const curr = (parentRemixEntry?.value as number | null) ?? 0
    const next = Math.max(0, curr - 1)
    a.set(k.loopRemixCount(parentId), next)
    const pub = parsePublicLoopKv(parentPubEntry?.value ?? null)
    if (pub) {
      const nextPub: PublicLoopKv = [pub[0], pub[1], pub[2], pub[3], pub[4], next, pub[6], pub[7], pub[8]]
      a.set(k.publicLoop(parentId), nextPub)
    }
  }
  await a.commit()

  return c.json(SessionEpochResponseSchema.parse({ epoch, sessionData: sessionToApi(nextSession) }))
})

app.get('/api/admin/users', async c => {
  const { session, response } = await requireAdmin(c)
  if (response) return response
  if (!session) return c.json(jsonError('Not authenticated', 401).body, 401)

  const kv = await getKv()
  const users: Array<
    { id: string; name: string; email: string; loopsCount: number; likesCount: number; welcomeEmailSent: boolean }
  > = []
  for await (const entry of kv.list<unknown>({ prefix: ['u'] })) {
    const user = entry.value as UserKv | null
    if (!user || typeof user !== 'object') continue
    const welcomeEmailSent = (user as UserKv & { welcomeEmailSent?: boolean }).welcomeEmailSent ?? false
    users.push({
      id: user.id,
      name: user.name,
      email: user.email,
      loopsCount: user.loops.length,
      likesCount: user.likes.length,
      welcomeEmailSent,
    })
  }
  return c.json(users)
})

app.get('/api/admin/loops', async c => {
  const { session, response } = await requireAdmin(c)
  if (response) return response
  if (!session) return c.json(jsonError('Not authenticated', 401).body, 401)

  const kv = await getKv()
  const loops: Array<{
    id: string
    userId: string
    title: string
    isPublic: boolean
    timestamp: number
    remixOfId?: string
  }> = []
  for await (const entry of kv.list<unknown>({ prefix: k.loops() })) {
    const loop = entry.value as LoopKv | null
    if (!loop || typeof loop !== 'object') continue
    loops.push({
      id: loop.id,
      userId: loop.userId,
      title: loop.title,
      isPublic: loop.isPublic,
      timestamp: loop.timestamp,
      remixOfId: loop.remixOfId,
    })
  }
  loops.sort((a, b) => b.timestamp - a.timestamp)
  return c.json(loops)
})

app.post('/api/admin/login-as', async c => {
  const { session: adminSession, response } = await requireAdmin(c)
  if (response) return response
  if (!adminSession) return c.json(jsonError('Not authenticated', 401).body, 401)

  const raw = await c.req.json().catch(() => null)
  if (raw === null) {
    const err = jsonError('Invalid JSON', 400)
    return c.json(err.body, err.status)
  }
  const parsed = z.object({ userId: z.string().min(1) }).safeParse(raw)
  if (!parsed.success) {
    const err = jsonError('User ID is required', 400)
    return c.json(err.body, err.status)
  }

  const kv = await getKv()
  const userEntry = await kv.get<UserKv>(k.user(parsed.data.userId))
  const user = userEntry.value ?? null
  if (!user) {
    const err = jsonError('User not found', 404)
    return c.json(err.body, err.status)
  }

  const prevTokenEntry = await kv.get<string>(k.sessionByUserId(user.id))
  const prevToken = prevTokenEntry.value ?? null

  const likes = Array.isArray((user as unknown as { likes?: unknown }).likes)
    ? (user as unknown as { likes: string[] }).likes
    : []
  const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase() as typeof ADMIN_EMAILS[number])
  const session: SessionKv = { userId: user.id, name: user.name, email: user.email, loops: user.loops, likes,
    isAdmin } as SessionKv

  for (let i = 0; i < 5; i++) {
    const token = newId(6)
    const a = kv.atomic()
      .check({ key: k.session(token), versionstamp: null })
    if (prevToken) a.delete(k.session(prevToken))
    a.set(k.session(token), session)
    a.set(k.sessionByUserId(user.id), token)
    const commit = await a.commit()
    if (!commit.ok) continue

    setSessionCookie(c, token)
    return c.json(sessionToApi(session))
  }

  const err = jsonError('Failed to login as user', 500)
  return c.json(err.body, err.status)
})

app.post('/api/admin/send-welcome-email', async c => {
  const { session, response } = await requireAdmin(c)
  if (response) return response
  if (!session) return c.json(jsonError('Not authenticated', 401).body, 401)

  const raw = await c.req.json().catch(() => null)
  if (raw === null) {
    const err = jsonError('Invalid JSON', 400)
    return c.json(err.body, err.status)
  }
  const parsed = z.object({ userId: z.string().min(1) }).safeParse(raw)
  if (!parsed.success) {
    const err = jsonError('User ID is required', 400)
    return c.json(err.body, err.status)
  }

  const kv = await getKv()
  const userEntry = await kv.get<UserKv>(k.user(parsed.data.userId))
  const user = userEntry.value ?? null
  if (!user) {
    const err = jsonError('User not found', 404)
    return c.json(err.body, err.status)
  }

  // TODO: Implement actual email sending
  const nextUser: UserKv = { ...user, welcomeEmailSent: true } as UserKv
  await kv.set(k.user(parsed.data.userId), nextUser)

  return c.json({ ok: true, message: 'Welcome email sent (not implemented)' })
})

app.delete('/api/admin/user/:id', async c => {
  const { session, response } = await requireAdmin(c)
  if (response) return response
  if (!session) return c.json(jsonError('Not authenticated', 401).body, 401)

  const id = c.req.param('id')
  const kv = await getKv()

  const userEntry = await kv.get<UserKv>(k.user(id))
  const user = userEntry.value ?? null
  if (!user) {
    const err = jsonError('User not found', 404)
    return c.json(err.body, err.status)
  }

  const sessionByUserIdEntry = await kv.get<string>(k.sessionByUserId(id))

  const a = kv.atomic()
    .delete(k.user(id))
    .delete(k.userByEmail(user.email))
  if (sessionByUserIdEntry.value) {
    const token = sessionByUserIdEntry.value
    a.delete(k.session(token))
    a.delete(k.sessionByUserId(id))
  }

  for (const loop of user.loops) {
    a.delete(k.loop(loop.id))
    a.delete(k.publicLoop(loop.id))
  }

  await a.commit()
  return c.json({ ok: true })
})

app.delete('/api/admin/loop/:id', async c => {
  const { session, response } = await requireAdmin(c)
  if (response) return response
  if (!session) return c.json(jsonError('Not authenticated', 401).body, 401)

  const id = c.req.param('id')
  const kv = await getKv()

  const loopEntry = await kv.get<LoopKv>(k.loop(id))
  const loop = loopEntry.value ?? null
  if (!loop) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  const userEntry = await kv.get<UserKv>(k.user(loop.userId))
  const user = userEntry.value ?? null
  if (user) {
    const nextUser: UserKv = { ...user, loops: user.loops.filter(l => l.id !== id) }
    await kv.set(k.user(loop.userId), nextUser)
  }

  const parentId = loop.isPublic === true && loop.remixOfId ? loop.remixOfId : null
  const [parentRemixEntry, parentPubEntry] = parentId
    ? await kv.getMany([k.loopRemixCount(parentId), k.publicLoop(parentId)] as const)
    : ([null, null] as const)

  const a = kv.atomic()
    .delete(k.loop(id))
    .delete(k.publicLoop(id))
  if (parentId) {
    const curr = (parentRemixEntry?.value as number | null) ?? 0
    const next = Math.max(0, curr - 1)
    a.set(k.loopRemixCount(parentId), next)
    const pub = parsePublicLoopKv(parentPubEntry?.value ?? null)
    if (pub) {
      const nextPub: PublicLoopKv = [pub[0], pub[1], pub[2], pub[3], pub[4], next, pub[6], pub[7], pub[8]]
      a.set(k.publicLoop(parentId), nextPub)
    }
  }
  await a.commit()

  return c.json({ ok: true })
})

app.put('/api/admin/loop/:id/toggle-visibility', async c => {
  const { session, response } = await requireAdmin(c)
  if (response) return response
  if (!session) return c.json(jsonError('Not authenticated', 401).body, 401)

  const id = c.req.param('id')
  const kv = await getKv()

  const [loopEntry, likeCountEntry, commentCountEntry, remixCountEntry] = await kv.getMany([
    k.loop(id),
    k.loopLikeCount(id),
    k.loopCommentCount(id),
    k.loopRemixCount(id),
  ] as const)

  const loop = loopEntry.value as LoopKv | null
  if (!loop) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  const user = await kv.get<UserKv>(k.user(loop.userId))
  const userValue = user.value ?? null
  if (!userValue) {
    const err = jsonError('User not found', 404)
    return c.json(err.body, err.status)
  }

  const likesCount = (likeCountEntry?.value as number | null) ?? 0
  const commentsCount = (commentCountEntry?.value as number | null) ?? 0
  const ownRemixesCount = (remixCountEntry?.value as number | null) ?? 0

  const nextIsPublic = !loop.isPublic
  const nextLoop: LoopKv = { ...loop, isPublic: nextIsPublic }

  const summary: LoopSummaryKv = {
    id,
    title: nextLoop.title,
    timestamp: nextLoop.timestamp,
    isPublic: nextIsPublic,
    remixOfId: nextLoop.remixOfId,
  }

  const upsertSummary = (list: LoopSummaryKv[]) => {
    const idx = list.findIndex(x => x.id === id)
    if (idx === -1) return [summary, ...list]
    const next = list.slice()
    next[idx] = summary
    return next
  }

  const nextUser: UserKv = { ...userValue, loops: upsertSummary(userValue.loops) }

  const a = kv.atomic()
    .set(k.loop(id), nextLoop)
    .set(k.user(loop.userId), nextUser)

  if (nextIsPublic) {
    const pub: PublicLoopKv = [id, userValue.name, loop.userId, likesCount, commentsCount, ownRemixesCount,
      nextLoop.title, nextLoop.timestamp, nextLoop.remixOfId ?? '']
    a.set(k.publicLoop(id), pub)
  }
  else {
    a.delete(k.publicLoop(id))
  }
  await a.commit()

  return c.json({ ok: true, isPublic: nextIsPublic })
})

app.post('/api/admin/import-v1', async c => {
  const { session, response } = await requireAdmin(c)
  if (response) return response
  if (!session) return c.json(jsonError('Not authenticated', 401).body, 401)

  const raw = await c.req.json().catch(() => null)
  if (raw === null) {
    const err = jsonError('Invalid JSON', 400)
    return c.json(err.body, err.status)
  }
  const parsed = z.object({ data: z.array(z.any()) }).safeParse(raw)
  if (!parsed.success) {
    const err = jsonError('Invalid data format', 400)
    return c.json(err.body, err.status)
  }

  const kv = await getKv()
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const item of parsed.data.data) {
    if (!item || typeof item !== 'object') {
      skipped++
      continue
    }
    const key = item.key
    const value = item.value
    if (!Array.isArray(key) || key[0] !== 'users' || !value || typeof value !== 'object') {
      skipped++
      continue
    }

    const userId = value.id
    const email = value.email?.trim().toLowerCase()
    const passwordHash = value.passwordHash
    const name = value.name?.trim()

    if (!userId || !email || !passwordHash || !name) {
      errors.push(`Invalid user data: ${userId || 'missing id'}`)
      skipped++
      continue
    }

    const existingUserEntry = await kv.get<UserKv>(k.user(userId))
    const existingEmailEntry = await kv.get<string>(k.userByEmail(email))
    if (existingUserEntry.value || existingEmailEntry.value) {
      skipped++
      continue
    }

    const user: UserKv = {
      id: userId,
      name,
      email,
      passwordHash,
      loops: [],
      likes: [],
    }

    try {
      await kv.atomic()
        .check({ key: k.user(userId), versionstamp: null })
        .check({ key: k.userByEmail(email), versionstamp: null })
        .set(k.user(userId), user)
        .set(k.userByEmail(email), userId)
        .commit()
      imported++
    }
    catch (e) {
      errors.push(`Failed to import user ${userId}: ${e instanceof Error ? e.message : String(e)}`)
      skipped++
    }
  }

  return c.json({ ok: true, imported, skipped, errors })
})

app.get('*', serveStatic({ path: './dist/index.html' }))

const port = Number.parseInt(Deno.env.get('PORT') ?? '8787', 10) || 8787
await runMigrations(await getKv())

function getClientIp(req: Request, connInfo?: Deno.ServeHandlerInfo): string {
  const forwardedFor = req.headers.get('X-Forwarded-For')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  const realIp = req.headers.get('X-Real-IP')
  if (realIp) {
    return realIp.trim()
  }
  if (connInfo?.remoteAddr) {
    const addr = connInfo.remoteAddr
    if (addr.transport === 'tcp') {
      return addr.hostname
    }
  }
  return 'unknown'
}

function formatApacheLog(req: Request, res: Response, connInfo?: Deno.ServeHandlerInfo): string {
  const ip = getClientIp(req, connInfo)
  const url = new URL(req.url)
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  const month = monthNames[now.getMonth()]
  const year = now.getFullYear()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const timezoneOffset = -now.getTimezoneOffset()
  const tzHours = String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, '0')
  const tzMinutes = String(Math.abs(timezoneOffset) % 60).padStart(2, '0')
  const tzSign = timezoneOffset >= 0 ? '+' : '-'
  const timestamp = `${day}/${month}/${year}:${hours}:${minutes}:${seconds} ${tzSign}${tzHours}${tzMinutes}`
  const method = req.method
  const path = url.pathname + url.search
  const httpVersion = 'HTTP/1.1'
  const status = res.status
  const size = res.headers.get('Content-Length') || '-'
  const referer = req.headers.get('Referer') || '-'
  const userAgent = req.headers.get('User-Agent') || '-'

  return `${ip} - - [${timestamp}] "${method} ${path} ${httpVersion}" ${status} ${size} "${referer}" "${userAgent}"`
}

async function handler(req: Request, connInfo: Deno.ServeHandlerInfo): Promise<Response> {
  const res = await app.fetch(req)
  const logLine = formatApacheLog(req, res, connInfo)
  console.log(logLine)
  return res
}

Deno.serve({ port }, handler)
