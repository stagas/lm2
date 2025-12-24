import { useCallback, useEffect, useMemo, useRef } from 'react'
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
    if (isPlayingLoop) {
      seekToPlaybackSample(targetSampleCount)
      return
    }
    const next = Math.max(0, Math.floor(targetSampleCount))
    const arr = viewGlobalSampleCountRef.current
    if (arr) Atomics.store(arr, 0, next)
    setViewSampleCount(loopId, next)
  }, [isPlayingLoop, loopId, seekToPlaybackSample, setViewSampleCount])

  const globalSampleCount = useMemo(() => {
    if (isPlayingLoop) return storeGlobalSampleCount
    return viewGlobalSampleCountRef.current ?? undefined
  }, [isPlayingLoop, storeGlobalSampleCount])

  return {
    isPlayingLoop,
    isPlaybackRunningForView,
    viewSampleCount,
    globalSampleCount,
    seekToSample,
    canControlPlayback: isPlayingLoop,
  }
}
