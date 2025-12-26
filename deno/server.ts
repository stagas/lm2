import { compare, hash } from 'bcrypt'
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ZodError, ZodIssue } from 'zod'
import { clearSessionCookie, getSessionKvByToken, getSessionToken, setSessionCookie } from './auth.ts'
import { newId } from './id.ts'
import { getKv, k, type LoopKv, type LoopSummaryKv, type PublicLoopKv, type SessionKv, type UserKv } from './kv.ts'
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
  type PublicLoopListEntry,
  type SessionData,
  SessionDataSchema,
} from './types.ts'

function jsonError(message: string, status: ContentfulStatusCode = 400) {
  return { body: ErrorResponseSchema.parse({ message }), status }
}

const fieldLabel: Record<string, string> = {
  artistName: 'Name',
  email: 'Email',
  password: 'Password',
  title: 'Title',
  code: 'Code',
  isPublic: 'Public',
  timestamp: 'Timestamp',
  content: 'Comment',
}

function zodIssueMessage(issue: ZodIssue): string {
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
    isPublic: loop.isPublic,
    timestamp: loop.timestamp,
  }))

  return SessionDataSchema.parse({
    user: { id: session.userId, name: session.name, email: session.email },
    loops,
    likedLoopIds,
  })
}

function loopToApi(loop: LoopKv, user: { id: string; name: string }): LoopData {
  return LoopDataSchema.parse({
    id: loop.id,
    title: loop.title,
    artist: user.name,
    artistId: user.id,
    code: loop.code,
    likesCount: 0,
    commentsCount: 0,
    isPublic: loop.isPublic,
    timestamp: loop.timestamp,
    comments: [],
  })
}

function publicLoopKv(v: unknown): PublicLoopKv | null {
  if (Array.isArray(v) && v.length === 7) {
    const id = v[0]
    const artist = v[1]
    const artistId = v[2]
    const likesCount = v[3]
    const commentsCount = v[4]
    const title = v[5]
    const timestamp = v[6]
    if (
      typeof id === 'string'
      && typeof artist === 'string'
      && typeof artistId === 'string'
      && typeof likesCount === 'number'
      && typeof commentsCount === 'number'
      && typeof title === 'string'
      && typeof timestamp === 'number'
    ) {
      return [id, artist, artistId, likesCount, commentsCount, title, timestamp]
    }
  }

  if (v && typeof v === 'object') {
    const o = v as {
      id?: unknown
      artist?: unknown
      artistId?: unknown
      likesCount?: unknown
      commentsCount?: unknown
      title?: unknown
      timestamp?: unknown
    }
    if (
      typeof o.id === 'string'
      && typeof o.artist === 'string'
      && typeof o.artistId === 'string'
      && typeof o.likesCount === 'number'
      && typeof o.commentsCount === 'number'
      && typeof o.title === 'string'
      && typeof o.timestamp === 'number'
    ) {
      return [o.id, o.artist, o.artistId, o.likesCount, o.commentsCount, o.title, o.timestamp]
    }
  }

  return null
}

function publicLoopToApi(loop: PublicLoopKv): LoopData {
  return LoopDataSchema.parse({
    id: loop[0],
    title: loop[5],
    artist: loop[1],
    artistId: loop[2],
    likesCount: loop[3],
    commentsCount: loop[4],
    isPublic: true,
    timestamp: loop[6],
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

const app = new Hono()

app.get('/api/health', c => c.json({ ok: true }))

app.get('/api/session', async c => {
  const { session } = await requireSession(c)
  if (!session) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }
  return c.json(sessionToApi(session))
})

app.get('/api/public-loops', async c => {
  const kv = await getKv()
  const loops: PublicLoopListEntry[] = []
  for await (const entry of kv.list<unknown>({ prefix: k.publicLoops() })) {
    const v = publicLoopKv(entry.value)
    if (v) loops.push(v)
  }
  loops.sort((a, b) => b[6] - a[6])
  return c.json(loops)
})

app.get('/api/public-loop/:id', async c => {
  const kv = await getKv()
  const id = c.req.param('id')
  const [loopEntry, publicEntry] = await kv.getMany([
    k.loop(id),
    k.publicLoop(id),
  ] as const)
  const loop = loopEntry.value as LoopKv | null
  const pub = publicLoopKv(publicEntry.value)
  if (!loop || !pub || loop.isPublic !== true) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }
  return c.json(LoopDataSchema.parse({ ...publicLoopToApi(pub), code: loop.code }))
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
  const entries = await kv.getMany(keys as unknown as readonly Deno.KvKey[])

  const codes: Record<string, string> = {}
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!
    const loop = (entries[i * 2]?.value ?? null) as LoopKv | null
    const pub = publicLoopKv(entries[i * 2 + 1]?.value ?? null)
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
  const entries = await kv.getMany(ids.map(id => k.publicLoop(id)) as unknown as readonly Deno.KvKey[])
  const loops: PublicLoopKv[] = []
  for (const e of entries) {
    const v = publicLoopKv(e.value)
    if (v) loops.push(v)
  }
  loops.sort((a, b) => b[6] - a[6])
  return c.json(loops.map(publicLoopToApi))
})

app.post('/api/loop/:id/like', async c => {
  const { token, session } = await requireSession(c)
  if (!token || !session) {
    const err = jsonError('Not authenticated', 401)
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
  const pub = publicLoopKv(publicEntry.value)
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
  const nextPublic: PublicLoopKv = [pub[0], pub[1], pub[2], nextCount, pub[4], pub[5], pub[6]]

  const a = kv.atomic()
    .set(k.user(session.userId), nextUser)
    .set(k.session(token), nextSession)
    .set(k.publicLoop(id), nextPublic)
    .set(k.loopLikeCount(id), nextCount)

  if (nextLiked) a.set(k.loopLike(id, session.userId), true)
  else a.delete(k.loopLike(id, session.userId))

  await a.commit()
  return c.json(sessionToApi(nextSession))
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
  const pub = publicLoopKv(publicEntry.value)
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
  const nextPublic: PublicLoopKv = [pub[0], pub[1], pub[2], pub[3], nextCount, pub[5], pub[6]]

  await kv.atomic()
    .set(k.loopComment(id, timestamp, commentId), comment)
    .set(k.loopCommentCount(id), nextCount)
    .set(k.publicLoop(id), nextPublic)
    .commit()

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
  const pub = publicLoopKv(publicEntry.value)
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
  const nextPublic: PublicLoopKv = [pub[0], pub[1], pub[2], pub[3], nextCount, pub[5], pub[6]]

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
    const session: SessionKv = { userId, name, email, loops: user.loops, likes: user.likes }

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

  const ok = await compare(password, user.passwordHash)
  if (!ok) {
    const err = jsonError('Invalid email or password', 401)
    return c.json(err.body, err.status)
  }

  const prevTokenEntry = await kv.get<string>(k.sessionByUserId(userId))
  const prevToken = prevTokenEntry.value ?? null

  const likes = Array.isArray((user as unknown as { likes?: unknown }).likes)
    ? (user as unknown as { likes: string[] }).likes
    : []
  const session: SessionKv = { userId: user.id, name: user.name, email: user.email, loops: user.loops, likes }

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
  const loopEntry = await kv.get<LoopKv>(k.loop(id))
  const loop = loopEntry.value ?? null
  if (!loop || loop.userId !== session.userId) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  return c.json(loopToApi(loop, { id: session.userId, name: session.name }))
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

  const [sessionEntry, userEntry, loopEntry, likeCountEntry, commentCountEntry] = await kv.getMany([
    k.session(token),
    k.user(session.userId),
    k.loop(id),
    k.loopLikeCount(id),
    k.loopCommentCount(id),
  ] as const)

  const currentSession = sessionEntry.value as SessionKv | null
  const user = userEntry.value as UserKv | null
  const prevLoop = loopEntry.value as LoopKv | null
  const likesCount = (likeCountEntry.value as number | null) ?? 0
  const commentsCount = (commentCountEntry.value as number | null) ?? 0

  if (!currentSession || !user) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  if (prevLoop && prevLoop.userId !== session.userId) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  const data = parsed.data
  const timestamp = Date.now()
  const loop: LoopKv = {
    id,
    userId: session.userId,
    title: data.title,
    code: data.code,
    timestamp: (prevLoop?.code === data.code ? prevLoop.timestamp : timestamp) ?? timestamp,
    isPublic: data.isPublic,
  }

  const summary: LoopSummaryKv = { id, title: loop.title, timestamp: loop.timestamp, isPublic: loop.isPublic }

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
  if (loop.isPublic) {
    const pub: PublicLoopKv = [id, user.name, session.userId, likesCount, commentsCount, loop.title, loop.timestamp]
    a.set(k.publicLoop(id), pub)
  }
  else {
    a.delete(k.publicLoop(id))
  }
  await a.commit()

  return c.json({ ok: true })
})

app.delete('/api/loop/:id', async c => {
  const { token, session } = await requireSession(c)
  if (!token || !session) {
    const err = jsonError('Not authenticated', 401)
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

  const remove = (list: LoopSummaryKv[]) => list.filter(x => x.id !== id)
  const nextUser: UserKv = { ...user, loops: remove(user.loops) }
  const nextSession: SessionKv = { ...currentSession, loops: remove(currentSession.loops) }

  await kv.atomic()
    .delete(k.loop(id))
    .delete(k.publicLoop(id))
    .set(k.user(session.userId), nextUser)
    .set(k.session(token), nextSession)
    .commit()

  return c.json(sessionToApi(nextSession))
})

const port = Number.parseInt(Deno.env.get('PORT') ?? '8787', 10) || 8787
Deno.serve({ port }, app.fetch)
