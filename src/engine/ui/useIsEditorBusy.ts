import { useAppStore } from '../../app/store.ts'
import { useEngineDspStore, useEngineRuntimeStore } from '../store.ts'

export function useIsEditorBusy() {
  const hasHydrated = useAppStore(state => state.hasHydrated)
  const isLoopLoading = useAppStore(state => state.isLoopLoading)
  const isProgramReady = useEngineRuntimeStore(state => state.isProgramReady)
  const audioContext = useEngineRuntimeStore(state => state.audioContext)
  const isPreloadingSamples = useEngineDspStore(state => state.isPreloadingSamples)
  return !hasHydrated || isLoopLoading || !isProgramReady || !audioContext || isPreloadingSamples
}
