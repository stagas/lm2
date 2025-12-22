import { compare, hash } from 'bcrypt'
import { Hono } from 'hono'
import type { Context } from 'hono'
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

function jsonError(message: string, status = 400) {
  return { body: ErrorResponseSchema.parse({ message }), status }
}

function sessionToApi(session: SessionKv): SessionData {
  const loops: LoopData[] = session.l.map(l => ({
    id: l.id,
    title: l.t,
    artist: session.n,
    artistId: session.u,
    likesCount: 0,
    commentsCount: 0,
    isPublic: l.pub === 1,
    timestamp: l.ts,
  }))

  return SessionDataSchema.parse({
    user: { id: session.u, name: session.n },
    loops,
  })
}

function loopToApi(loop: LoopKv, user: { id: string; name: string }): LoopData {
  return LoopDataSchema.parse({
    id: loop.id,
    title: loop.t,
    artist: user.name,
    artistId: user.id,
    code: loop.c,
    likesCount: 0,
    commentsCount: 0,
    isPublic: loop.pub === 1,
    timestamp: loop.ts,
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
  const parsed = AuthRegisterRequestSchema.safeParse(raw)
  if (!parsed.success) {
    const err = jsonError('Invalid request', 400)
    return c.json(err.body, err.status)
  }

  const name = parsed.data.name
  const password = parsed.data.password
  const userId = crypto.randomUUID()
  const pw = await hash(password)
  const user: UserKv = { id: userId, n: name, p: pw, l: [] }
  const token = crypto.randomUUID()
  const session: SessionKv = { u: userId, n: name, l: user.l }

  const commit = await kv.atomic()
    .check({ key: k.userByName(name), versionstamp: null })
    .set(k.user(userId), user)
    .set(k.userByName(name), userId)
    .set(k.session(token), session)
    .set(k.sessionByUser(userId), token)
    .commit()

  if (!commit.ok) {
    const err = jsonError('Name is already taken', 409)
    return c.json(err.body, err.status)
  }

  setSessionCookie(c, token)
  return c.json(sessionToApi(session))
})

app.post('/api/auth/login', async c => {
  const kv = await getKv()
  const raw = await c.req.json().catch(() => null)
  const parsed = AuthLoginRequestSchema.safeParse(raw)
  if (!parsed.success) {
    const err = jsonError('Invalid request', 400)
    return c.json(err.body, err.status)
  }

  const name = parsed.data.name
  const password = parsed.data.password

  const userIdEntry = await kv.get<string>(k.userByName(name))
  const userId = userIdEntry.value ?? null
  if (!userId) {
    const err = jsonError('Invalid credentials', 401)
    return c.json(err.body, err.status)
  }

  const userEntry = await kv.get<UserKv>(k.user(userId))
  const user = userEntry.value ?? null
  if (!user) {
    const err = jsonError('Invalid credentials', 401)
    return c.json(err.body, err.status)
  }

  const ok = await compare(password, user.p)
  if (!ok) {
    const err = jsonError('Invalid credentials', 401)
    return c.json(err.body, err.status)
  }

  const prevTokenEntry = await kv.get<string>(k.sessionByUser(userId))
  const prevToken = prevTokenEntry.value ?? null

  const token = crypto.randomUUID()
  const session: SessionKv = { u: user.id, n: user.n, l: user.l }

  const a = kv.atomic()
  if (prevToken) a.delete(k.session(prevToken))
  a.set(k.session(token), session)
  a.set(k.sessionByUser(userId), token)
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
    if (session) a.delete(k.sessionByUser(session.u))
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
  if (!loop || loop.u !== session.u) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  return c.json(loopToApi(loop, { id: session.u, name: session.n }))
})

app.put('/api/loop/:id', async c => {
  const { token, session } = await requireSession(c)
  if (!token || !session) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  const raw = await c.req.json().catch(() => null)
  const parsed = LoopUpsertRequestSchema.safeParse(raw)
  if (!parsed.success) {
    const err = jsonError('Invalid request', 400)
    return c.json(err.body, err.status)
  }

  const id = c.req.param('id')
  const kv = await getKv()

  const [sessionEntry, userEntry, loopEntry] = await kv.getMany([
    k.session(token),
    k.user(session.u),
    k.loop(id),
  ] as const)

  const currentSession = sessionEntry.value as SessionKv | null
  const user = userEntry.value as UserKv | null
  const prevLoop = loopEntry.value as LoopKv | null

  if (!currentSession || !user) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  if (prevLoop && prevLoop.u !== session.u) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  const data = parsed.data
  const loop: LoopKv = {
    id,
    u: session.u,
    t: data.title,
    c: data.code,
    ts: data.timestamp,
    pub: data.isPublic ? 1 : 0,
  }

  const summary: LoopSummaryKv = { id, t: data.title, ts: data.timestamp, pub: loop.pub }

  const upsertSummary = (list: LoopSummaryKv[]) => {
    const idx = list.findIndex(x => x.id === id)
    if (idx === -1) return [summary, ...list]
    const next = list.slice()
    next[idx] = summary
    return next
  }

  const nextUser: UserKv = { ...user, l: upsertSummary(user.l) }
  const nextSession: SessionKv = { ...currentSession, l: upsertSummary(currentSession.l) }

  await kv.atomic()
    .set(k.loop(id), loop)
    .set(k.user(session.u), nextUser)
    .set(k.session(token), nextSession)
    .commit()

  return c.json(sessionToApi(nextSession))
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
    k.user(session.u),
    k.loop(id),
  ] as const)

  const currentSession = sessionEntry.value as SessionKv | null
  const user = userEntry.value as UserKv | null
  const loop = loopEntry.value as LoopKv | null

  if (!currentSession || !user) {
    const err = jsonError('Not authenticated', 401)
    return c.json(err.body, err.status)
  }

  if (!loop || loop.u !== session.u) {
    const err = jsonError('Loop not found', 404)
    return c.json(err.body, err.status)
  }

  const remove = (list: LoopSummaryKv[]) => list.filter(x => x.id !== id)
  const nextUser: UserKv = { ...user, l: remove(user.l) }
  const nextSession: SessionKv = { ...currentSession, l: remove(currentSession.l) }

  await kv.atomic()
    .delete(k.loop(id))
    .set(k.user(session.u), nextUser)
    .set(k.session(token), nextSession)
    .commit()

  return c.json(sessionToApi(nextSession))
})

const port = Number.parseInt(Deno.env.get('PORT') ?? '8787', 10) || 8787
Deno.serve({ port }, app.fetch)
