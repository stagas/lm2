import { useLayoutEffect } from 'preact/hooks'
import { useEngineUiStore } from '../store.ts'
import { usePlayingState } from './usePlayingState.ts'

export function useLoopView(loopId: string | null) {
  const { viewGlobalSampleCount } = usePlayingState(loopId)

  const viewSampleCount = useEngineUiStore(state => {
    if (!loopId) return 0
    return state.viewSampleCountByLoopId[loopId] ?? 0
  })

  useLayoutEffect(() => {
    Atomics.store(viewGlobalSampleCount, 0, Math.max(0, viewSampleCount))
  }, [viewGlobalSampleCount, viewSampleCount])

  return viewSampleCount
}
