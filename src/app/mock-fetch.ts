import { omit } from 'utils/pick-omit'
import type { LoopData, SessionData } from '../../deno/types.ts'

const titles = [
  'Ostkreuz',
  'Acid',
  'Phosphorus',
  'More Acid',
  'LSD',
  'Voices',
  'Zeitgeist',
  'Synesthesia',
  'Blueprint',
  'Mirage',
  'Pulse',
  'Cosmos',
  'Nebula',
  'Galaxy',
  'Universe',
  'Infinity',
  'Eternity',
  'Paradise',
  'Eden',
  'Garden',
  'Hell',
  'Darkness',
  'Light',
  'Shadow',
  'Ghost',
  'Specter',
  'Phantom',
  'Chaos',
  'Order',
  'Balance',
  'Harmony',
  'Symmetry',
  'Asymmetry',
  'Random',
  'Pattern',
  'Noise',
]

const loops: LoopData[] = titles.map(title => ({
  id: title,
  title,
  artist: 'stagas',
  artistId: '1',
  code: `
a=mini('scale dorian [i v]$$.75/2;.15')
play(a,(trig,velocity,hz)->
  (sine(hz/2)+sine(hz))*adsr(.02,.4,.4,.6,trig)**3)*.3

|> analyser($) |> out($)
`,
  likesCount: Math.random() * 10 | 0,
  commentsCount: Math.random() * 5 | 0,
  isPublic: Math.random() < 0.5,
  timestamp: Math.random() * 1000000 | 0,
}))

export const mockFetch = (async (url: string) => {
  // await new Promise(resolve => setTimeout(resolve, 2000))
  if (url.startsWith('/api/session')) {
    return {
      ok: true,
      json: () =>
        Promise.resolve({
          user: {
            id: '1',
            name: 'stagas',
          },
          loops: loops.map(loop => omit(loop, ['code']) satisfies LoopData),
        } satisfies SessionData),
    }
  }

  if (url.startsWith('/api/loop/')) {
    const id = decodeURIComponent(url.split('/').pop()!)
    return {
      ok: true,
      json: () => Promise.resolve(loops.find(loop => loop.id === id)! satisfies LoopData),
    }
  }
}) as typeof globalThis.fetch
