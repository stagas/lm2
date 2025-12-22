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

  const seekToSampleImmediate = useCallback(async (targetSampleCount: number) => {
    if (!control || !seekSampleCount || !globalSampleCount) return
    const currentSample = Atomics.load(globalSampleCount, 0)
    if (currentSample === targetSampleCount) return

    Atomics.store(seekSampleCount, 0, targetSampleCount)
    Atomics.store(control, 0, ControlOp.SeekImmediate)

    // Spin wait until control is no longer SeekImmediate
    const deadline = performance.now() + 1000
    while (Atomics.load(control, 0) === ControlOp.SeekImmediate && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1))
    }
  }, [control, globalSampleCount, seekSampleCount])

  return seekToSampleImmediate
}
