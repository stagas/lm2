import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../app/store.ts'
import { Logo } from '../components/Logo.tsx'
import { RadialGradient } from '../components/RadialGradient.tsx'
import { SpinnerLarge } from '../components/Spinner.tsx'
import { DspSourceEditor } from './DspSourceEditor.tsx'
import type { Loop } from './loop.ts'
import { Nav } from './Nav.tsx'
import { useEngine } from './program.ts'
import { Sidebar } from './Sidebar.tsx'
import { useEngineStore } from './store.ts'
import { useTimelineHeader } from './useTimelineHeader.ts'

function Intro({ isFadingOut = false, isFadingIn = true }: { isFadingOut?: boolean; isFadingIn?: boolean }) {
  return (
    <div
      className={`z-50 fixed inset-0 w-[100dvw] h-[100dvh] transition-opacity duration-[1000ms] ease-in-out pointer-events-none ${
        isFadingOut
          ? 'opacity-0'
          : 'opacity-100'
      }`}
    >
      <div className="w-full h-full bg-black flex items-center justify-center">
        <RadialGradient>
          <div
            className={`flex w-full h-full items-center justify-center transition-all ease-in-out ${
              isFadingOut
                ? 'duration-[1000ms] scale-y-[1.15] scale-x-[1.25] -translate-y-2'
                : isFadingIn && !isFadingOut
                ? 'duration-[700ms] scale-y-[1.05] scale-x-[1.15] translate-y-1.5'
                : 'duration-[700ms] opacity-100 scale-100 translate-0'
            }`}
          >
            <div className="absolute w-full h-full inset-0 z-10 flex flex-col gap-1 items-center justify-center">
              <Logo size="3.5em" text="loopmaster" />
              <SpinnerLarge />
            </div>
          </div>
        </RadialGradient>
      </div>
    </div>
  )
}

export function EngineUI() {
  const [currentLoop, setCurrentLoop] = useState<Loop | null>(null)

  const { isInitialized } = useEngine()
  const hasHydrated = useAppStore(state => state.hasHydrated)
  const isLoopLoading = useAppStore(state => state.isLoopLoading)
  const isProgramReady = useEngineStore(state => state.isProgramReady)
  const audioContext = useEngineStore(state => state.audioContext)
  const isAwaitingCode = currentLoop != null && currentLoop.data.code == null
  const shouldWait = !isInitialized || !hasHydrated || !isProgramReady || isLoopLoading || isAwaitingCode
    || !currentLoop

  const [showIntro, setShowIntro] = useState(true)
  const [isFadingIn, setIsFadingIn] = useState(true)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const animationIntroTimeRef = useRef<number>(0)

  const [dspError, setDspError] = useState<string>()
  const { timelineHeader, timelineWindowRef } = useTimelineHeader(currentLoop?.data.id ?? null)

  const handleLoopChange = useCallback((loop: Loop) => {
    setCurrentLoop(loop)
  }, [])

  useEffect(() => {
    requestAnimationFrame(() => {
      animationIntroTimeRef.current = performance.now()
      setIsFadingIn(false)
    })
  }, [])

  useEffect(() => {
    if (shouldWait || !showIntro) return
    const deltaTime = performance.now() - animationIntroTimeRef.current
    setTimeout(() => {
      audioContext?.resume()
      setIsFadingOut(true)
      setTimeout(() => {
        setIsFadingOut(false)
        setShowIntro(false)
      }, 2000)
      ;(async () => {
        if (!audioContext) return
        const res = await fetch('./cowbell.ogg')
        const arrayBuffer = await res.arrayBuffer()
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        const source = audioContext.createBufferSource()
        source.buffer = audioBuffer
        source.connect(audioContext.destination)
        source.start()
        useEngineStore.getState().playLoop('1', '.001 |> out($)')
      })()
    }, deltaTime < 700 ? 800 - deltaTime : 100)
  }, [shouldWait, showIntro])

  if (!isInitialized && showIntro) {
    return <Intro key="intro" isFadingIn={isFadingIn} isFadingOut={isFadingOut} />
  }

  return (
    <>
      {showIntro && <Intro key="intro" isFadingIn={isFadingIn} isFadingOut={isFadingOut} />}
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
    </>
  )
}
