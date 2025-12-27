import type { PublicLoopKv } from './kv.ts'

export function parsePublicLoopKv(v: unknown): PublicLoopKv | null {
  if (Array.isArray(v) && v.length === 9) {
    const id = v[0]
    const artist = v[1]
    const artistId = v[2]
    const likesCount = v[3]
    const commentsCount = v[4]
    const remixesCount = v[5]
    const title = v[6]
    const timestamp = v[7]
    const remixOfId = v[8]
    if (
      typeof id === 'string'
      && typeof artist === 'string'
      && typeof artistId === 'string'
      && typeof likesCount === 'number'
      && typeof commentsCount === 'number'
      && typeof remixesCount === 'number'
      && typeof title === 'string'
      && typeof timestamp === 'number'
      && typeof remixOfId === 'string'
    ) {
      return [id, artist, artistId, likesCount, commentsCount, remixesCount, title, timestamp, remixOfId]
    }
  }

  if (Array.isArray(v) && v.length === 8) {
    const id = v[0]
    const artist = v[1]
    const artistId = v[2]
    const likesCount = v[3]
    const commentsCount = v[4]
    const remixesCount = v[5]
    const title = v[6]
    const timestamp = v[7]
    if (
      typeof id === 'string'
      && typeof artist === 'string'
      && typeof artistId === 'string'
      && typeof likesCount === 'number'
      && typeof commentsCount === 'number'
      && typeof remixesCount === 'number'
      && typeof title === 'string'
      && typeof timestamp === 'number'
    ) {
      return [id, artist, artistId, likesCount, commentsCount, remixesCount, title, timestamp, '']
    }
  }

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
      return [id, artist, artistId, likesCount, commentsCount, 0, title, timestamp, '']
    }
  }

  if (v && typeof v === 'object') {
    const o = v as {
      id?: unknown
      artist?: unknown
      artistId?: unknown
      likesCount?: unknown
      commentsCount?: unknown
      remixesCount?: unknown
      title?: unknown
      timestamp?: unknown
      remixOfId?: unknown
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
      const remixesCount = typeof o.remixesCount === 'number' ? o.remixesCount : 0
      const remixOfId = typeof o.remixOfId === 'string' ? o.remixOfId : ''
      return [o.id, o.artist, o.artistId, o.likesCount, o.commentsCount, remixesCount, o.title, o.timestamp, remixOfId]
    }
  }

  return null
}


