import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks'
import { useEngineRuntimeStore, useEngineUiStore } from '../store.ts'
import { useSeekToSample } from './useSeekToSample.ts'

export function usePlayingState(loopId: string | null) {
  const playingLoopId = useEngineRuntimeStore(state => state.playingLoopId)
  const playbackState = useEngineRuntimeStore(state => state.playbackState)
  const storeGlobalSampleCount = useEngineRuntimeStore(state => state.globalSampleCount)
  const setViewSampleCount = useEngineUiStore(state => state.setViewSampleCount)

  const isPlayingLoop = loopId != null && loopId === playingLoopId
  const isPlaybackRunningForView = isPlayingLoop && playbackState === 'running'

  // Global buffer per loop id to ensure consistent identity
  const viewGlobalSampleCount = useMemo(() => {
    return useEngineRuntimeStore.getState().getViewGlobalSampleCount(loopId)
  }, [loopId])

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
    if (isPlaybackRunningForView && storeGlobalSampleCount) return storeGlobalSampleCount
    return viewGlobalSampleCount
  }, [isPlaybackRunningForView, storeGlobalSampleCount, viewGlobalSampleCount])

  return {
    viewGlobalSampleCount,
    isPlayingLoop,
    isPlaybackRunningForView,
    globalSampleCount,
    seekToSample,
    canControlPlayback: isPlayingLoop,
  }
}
