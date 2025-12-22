import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { getKv, k, type SessionKv } from './kv.ts'

const cookieName = 'sid'

export function getSessionToken(c: Context): string | null {
  return getCookie(c, cookieName) ?? null
}

export async function getSessionKvByToken(token: string): Promise<SessionKv | null> {
  const kv = await getKv()
  const entry = await kv.get<SessionKv>(k.session(token))
  return entry.value ?? null
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, cookieName, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
  })
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, cookieName, { path: '/' })
}
