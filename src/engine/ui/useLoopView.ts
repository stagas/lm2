import { useLayoutEffect, useMemo } from 'preact/hooks'
import { useEngineUiStore } from '../store.ts'
import { usePlayingState } from './usePlayingState.ts'

export function useLoopView(loopId: string | null) {
  const viewSampleCountByLoopId = useEngineUiStore(state => state.viewSampleCountByLoopId)
  const { viewGlobalSampleCount } = usePlayingState(loopId)

  const viewSampleCount = useMemo(() => {
    if (!loopId) return 0
    return viewSampleCountByLoopId[loopId] ?? 0
  }, [loopId, viewSampleCountByLoopId])

  useLayoutEffect(() => {
    Atomics.store(viewGlobalSampleCount, 0, Math.max(0, viewSampleCount))
  }, [viewGlobalSampleCount, viewSampleCount])

  return viewSampleCount
}
