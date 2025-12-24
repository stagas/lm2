import { SCROLL_SMOOTHING } from './constants.ts'
import { useEngineRuntimeStore } from './store.ts'

export function applySmoothing(target: number, value: number, crossover = 100) {
  const diff = value - target
  const isPlaying = useEngineRuntimeStore.getState().playbackState === 'running'
  return target
    + diff * SCROLL_SMOOTHING * (isPlaying && Math.abs(diff) > crossover ? 4 : (!isPlaying ? 1.8 : 1))
}
