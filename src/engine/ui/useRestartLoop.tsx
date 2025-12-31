import { useCallback } from 'preact/hooks'
import { useEngineRuntimeStore } from '../store.ts'
import { useSeekToSampleImmediate } from './useSeekToSample.ts'

export function useRestartLoop() {
  const loop = useEngineRuntimeStore(state => state.loop)
  const seekToSampleImmediate = useSeekToSampleImmediate()

  const restartLoop = useCallback(async () => {
    const isLooping = loop ? Atomics.load(loop, 0) === 1 : false
    if (isLooping && loop) await seekToSampleImmediate(Atomics.load(loop, 1))
    else await seekToSampleImmediate(0)
    const runtime = useEngineRuntimeStore.getState()
    if (runtime.playbackState !== 'running') runtime.start()
  }, [seekToSampleImmediate])

  return restartLoop
}
