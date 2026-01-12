import { useMemo } from 'preact/hooks'
import { LITERALS_COUNT, OPS_COUNT } from '../../../as/assembly/constants.ts'
import { encodeLangToVmOps, extractEarlyDataFromSource } from '../bytecode/bytecode.ts'
import { buildTimelineLabels } from '../dsp/timeline-labels.ts'
import { useEngineRuntimeStore, useEngineUiStore } from '../store.ts'
import { InlineEditor } from './docs/InlineEditor.tsx'
import { MinimapScrollbar } from './MinimapScrollbar.tsx'
import { usePlayingState } from './usePlayingState.ts'
import { useTimelineHeader } from './useTimelineHeader.ts'

type EditorWithTimelineProps = {
  loopId: string
  code: string
  autoHeight?: boolean
  minimapHeight?: string
}

export function EditorWithTimeline(
  { loopId, code, autoHeight = false, minimapHeight = '40px' }: EditorWithTimelineProps,
) {
  const { timelineHeader, timelineWindowRef } = useTimelineHeader(loopId)
  const audioContext = useEngineRuntimeStore(state => state.audioContext)
  const bpmValue = useEngineRuntimeStore(state => state.bpmValue)
  const globalSampleCount = useEngineRuntimeStore(state => state.globalSampleCount)
  const uiZeroBased = useEngineUiStore(state => state.zeroBasedTimelines)
  const { globalSampleCount: viewGlobalSampleCount, seekToSample, canControlPlayback } = usePlayingState(loopId)

  const timelineData = useMemo(() => {
    if (!code) return { timelineRefs: undefined, timelineLabels: undefined, bars: undefined }
    try {
      const target = { ops: new Int32Array(OPS_COUNT), literals: new Float32Array(LITERALS_COUNT) }
      const compiled = encodeLangToVmOps(code, target)
      const early = extractEarlyDataFromSource(code)
      const bars = early.errors.length ? undefined : early.bars
      const timelineLabels = early.errors.length ? [] : buildTimelineLabels(early.timelineLabels, early.bars)
      return {
        timelineRefs: compiled.timelineRefs,
        timelineLabels,
        bars,
      }
    }
    catch {
      return { timelineRefs: undefined, timelineLabels: undefined, bars: undefined }
    }
  }, [code])

  return (
    <div className="w-full h-full">
      <div className="w-full" style={{ height: minimapHeight }}>
        <MinimapScrollbar
          audioContext={audioContext}
          bpmValue={bpmValue}
          globalSampleCount={viewGlobalSampleCount ?? globalSampleCount}
          zeroBased={uiZeroBased}
          seekToSample={seekToSample}
          timelineWindowRef={timelineWindowRef}
          canControlPlayback={canControlPlayback}
          timelineRefs={timelineData.timelineRefs}
          timelineLabels={timelineData.timelineLabels}
          bars={timelineData.bars}
        />
      </div>
      <div className={`w-full h-[calc(100%-${minimapHeight})]`}>
        <InlineEditor
          id={loopId}
          initialCode={code}
          autoHeight={autoHeight}
          hidePlayButton={true}
          header={timelineHeader}
          noMargin={true}
        />
      </div>
    </div>
  )
}
