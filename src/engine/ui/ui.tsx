import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '../../app/store.ts'
import { Logo } from '../../components/Logo.tsx'
import { RadialGradient } from '../../components/RadialGradient.tsx'
import { SpinnerLarge } from '../../components/Spinner.tsx'
import { useEngine } from '../dsp/program.ts'
import { useEngineDspStore, useEngineRuntimeStore } from '../store.ts'
import { DspSourceEditor } from './DspSourceEditor.tsx'
import { Nav } from './Nav.tsx'
import { RouterProvider } from './router.tsx'
import { Sidebar } from './Sidebar.tsx'
import { useCurrentLoop } from './useCurrentLoop.ts'
import { useIsEditorBusy } from './useIsEditorBusy.ts'
import { useTimelineHeader } from './useTimelineHeader.ts'

function Intro({ isFadingOut = false, isFadingIn = true }: { isFadingOut?: boolean; isFadingIn?: boolean }) {
  return (
    <div
      className={`z-50 fixed inset-0 w-[100dvw] h-[100dvh] transition-opacity duration-[1000ms] ease-in-out ${
        isFadingOut
          ? 'opacity-0 pointer-events-none'
          : 'opacity-100'
      }`}
    >
      <div className="w-full h-full bg-black flex items-center justify-center">
        <RadialGradient>
          <div
            className={`flex w-full h-full items-center justify-center transition-all ease-in-out ${
              isFadingOut
                ? 'duration-[1000ms] scale-y-[1.15] scale-x-[1.25] -translate-y-2.5'
                : isFadingIn && !isFadingOut
                ? 'duration-[700ms] opacity-0 scale-y-[1.025] scale-x-[1.1] translate-y-1.5'
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
  const { isInitialized } = useEngine()
  const hasHydrated = useAppStore(state => state.hasHydrated)
  const isProgramReady = useEngineRuntimeStore(state => state.isProgramReady)
  const audioContext = useEngineRuntimeStore(state => state.audioContext)
  const preloadSamples = useEngineDspStore(state => state.preloadSamples)
  const currentLoop = useCurrentLoop()
  const isEditorBusy = useIsEditorBusy()
  const shouldWait = !isInitialized || !hasHydrated || !isProgramReady || !audioContext || !currentLoop || isEditorBusy

  const [showIntro, setShowIntro] = useState(true)
  const [isFadingIn, setIsFadingIn] = useState(true)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const animationIntroTimeRef = useRef<number>(0)
  const didStartIntroExitRef = useRef(false)

  const [dspError, setDspError] = useState<string>()
  const { timelineHeader, timelineWindowRef } = useTimelineHeader(currentLoop?.data.id ?? null)

  useEffect(() => {
    requestAnimationFrame(() => {
      animationIntroTimeRef.current = performance.now()
      setIsFadingIn(false)
    })
  }, [])

  const didPreloadRef = useRef<{ loopId: string | null; hadCode: boolean }>({ loopId: null, hadCode: false })

  useLayoutEffect(() => {
    if (!currentLoop) return
    if (!audioContext) return
    const loopId = currentLoop.data.id
    const source = currentLoop.codeFile.value
    const hasCode = source.length > 0

    const prev = didPreloadRef.current
    const changedLoop = prev.loopId !== loopId
    const becameReady = !prev.hadCode && hasCode
    if (!changedLoop && !becameReady) return

    didPreloadRef.current = { loopId, hadCode: hasCode }
    void preloadSamples(source)
  }, [audioContext, currentLoop, preloadSamples])

  useEffect(() => {
    if (shouldWait || !showIntro) return
    if (didStartIntroExitRef.current) return
    didStartIntroExitRef.current = true

    const deltaTime = performance.now() - animationIntroTimeRef.current
    const t1 = window.setTimeout(() => {
      setIsFadingOut(true)
      const t2 = window.setTimeout(() => {
        setIsFadingOut(false)
        setShowIntro(false)
      }, 2000)
      return () => window.clearTimeout(t2)
    }, deltaTime < 700 ? (700 - deltaTime) + (1700 - 700) : 1700)
    ;(async () => {
      for (let i = 0; i < 100; i++) {
        const audioContext = useEngineRuntimeStore.getState().audioContext
        audioContext?.resume()
        if (!audioContext || audioContext.state !== 'running') {
          await new Promise<void>(resolve => setTimeout(resolve, 100))
          continue
        }
        const resPromise = fetch('/cowbell.ogg')
        // await useEngineDspStore.getState().playLoop('1', '.001 |> out($)')
        await new Promise<void>(resolve => setTimeout(resolve, 1500))
        const res = await resPromise
        const arrayBuffer = await res.arrayBuffer()
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        const source = audioContext.createBufferSource()
        source.buffer = audioBuffer
        source.connect(audioContext.destination)
        source.start()
        break
      }
    })()
    return () => window.clearTimeout(t1)
  }, [shouldWait, showIntro])

  if (!isInitialized && showIntro) {
    return <Intro key="intro" isFadingIn={isFadingIn} isFadingOut={isFadingOut} />
  }

  return (
    <RouterProvider>
      <>
        {showIntro && <Intro key="intro" isFadingIn={isFadingIn} isFadingOut={isFadingOut} />}
        <div className="flex flex-col">
          <Nav
            timelineWindowRef={timelineWindowRef}
            currentLoop={currentLoop}
            onDspError={setDspError}
          />
          <div className="flex flex-row h-[calc(100dvh-61px)]">
            <Sidebar />
            <DspSourceEditor
              timelineHeader={timelineHeader}
              currentLoop={currentLoop}
              dspError={dspError}
              onDspError={setDspError}
            />
          </div>
        </div>
      </>
    </RouterProvider>
  )
}
