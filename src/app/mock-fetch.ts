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

const loops: LoopData[] = titles.map((title, i) => ({
  id: title,
  title,
  artist: 'stagas',
  artistId: '1',
  code: [`bpm=120

a=mini('scale dorian [i v]$$.75/4;.15')
play(a,(trig,velocity,hz)->
  (sine(hz/2)+sine(hz))*adsr(.02,.4,.4,.6,trig)**3)*.3

|> analyser($) |> out($)
`, `bpm=120 bars=256
label(1,'intro')         label(33,'groove','#f0f')  label(65,'break','#0f0')  label(81,'build','#07f')
label(89,'drop','#f41')  label(121,'groove','#f0f') label(153,'break','#0f0') label(169,'build','#07f')
label(177,'drop','#f41') label(241,'outro')

tl=timeline('1,0 3,1l3 33,1e1.5 65,1 65,0 80,0 81,1e2 89,1 241,1 257,0l2','#f00')

k=mini('c4 on 16/16 c4*3 on 30/32 c4*3 on 32/32 c4*1.5','#fff')
kick=play(k, (trig,velocity) -> {
  env = adsr(attack:.0006, decay:1.9, trig)
  s=sine(52+70*env**50,trig)*env**50

}) |> analyser($) |> out($)
intro=mini('scale dorian i*1.5','#05f')
intro2=mini('scale dorian i*3','#05f')
a=mini('scale dorian <transpose -2 transpose 0>/4 octave -1 [i ii v]$.5/4','#05f')
b=mini('scale dorian <transpose -2 transpose 0>/4 octave 0 [i ii v]','#05f')



c=mini('scale dorian <transpose -2 transpose 0>/4 octave 1 [i ii v]\\;1','#05f')

inout=timeline('1,0 2,1e2 3,0l8','#0cf')
part1=[a,b] part2=[c,a] progr=[part1,part2]
v0=play(t < 4 ? intro : t < 8 ? intro2 : progr[(t/8)%2][(t*1.5)%2], (trig, velocity, hz) -> {
  env = adsr(attack:.01, decay:.07 (.01 .8)*inout + .1, sustain:.2, release:.7, trig)
  s=sine(hz*[1,1.5,1/1.5][(t/2)%3]+sine(200,trig)*10    (10 100000),trig)
  s * env * velocity * .20




}) * tl |> analyser($) *.23 (0 1.00) |> out($)
`][i % 2],
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
