import { useAppStore } from '../../app/store.ts'
import { useEngineRuntimeStore } from '../store.ts'

export function useIsEditorBusy() {
  const hasHydrated = useAppStore(state => state.hasHydrated)
  const isProgramReady = useEngineRuntimeStore(state => state.isProgramReady)
  const audioContext = useEngineRuntimeStore(state => state.audioContext)
  return !hasHydrated || !isProgramReady || !audioContext
}
