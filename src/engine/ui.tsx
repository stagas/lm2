import { useCallback, useState } from 'react'
import { Logo } from '../components/Logo.tsx'
import { SpinnerFull } from '../components/Spinner.tsx'
import { DspSourceEditor } from './DspSourceEditor.tsx'
import type { Loop } from './loop.ts'
import { Nav } from './Nav.tsx'
import { useEngine } from './program.ts'
import { Sidebar } from './Sidebar.tsx'
import { useTimelineHeader } from './useTimelineHeader.ts'

export function EngineUI() {
  const { isInitialized } = useEngine()

  const [currentLoop, setCurrentLoop] = useState<Loop | null>(null)
  const [dspError, setDspError] = useState<string>()
  const { timelineHeader, timelineWindowRef } = useTimelineHeader(currentLoop?.data.id ?? null)

  const handleLoopChange = useCallback((loop: Loop) => {
    setCurrentLoop(loop)
  }, [])

  if (!isInitialized) {
    return (
      <div className="w-[100dvw] h-[100dvh]">
        <SpinnerFull>
          <Logo size="3.5em" text="loopmaster" />
        </SpinnerFull>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <Nav
        timelineWindowRef={timelineWindowRef}
        currentLoop={currentLoop}
        onDspError={setDspError}
      />
      <div className="flex flex-row h-[calc(100dvh-61px)]">
        <Sidebar onLoopChange={handleLoopChange} />
        <DspSourceEditor
          timelineHeader={timelineHeader}
          currentLoop={currentLoop}
          dspError={dspError}
          onDspError={setDspError}
        />
      </div>
    </div>
  )
}
