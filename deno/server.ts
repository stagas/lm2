import { compare, hash } from 'bcrypt'
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ZodError, ZodIssue } from 'zod'
import { clearSessionCookie, getSessionKvByToken, getSessionToken, setSessionCookie } from './auth.ts'
import { getKv, k, type LoopKv, type LoopSummaryKv, type SessionKv, type UserKv } from './kv.ts'
import {
  AuthLoginRequestSchema,
  AuthRegisterRequestSchema,
  ErrorResponseSchema,
  type LoopData,
  LoopDataSchema,
  LoopUpsertRequestSchema,
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

async function requireSession(c: Context): Promise<{ token: string | null; session: SessionKv | null }> {
  const token = getSessionToken(c)
  if (!token) return { token: null, session: null as SessionKv | null }
  const session = await getSessionKvByToken(token)
  return { token, session }
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
  const userId = crypto.randomUUID()
  const pw = await hash(password)
  const user: UserKv = { id: userId, name, email, passwordHash: pw, loops: [] }
  const token = crypto.randomUUID()
  const session: SessionKv = { userId, name, email, loops: user.loops }

  const commit = await kv.atomic()
    .check({ key: k.userByEmail(email), versionstamp: null })
    .set(k.user(userId), user)
    .set(k.userByEmail(email), userId)
    .set(k.session(token), session)
    .set(k.sessionByUserId(userId), token)
    .commit()

  if (!commit.ok) {
    const err = jsonError('Email is already registered', 409)
    return c.json(err.body, err.status)
  }

  setSessionCookie(c, token)
  return c.json(sessionToApi(session))
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

  const token = crypto.randomUUID()
  const session: SessionKv = { userId: user.id, name: user.name, email: user.email, loops: user.loops }

  const a = kv.atomic()
  if (prevToken) a.delete(k.session(prevToken))
  a.set(k.session(token), session)
  a.set(k.sessionByUserId(userId), token)
  await a.commit()

  setSessionCookie(c, token)
  return c.json(sessionToApi(session))
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

  const [sessionEntry, userEntry, loopEntry] = await kv.getMany([
    k.session(token),
    k.user(session.userId),
    k.loop(id),
  ] as const)

  const currentSession = sessionEntry.value as SessionKv | null
  const user = userEntry.value as UserKv | null
  const prevLoop = loopEntry.value as LoopKv | null

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

  await kv.atomic()
    .set(k.loop(id), loop)
    .set(k.user(session.userId), nextUser)
    .set(k.session(token), nextSession)
    .commit()

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
    .set(k.user(session.userId), nextUser)
    .set(k.session(token), nextSession)
    .commit()

  return c.json(sessionToApi(nextSession))
})

const port = Number.parseInt(Deno.env.get('PORT') ?? '8787', 10) || 8787
Deno.serve({ port }, app.fetch)
