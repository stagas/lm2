import { k, type PublicLoopKv } from './kv.ts'
import { parsePublicLoopKv } from './public-loop-kv.ts'

export type Migration = {
  version: number
  name: string
  up: (kv: Deno.Kv) => Promise<void>
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'public-loops-remixes-count-v1',
    up: async kv => {
      for await (const entry of kv.list<unknown>({ prefix: k.publicLoops() })) {
        const pub = parsePublicLoopKv(entry.value)
        if (!pub) continue
        const id = pub[0]
        const existing = (await kv.get<number>(k.loopRemixCount(id))).value
        const remixesCount = existing ?? pub[5] ?? 0
        const nextPub: PublicLoopKv = [pub[0], pub[1], pub[2], pub[3], pub[4], remixesCount, pub[6], pub[7]]
        await kv.atomic()
          .set(k.publicLoop(id), nextPub)
          .set(k.loopRemixCount(id), remixesCount)
          .commit()
      }
    },
  },
] as const

export async function runMigrations(kv: Deno.Kv) {
  const curr = (await kv.get<number>(k.migrationsVersion())).value ?? 0
  const pending = MIGRATIONS
    .slice()
    .sort((a, b) => a.version - b.version)
    .filter(m => m.version > curr)

  for (const m of pending) {
    await m.up(kv)
    const timestamp = Date.now()
    await kv.atomic()
      .set(k.migrationsVersion(), m.version)
      .set(k.migration(m.version), { version: m.version, name: m.name, timestamp })
      .commit()
  }
}


