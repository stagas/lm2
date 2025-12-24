export const SCALE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 3, 5, 7, 10],
  pent: [0, 3, 5, 7, 10],
  minorpentatonic: [0, 3, 5, 7, 10],
  minorpent: [0, 3, 5, 7, 10],
  majorpentatonic: [0, 2, 4, 7, 9],
  majorpent: [0, 2, 4, 7, 9],
  ritusen: [0, 2, 4, 6, 9],
  kumai: [0, 2, 3, 7, 9],
  hirajoshi: [0, 2, 3, 7, 8],
  iwato: [0, 1, 5, 6, 10],
  chinese: [0, 4, 6, 7, 11],
  indian: [0, 4, 5, 7, 9, 11],
  pelog: [0, 1, 3, 7, 8],
  prometheus: [0, 2, 4, 6, 9, 10],
  scriabin: [0, 1, 4, 7, 9],
  gong: [0, 2, 4, 7, 9],
  shang: [0, 2, 5, 7, 10],
  jiao: [0, 3, 5, 8, 10],
  zhi: [0, 2, 4, 6, 9],
  yu: [0, 3, 5, 7, 9],
  whole: [0, 2, 4, 6, 8, 10],
  wholetone: [0, 2, 4, 6, 8, 10],
  augmented: [0, 3, 4, 7, 8, 11],
  augmented2: [0, 1, 4, 5, 8, 9],
  hexmajor7: [0, 2, 4, 7, 9, 11],
  hexdorian: [0, 2, 3, 5, 7, 9],
  hexphrygian: [0, 1, 4, 5, 7, 10],
  hexsus: [0, 2, 5, 7, 9, 10],
  hexmajor6: [0, 2, 4, 5, 7, 9],
  hexaeolian: [0, 2, 3, 5, 7, 8],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicminor: [0, 2, 3, 5, 7, 8, 11],
  harmonicmajor: [0, 2, 4, 5, 7, 8, 11],
  melodicminor: [0, 2, 3, 5, 7, 9, 11],
  melodicminordesc: [0, 2, 3, 5, 7, 8, 10],
  melodicmajor: [0, 2, 4, 6, 7, 9, 11],
  bartok: [0, 2, 4, 5, 7, 8, 10],
  hindu: [0, 2, 5, 7, 8, 10],
  todi: [0, 1, 3, 6, 7, 8, 11],
  purvi: [0, 1, 4, 6, 7, 8, 11],
  marva: [0, 1, 4, 6, 7, 9, 11],
  bhairav: [0, 1, 4, 5, 7, 8, 11],
  ahirbhairav: [0, 1, 4, 5, 7, 9, 10],
  superlocrian: [0, 1, 3, 4, 6, 8, 10],
  romanianminor: [0, 2, 3, 6, 7, 9, 10],
  hungarianminor: [0, 2, 3, 6, 7, 8, 11],
  neapolitanminor: [0, 1, 3, 5, 7, 8, 11],
  enigmatic: [0, 1, 4, 6, 8, 10, 11],
  spanish: [0, 1, 3, 4, 5, 7, 8, 10],
  leadingwhole: [0, 2, 4, 6, 8, 9, 11],
  lydianminor: [0, 2, 4, 6, 7, 8, 10],
  neapolitanmajor: [0, 1, 3, 5, 7, 9, 11],
  locrianmajor: [0, 2, 4, 5, 6, 8, 10],
  diminished: [0, 2, 3, 5, 6, 8, 9, 11],
  octatonic: [0, 1, 3, 4, 6, 7, 9, 10],
  diminished2: [0, 1, 3, 4, 6, 7, 9, 10],
  octatonic2: [0, 2, 3, 5, 6, 8, 9, 11],
  messiaen1: [0, 2, 4, 6, 8, 10],
  messiaen2: [0, 1, 2, 5, 6, 7, 10, 11],
  messiaen3: [0, 2, 3, 4, 6, 7, 8, 11],
  messiaen4: [0, 1, 2, 5, 6, 7, 9, 10],
  messiaen5: [0, 1, 5, 6, 7, 11],
  messiaen6: [0, 2, 4, 5, 6, 8, 10, 11],
  messiaen7: [0, 1, 2, 3, 5, 6, 7, 8, 9, 11],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  bayati: [0, 1, 4, 5, 7, 8, 10],
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  sikah: [0, 1, 4, 5, 7, 8, 10],
  rast: [0, 2, 4, 5, 7, 9, 10],
  saba: [0, 1, 3, 4, 6, 7, 9, 10],
  iraq: [0, 1, 4, 5, 7, 8, 10],
}

export const SCALE_KEY_TO_INDEX: Record<string, number> = {}
{
  const sigToIndex = new Map<string, number>()
  let next = 0
  for (const [name, intervals] of Object.entries(SCALE_INTERVALS)) {
    const sig = intervals.join(',')
    let idx = sigToIndex.get(sig)
    if (idx === undefined) {
      idx = next++
      sigToIndex.set(sig, idx)
    }
    SCALE_KEY_TO_INDEX[name] = idx
  }
}

export function findScaleIndex(scaleName: string): number | undefined {
  if (!scaleName) return undefined
  const q = scaleName.toLowerCase()
  for (const name of Object.keys(SCALE_INTERVALS)) {
    if (name.startsWith(q)) return SCALE_KEY_TO_INDEX[name]
  }
  return undefined
}


