import { ShareNetworkIcon } from '@phosphor-icons/react'
import { useState } from 'preact/hooks'
import { MouseButtons } from 'utils/mouse-buttons'
import { useAppStore } from '../../app/store.ts'
import { Logo } from '../../components/Logo.tsx'
import { ShareModal } from '../../components/ShareModal.tsx'
import { useEngineDspStore, useEngineRuntimeStore, useEngineUiStore } from '../store.ts'
import type { TimelineWindow } from '../types.ts'
import { PauseGradientIcon, PlayGradientIcon, StopGradientIcon } from './Icons.tsx'
import type { Loop } from './loop.ts'
import { MinimapScrollbar } from './MinimapScrollbar.tsx'
import { usePlayingState } from './usePlayingState.ts'
import { useRestartLoop } from './useRestartLoop.tsx'

function PlaybackButton(
  { icon, onClick }: { icon: preact.ComponentChildren;
    onClick: (e: preact.TargetedPointerEvent<HTMLButtonElement>) => void },
) {
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
  const playbackState = useEngineRuntimeStore(state => state.playbackState)
  const playingLoopId = useEngineRuntimeStore(state => state.playingLoopId)
  const restartLoop = useRestartLoop()
  const playLoop = useEngineDspStore(state => state.playLoop)
  const pause = useEngineRuntimeStore(state => state.pause)
  const start = useEngineRuntimeStore(state => state.start)
  const stop = useEngineRuntimeStore(state => state.stop)
  const setViewSampleCount = useEngineUiStore(state => state.setViewSampleCount)
  const globalSampleCount = useEngineRuntimeStore(state => state.globalSampleCount)

  return (
    <div className="flex items-center justify-center mx-2">
      <PlaybackButton icon={<PlayGradientIcon />}
        onClick={async (e: preact.TargetedPointerEvent<HTMLButtonElement>) => {
          if (!currentLoop) return
          const isSameLoop = playingLoopId === currentLoop.data.id
          onDspError(undefined)
          let startSample: number | undefined
          if ((e.buttons & MouseButtons.Middle) || (e.ctrlKey || e.metaKey)) {
            if (playbackState === 'running' && isSameLoop) {
              await restartLoop()
              return
            }
            startSample = 0
          }
          if (isSameLoop && playbackState !== 'running') {
            start()
          }
          else {
            void playLoop(currentLoop.data.id, currentLoop.codeFile.value, startSample).catch(err => {
              onDspError(err instanceof Error ? err.message : String(err))
            })
          }
        }} />
      <PlaybackButton icon={<PauseGradientIcon />} onClick={() => {
        if (playbackState === 'running') {
          pause()
          if (currentLoop && globalSampleCount) {
            setViewSampleCount(currentLoop.data.id, Atomics.load(globalSampleCount, 0))
          }
        }
        else {
          start()
        }
      }} />
      <PlaybackButton icon={<StopGradientIcon />} onClick={stop} />
    </div>
  )
}

function LoopTitle(
  { loop }: { loop: Loop | null },
) {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const loopData = loop?.data
  const title = loopData?.title ?? ''
  const artist = loopData?.artist ?? ''
  const remixOfId = loopData?.remixOfId
  const remixOfFromId = useAppStore(state => {
    if (!remixOfId) return undefined
    return state.publicLoopsCache.find(l => l.id === remixOfId)
      ?? state.hotLoopsCache.find(l => l.id === remixOfId)
      ?? state.bestLoopsCache.find(l => l.id === remixOfId)
      ?? state.likedLoopsCache.find(l => l.id === remixOfId)
      ?? state.serverLoopsCache.find(l => l.id === remixOfId)
  })
  const remixOf = remixOfFromId ?? loopData?.remixOf
  const likesCount = loopData?.likesCount ?? 0
  const commentsCount = loopData?.commentsCount ?? 0
  const remixesCount = loopData?.remixesCount ?? 0

  const trackUrl = loopData ? `${window.location.origin}/loop/${loopData.id}` : ''
  const trackTitle = title
  const userName = artist

  return (
    <>
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
        {loop && !loop.isNew && loop.data.isPublic && (
          <div className="flex flex-col items-center ml-2.5 -mr-0.5">
            <button
              title="Share"
              className="text-neutral-500 hover:text-white cursor-pointer"
              onClick={() => setIsShareModalOpen(true)}
            >
              <ShareNetworkIcon weight="light" size={24} />
            </button>
          </div>
        )}
      </div>
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        trackUrl={trackUrl}
        trackTitle={trackTitle}
        userName={userName}
      />
    </>
  )
}

export function Nav({
  timelineWindowRef,
  currentLoop,
  onDspError,
}: {
  timelineWindowRef: preact.RefObject<TimelineWindow>
  currentLoop: Loop | null
  onDspError: (error: string | undefined) => void
}) {
  const audioContext = useEngineRuntimeStore(state => state.audioContext)
  const bpmValue = useEngineRuntimeStore(state => state.bpmValue)
  const globalSampleCount = useEngineRuntimeStore(state => state.globalSampleCount)
  const uiZeroBased = useEngineUiStore(state => state.zeroBasedTimelines)

  const { globalSampleCount: viewGlobalSampleCount, seekToSample, canControlPlayback } = usePlayingState(
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
        zeroBased={uiZeroBased}
        seekToSample={seekToSample}
        timelineWindowRef={timelineWindowRef}
        canControlPlayback={canControlPlayback}
      />
      <LoopTitle loop={currentLoop} />
    </div>
  )
}
