import { useAppStore } from '../../app/store.ts'
import { useEngineDspStore, useEngineRuntimeStore } from '../store.ts'

export function useIsEditorBusy() {
  const hasHydrated = useAppStore(state => state.hasHydrated)
  const isProgramReady = useEngineRuntimeStore(state => state.isProgramReady)
  const audioContext = useEngineRuntimeStore(state => state.audioContext)
  useEngineDspStore(state => state.isPreloadingSamples)
  useAppStore(state => state.isLoopLoading)
  return !hasHydrated || !isProgramReady || !audioContext
}
