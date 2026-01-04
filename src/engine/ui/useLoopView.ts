import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import { useEngineRuntimeStore, useEngineUiStore } from '../store.ts'
import { useSeekToSample } from './useSeekToSample.ts'

export function useLoopView(loopId: string | null): {
  isPlayingLoop: boolean
  isPlaybackRunningForView: boolean
  viewSampleCount: number
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  seekToSample: (targetSampleCount: number) => void
  canControlPlayback: boolean
} {
  const playingLoopId = useEngineRuntimeStore(state => state.playingLoopId)
  const playbackState = useEngineRuntimeStore(state => state.playbackState)
  const storeGlobalSampleCount = useEngineRuntimeStore(state => state.globalSampleCount)
  const setViewSampleCount = useEngineUiStore(state => state.setViewSampleCount)

  const viewSampleCount = useEngineUiStore(state => {
    if (!loopId) return 0
    return state.viewSampleCountByLoopId[loopId] ?? 0
  })

  const isPlayingLoop = loopId != null && loopId === playingLoopId
  const isPlaybackRunningForView = isPlayingLoop && playbackState === 'running'

  const viewGlobalSampleCountRef = useRef<Int32Array<SharedArrayBuffer> | null>(null)
  if (!viewGlobalSampleCountRef.current) {
    viewGlobalSampleCountRef.current = new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT))
  }

  useEffect(() => {
    const arr = viewGlobalSampleCountRef.current
    if (!arr) return
    Atomics.store(arr, 0, Math.max(0, viewSampleCount))
  }, [viewSampleCount])

  const seekToPlaybackSample = useSeekToSample()

  const seekToSample = useCallback((targetSampleCount: number) => {
    if (!loopId) return
    const next = Math.max(0, Math.floor(targetSampleCount))
    const arr = viewGlobalSampleCountRef.current
    if (arr) Atomics.store(arr, 0, next)
    setViewSampleCount(loopId, next)
    if (isPlayingLoop) seekToPlaybackSample(next)
  }, [isPlayingLoop, loopId, seekToPlaybackSample, setViewSampleCount])

  const lastSyncedSampleRef = useRef(0)

  useEffect(() => {
    if (!isPlaybackRunningForView) return
    if (!loopId) return
    if (typeof window === 'undefined') return

    const src = storeGlobalSampleCount
    const dst = viewGlobalSampleCountRef.current
    if (!src || !dst) return

    let raf = 0
    const tick = () => {
      const v = (Atomics.load(src, 0) >>> 0) as number
      lastSyncedSampleRef.current = v
      Atomics.store(dst, 0, v)
      raf = window.requestAnimationFrame(tick)
    }

    raf = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(raf)
      const nextPlaybackState = useEngineRuntimeStore.getState().playbackState
      if (nextPlaybackState === 'stopped') {
        setViewSampleCount(loopId, 0)
        return
      }
      setViewSampleCount(loopId, lastSyncedSampleRef.current)
    }
  }, [isPlaybackRunningForView, loopId, setViewSampleCount, storeGlobalSampleCount])

  const globalSampleCount = useMemo(() => {
    if (isPlaybackRunningForView) return storeGlobalSampleCount
    return viewGlobalSampleCountRef.current ?? undefined
  }, [isPlaybackRunningForView, storeGlobalSampleCount])

  return {
    isPlayingLoop,
    isPlaybackRunningForView,
    viewSampleCount,
    globalSampleCount,
    seekToSample,
    canControlPlayback: isPlayingLoop,
  }
}
