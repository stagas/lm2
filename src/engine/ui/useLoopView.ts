import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks'
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

  // Important: allocate a distinct buffer per loop id. Otherwise, when switching
  // views while another loop is playing, the previous view's RAF sync can keep
  // writing into the same buffer and cause visible "animate there and back".
  const viewGlobalSampleCount = useMemo(() => {
    const arr = new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT))
    Atomics.store(arr, 0, Math.max(0, viewSampleCount))
    return arr
  }, [loopId])

  useLayoutEffect(() => {
    Atomics.store(viewGlobalSampleCount, 0, Math.max(0, viewSampleCount))
  }, [viewGlobalSampleCount, viewSampleCount])

  const seekToPlaybackSample = useSeekToSample()

  const seekToSample = useCallback((targetSampleCount: number) => {
    if (!loopId) return
    const next = Math.max(0, Math.floor(targetSampleCount))
    Atomics.store(viewGlobalSampleCount, 0, next)
    setViewSampleCount(loopId, next)
    if (isPlayingLoop) seekToPlaybackSample(next)
  }, [isPlayingLoop, loopId, seekToPlaybackSample, setViewSampleCount, viewGlobalSampleCount])

  const lastSyncedSampleRef = useRef(0)

  useEffect(() => {
    if (!isPlaybackRunningForView) return
    if (!loopId) return
    if (typeof window === 'undefined') return

    const src = storeGlobalSampleCount
    const dst = viewGlobalSampleCount
    if (!src) return

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
  }, [isPlaybackRunningForView, loopId, setViewSampleCount, storeGlobalSampleCount, viewGlobalSampleCount])

  const globalSampleCount = useMemo(() => {
    if (isPlaybackRunningForView) return storeGlobalSampleCount
    return viewGlobalSampleCount
  }, [isPlaybackRunningForView, storeGlobalSampleCount, viewGlobalSampleCount])

  return {
    isPlayingLoop,
    isPlaybackRunningForView,
    viewSampleCount,
    globalSampleCount,
    seekToSample,
    canControlPlayback: isPlayingLoop,
  }
}
