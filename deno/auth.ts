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
    maxAge: 365 * 24 * 60 * 60, // 1 year in seconds
    expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year in milliseconds
  })
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, cookieName, { path: '/' })
}
