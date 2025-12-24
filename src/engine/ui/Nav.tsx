import { Logo } from '../../components/Logo.tsx'
import { useEngineDspStore, useEngineRuntimeStore, useEngineUiStore } from '../store.ts'
import type { TimelineWindow } from '../types.ts'
import { PauseGradientIcon, PlayGradientIcon, StopGradientIcon } from './Icons.tsx'
import type { Loop } from './loop.ts'
import { MinimapScrollbar } from './MinimapScrollbar.tsx'
import { useCodeFileValue } from './useCodeFileValue.ts'
import { useLoopView } from './useLoopView.ts'

function PlaybackButton({ icon, onClick }: { icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onPointerDown={onClick} className="w-10 h-8 flex items-center justify-center text-orange-600">
      {icon}
    </button>
  )
}

export function PlaybackControls({
  currentLoop,
  onDspError,
}: { currentLoop: Loop | null; onDspError: (error: string | undefined) => void }) {
  const playLoop = useEngineDspStore(state => state.playLoop)
  const pause = useEngineRuntimeStore(state => state.pause)
  const stop = useEngineRuntimeStore(state => state.stop)

  return (
    <div className="flex items-center justify-center">
      <PlaybackButton icon={<PlayGradientIcon />} onClick={() => {
        if (!currentLoop) return
        onDspError(undefined)
        void playLoop(currentLoop.data.id, currentLoop.codeFile.value).catch(err => {
          onDspError(err instanceof Error ? err.message : String(err))
        })
      }} />
      <PlaybackButton icon={<PauseGradientIcon />} onClick={pause} />
      <PlaybackButton icon={<StopGradientIcon />} onClick={stop} />
    </div>
  )
}

export function Nav({
  timelineWindowRef,
  currentLoop,
  onDspError,
}: {
  timelineWindowRef: React.RefObject<TimelineWindow>
  currentLoop: Loop | null
  onDspError: (error: string | undefined) => void
}) {
  const audioContext = useEngineRuntimeStore(state => state.audioContext)
  const bpmValue = useEngineRuntimeStore(state => state.bpmValue)
  const globalSampleCount = useEngineRuntimeStore(state => state.globalSampleCount)
  const uiTimelineLabels = useEngineDspStore(state => state.uiTimelineLabels)
  const uiTimelineRefs = useEngineDspStore(state => state.uiTimelineRefs)
  const uiBars = useEngineDspStore(state => state.uiBars)
  const uiZeroBased = useEngineUiStore(state => state.zeroBasedTimelines)

  // Subscribe for rerenders while editing, but read from `codeFile.value` on demand.
  useCodeFileValue(currentLoop?.codeFile)
  const { globalSampleCount: viewGlobalSampleCount, seekToSample, canControlPlayback } = useLoopView(
    currentLoop?.data.id ?? null,
  )

  return (
    <div className="h-[60px] flex items-center justify-center gap-2 pl-3 border-b-2 border-orange-600">
      <Logo />
      <PlaybackControls
        currentLoop={currentLoop}
        onDspError={onDspError}
      />
      <MinimapScrollbar
        audioContext={audioContext}
        bpmValue={bpmValue}
        globalSampleCount={viewGlobalSampleCount ?? globalSampleCount}
        timelineRefs={uiTimelineRefs}
        timelineLabels={uiTimelineLabels}
        bars={uiBars}
        zeroBased={uiZeroBased}
        seekToSample={seekToSample}
        timelineWindowRef={timelineWindowRef}
        canControlPlayback={canControlPlayback}
      />
    </div>
  )
}
