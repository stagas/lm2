import type { SampleDef } from '../bytecode/bytecode.ts'
import { useEngineDspStore, useEngineRuntimeStore } from '../store.ts'

export type RecordFetchState = {
  targetUrl: string
  pending: boolean
  nextAt: number
  lastAppliedVer: number
  waitForVer: number | null
}

export type RecordOfflineState = {
  pending: boolean
  nextAt: number
}

export function syncRecordSamplesForWidgets(args: {
  showWidgets: boolean
  playbackState: 'stopped' | 'running' | 'paused'
  dspSource: string
  audioContext: AudioContext | undefined
  sampleDefs: SampleDef[]
  recordFetch: Map<number, RecordFetchState>
  offline: RecordOfflineState
}) {
  if (!args.showWidgets) return

  const { worklet, visualWasm, bpmValue } = useEngineRuntimeStore.getState()
  const recordDefs = args.sampleDefs.filter(d => d.provider === 'record')
  if (recordDefs.length === 0) return

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()

  // Offline prepare path (fills record samples even before play, without depending on the worklet running)
  if (
    args.playbackState !== 'running'
    && visualWasm
    && !args.offline.pending
    && now >= args.offline.nextAt
  ) {
    const loaded = useEngineDspStore.getState().loadedSamples
    const needs = recordDefs.some(def => loaded[def.sampleIndex]?.url !== def.url)
    if (needs) {
      args.offline.pending = true
      args.offline.nextAt = now + 250
      const sr = args.audioContext?.sampleRate ?? 48000
      const bpm = bpmValue?.[0] ?? 60

      void visualWasm.prepareRecordSamples({
        source: args.dspSource,
        sampleRate: sr,
        bpm,
        sampleDefs: recordDefs,
        loadedSamples: loaded,
      }).then((prepared) => {
        args.offline.pending = false
        args.offline.nextAt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 250
        if (!prepared.size) return

        const defByIndex = new Map<number, SampleDef>()
        for (const d of recordDefs) defByIndex.set(d.sampleIndex, d)

        useEngineDspStore.setState(prev => {
          const next = prev.loadedSamples.slice()
          for (const [idx, s] of prepared.entries()) {
            const def = defByIndex.get(idx)
            if (!def) continue
            next[idx] = {
              url: def.url,
              sampleRate: s.sampleRate,
              length: s.length,
              ch0: new Float32Array(s.ch0Buffer) as unknown as Float32Array<ArrayBuffer>,
              ch0Buffer: s.ch0Buffer,
            }
          }
          return { loadedSamples: next }
        })
      }).catch(() => {
        args.offline.pending = false
        args.offline.nextAt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 250
      })
    }
  }

  // Worklet fetch path (keeps record samples synced when they were produced by realtime preroll/playback)
  if (!worklet) return

  for (const def of recordDefs) {
    const idx = def.sampleIndex
    const st = args.recordFetch.get(idx)
    if (!st) {
      args.recordFetch.set(idx, {
        targetUrl: def.url,
        pending: false,
        nextAt: 0,
        lastAppliedVer: 0,
        waitForVer: null,
      })
    }
    const cur = args.recordFetch.get(idx)!
    if (cur.targetUrl !== def.url) {
      cur.targetUrl = def.url
      cur.waitForVer = cur.lastAppliedVer
    }

    if (cur.pending) continue
    if (now < cur.nextAt) continue
    cur.pending = true
    cur.nextAt = now + 250

    void worklet.getSampleVersion(idx).then((ver) => {
      const t = typeof performance !== 'undefined' ? performance.now() : Date.now()
      cur.pending = false
      cur.nextAt = t + 250
      const v = (ver ?? 0) | 0
      if (v <= 0) return

      if (cur.lastAppliedVer === 0) {
        cur.waitForVer = null
      }
      else if (cur.waitForVer !== null) {
        if (v === cur.waitForVer) return
        cur.waitForVer = null
      }
      else if (v === cur.lastAppliedVer) {
        return
      }

      cur.pending = true
      void worklet.getSample(idx).then((s) => {
        const tt = typeof performance !== 'undefined' ? performance.now() : Date.now()
        cur.pending = false
        cur.nextAt = tt + 250
        if (!s || s.length <= 0) return
        if ((s.ver | 0) <= 0) return
        cur.lastAppliedVer = s.ver | 0

        const ch0Buffer = s.ch0Buffer
        const ch0 = new Float32Array(ch0Buffer) as unknown as Float32Array<ArrayBuffer>
        useEngineDspStore.setState(prev => {
          const next = prev.loadedSamples.slice()
          next[idx] = {
            url: cur.targetUrl,
            sampleRate: s.sampleRate,
            length: s.length,
            ch0,
            ch0Buffer,
          }
          return { loadedSamples: next }
        })
      }).catch(() => {
        const tt = typeof performance !== 'undefined' ? performance.now() : Date.now()
        cur.pending = false
        cur.nextAt = tt + 250
      })
    }).catch(() => {
      const t = typeof performance !== 'undefined' ? performance.now() : Date.now()
      cur.pending = false
      cur.nextAt = t + 250
    })
  }
}

