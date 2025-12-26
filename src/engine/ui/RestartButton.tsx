import { useEngineDspStore } from '../store.ts'
import type { Loop } from './loop.ts'
import { useRestartLoop } from './useRestartLoop.tsx'
import { useSeekToSampleImmediate } from './useSeekToSample.ts'

export function RestartButton(
  { canControlPlayback, currentLoop }: { canControlPlayback: boolean; currentLoop: Loop | null },
) {
  const seekToSampleImmediate = useSeekToSampleImmediate()
  const restartLoop = useRestartLoop()
  const playLoop = useEngineDspStore(state => state.playLoop)

  return (
    <button
      className="min-w-[17px] w-[17px] bg-neutral-800 text-white"
      onPointerDown={() => {
        if (!canControlPlayback) {
          if (currentLoop) {
            seekToSampleImmediate(0)
            void playLoop(currentLoop.data.id, currentLoop.codeFile.value, 0)
            return
          }
          return
        }
        void restartLoop()
      }}
    >
      &nbsp;
    </button>
  )
}
