import { useCallback } from 'react'
import { useEngineStore } from './store.ts'
import { ControlOp } from './worklet-shared.ts'

export function useSeekToSample() {
  const {
    globalSampleCount,
    control,
    seekSampleCount,
  } = useEngineStore()

  const seekToSample = useCallback((targetSampleCount: number) => {
    if (!control || !seekSampleCount || !globalSampleCount) return
    const currentSample = Atomics.load(globalSampleCount, 0)
    if (currentSample === targetSampleCount) return

    Atomics.store(seekSampleCount, 0, targetSampleCount)
    Atomics.store(control, 0, ControlOp.Seek)
  }, [control, globalSampleCount, seekSampleCount])

  return seekToSample
}

export function useSeekToSampleImmediate() {
  const {
    globalSampleCount,
    control,
    seekSampleCount,
  } = useEngineStore()

  const seekToSampleImmediate = useCallback((targetSampleCount: number) => {
    if (!control || !seekSampleCount || !globalSampleCount) return
    const currentSample = Atomics.load(globalSampleCount, 0)
    if (currentSample === targetSampleCount) return

    Atomics.store(seekSampleCount, 0, targetSampleCount)
    Atomics.store(control, 0, ControlOp.SeekImmediate)
  }, [control, globalSampleCount, seekSampleCount])

  return seekToSampleImmediate
}
