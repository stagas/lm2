import { ChatCircleIcon, ChatIcon, HeartIcon, ShareIcon, ShareNetworkIcon } from '@phosphor-icons/react'
import { Logo } from '../../components/Logo.tsx'
import { useEngineDspStore, useEngineRuntimeStore, useEngineUiStore } from '../store.ts'
import type { TimelineWindow } from '../types.ts'
import { PauseGradientIcon, PlayGradientIcon, StopGradientIcon } from './Icons.tsx'
import type { Loop } from './loop.ts'
import { MinimapScrollbar } from './MinimapScrollbar.tsx'
import { RestartButton } from './RestartButton.tsx'
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
  const playbackState = useEngineRuntimeStore(state => state.playbackState)
  const isPlaying = playbackState === 'running'

  return (
    <div className="flex items-center justify-center mx-2">
      {!isPlaying
        ? (
          <PlaybackButton icon={<PlayGradientIcon />} onClick={() => {
            if (!currentLoop) return
            onDspError(undefined)
            void playLoop(currentLoop.data.id, currentLoop.codeFile.value).catch(err => {
              onDspError(err instanceof Error ? err.message : String(err))
            })
          }} />
        )
        : <PlaybackButton icon={<PauseGradientIcon />} onClick={pause} />}
      <PlaybackButton icon={<StopGradientIcon />} onClick={stop} />
    </div>
  )
}

function LoopTitle(
  { loop }: { loop: Loop | null },
) {
  const loopData = loop?.data
  const title = loopData?.title ?? ''
  const artist = loopData?.artist ?? ''
  const remixOf = loopData?.remixOf
  const likesCount = 42 // loopData?.likesCount ?? 0
  const commentsCount = 2 // loopData?.commentsCount ?? 0
  return (
    <div className="whitespace-nowrap text-2xl mr-4 pl-4 h-full flex items-center justify-center">
      <div className="flex flex-col items-end font-[Turret_Road] font-bold">
        <span className="bg-gradient-to-br from-orange-400 to-red-600 bg-clip-text text-transparent">
          {artist} - {title}
        </span>
        {remixOf && (
          <span className="-mt-1 bg-gradient-to-br from-orange-400 to-red-600 bg-clip-text text-transparent text-sm">
            remix of: {remixOf.artist} - {remixOf.title}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center ml-2.5 mr-2">
        <button title="Share" className="text-neutral-500 hover:text-white cursor-pointer">
          <ShareNetworkIcon weight="light" size={24} />
        </button>
      </div>
      <div className="flex flex-col items-start">
        <button title="Like"
          className="text-neutral-500 hover:text-white cursor-pointer font-[Space_Grotesk] flex flex-row items-center justify-center font-normal text-sm"
        >
          <HeartIcon size={16} />
          <span className="relative top-[1.35px] left-[1px]">{likesCount}</span>
        </button>
        <button title="Comments"
          className="-mt-[1px] text-neutral-500 hover:text-white cursor-pointer font-[Space_Grotesk] flex flex-row items-center justify-center font-normal text-sm"
        >
          <ChatIcon size={16} />
          <span className="relative top-[1.35px] left-[1px]">{commentsCount}</span>
        </button>
      </div>
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
    <div className="h-[60px] flex items-center justify-center pl-3 border-b-2 border-orange-600">
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
      <LoopTitle loop={currentLoop} />
    </div>
  )
}
