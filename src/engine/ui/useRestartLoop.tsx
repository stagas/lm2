import { useCallback } from 'react'
import { useEngineRuntimeStore } from '../store.ts'
import { useSeekToSampleImmediate } from './useSeekToSample.ts'

export function useRestartLoop() {
  const { loop } = useEngineRuntimeStore()
  const seekToSampleImmediate = useSeekToSampleImmediate()

  const restartLoop = useCallback(async () => {
    const isLooping = loop ? Atomics.load(loop, 0) === 1 : false
    if (isLooping && loop) await seekToSampleImmediate(Atomics.load(loop, 1))
    else await seekToSampleImmediate(0)
  }, [seekToSampleImmediate])

  return restartLoop
}
