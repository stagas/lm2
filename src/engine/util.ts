import { SCROLL_SMOOTHING } from './constants.ts'
import { useEngineStore } from './store.ts'

export function applySmoothing(target: number, value: number, crossover = 100) {
  const diff = value - target
  const isPlaying = useEngineStore.getState().playbackState === 'running'
  return target
    + diff * SCROLL_SMOOTHING * (isPlaying && diff > crossover ? 4 : (diff < crossover && !isPlaying ? 1.8 : 1))
}
