import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useAppStore } from '../../app/store.ts'
import { Logo } from '../../components/Logo.tsx'
import { RadialGradient } from '../../components/RadialGradient.tsx'
import { SpinnerLarge } from '../../components/Spinner.tsx'
import { useEngine } from '../dsp/program.ts'
import { useEngineDspStore, useEngineRuntimeStore } from '../store.ts'
import { DspSourceEditor } from './DspSourceEditor.tsx'
import { Nav } from './Nav.tsx'
import { RouterProvider, useRouter } from './router.tsx'
import { Sidebar } from './Sidebar.tsx'
import { useCurrentLoop } from './useCurrentLoop.ts'
import { useFontsLoaded } from './useFontsLoaded.ts'
import { useIsEditorBusy } from './useIsEditorBusy.ts'
import { useTimelineHeader } from './useTimelineHeader.ts'

function Intro(
  { isFadingOut = false, isFadingIn = true }: { isFadingOut?: boolean; isFadingIn?: boolean },
) {
  return (
    <div
      className={`z-[99999999999] fixed inset-0 w-[100dvw] h-[100dvh] transition-opacity duration-[1000ms] ease-in-out ${
        isFadingOut
          ? 'opacity-0 pointer-events-none'
          : 'opacity-100'
      }`}
    >
      <div className="w-full h-full bg-black flex items-center justify-center">
        <div
          className={`w-full h-full transition-opacity duration-[800ms] ease-in-out ${
            isFadingIn ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <RadialGradient>
            <div
              className={`flex w-full h-full items-center justify-center transition-all ease-in-out ${
                isFadingOut
                  ? 'duration-[1000ms] scale-y-[1.15] scale-x-[1.25] -translate-y-2.5'
                  : isFadingIn && !isFadingOut
                  ? 'duration-[700ms] opacity-0 scale-y-[1.025] scale-x-[1.1] translate-y-1'
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
    </div>
  )
}

function RouterContent({
  showIntro,
  isFadingIn,
  isFadingOut,
  timelineWindowRef,
  currentLoop,
  dspError,
  timelineHeader,
  hasHydrated,
  onDspError,
}: {
  showIntro: boolean
  isFadingIn: boolean
  isFadingOut: boolean
  timelineWindowRef: preact.RefObject<any>
  currentLoop: any
  dspError: string | undefined
  timelineHeader: any
  hasHydrated: boolean
  onDspError: (error: string | undefined) => void
}) {
  // Parse loop ID from URL path like /loop/<id>
  const { pathname, navigate } = useRouter()
  const loopIdFromUrl = useMemo(() => {
    const match = pathname.match(/^\/loop\/([^/]+)$/)
    return match ? match[1] : null
  }, [pathname])

  const hasCheckedInitialNavigation = useRef(false)

  // Initialize selected loop from URL if present
  useEffect(() => {
    if (!hasHydrated) return
    if (!loopIdFromUrl) return

    const setSelectedLoopId = useAppStore.getState().setSelectedLoopId
    const currentSelectedId = useAppStore.getState().selectedLoopId

    // Only set if not already set or different
    if (currentSelectedId !== loopIdFromUrl) {
      setSelectedLoopId(loopIdFromUrl)
    }
  }, [hasHydrated, loopIdFromUrl])

  // Navigate to /my if we're at / and the current loop is new (only at init)
  useEffect(() => {
    if (hasCheckedInitialNavigation.current) return
    if (!hasHydrated) return
    if (!currentLoop) return
    if (pathname !== '/') return
    if (!currentLoop.isNew) return

    hasCheckedInitialNavigation.current = true
    navigate('/my')
  }, [hasHydrated, currentLoop, pathname, navigate])

  return (
    <>
      {showIntro && <Intro isFadingIn={isFadingIn} isFadingOut={isFadingOut} />}
      <div className="flex flex-col">
        <Nav
          timelineWindowRef={timelineWindowRef}
          currentLoop={currentLoop}
          onDspError={onDspError}
        />
        <div className="flex flex-row h-[calc(100dvh-61px)]">
          <Sidebar />
          <DspSourceEditor
            timelineHeader={timelineHeader}
            currentLoop={currentLoop}
            dspError={dspError}
            onDspError={onDspError}
          />
        </div>
      </div>
    </>
  )
}

export function EngineUI() {
  const { isInitialized } = useEngine()
  const hasHydrated = useAppStore(state => state.hasHydrated)
  const isLoopLoading = useAppStore(state => state.isLoopLoading)
  const isProgramReady = useEngineRuntimeStore(state => state.isProgramReady)
  const audioContext = useEngineRuntimeStore(state => state.audioContext)
  const preloadSamples = useEngineDspStore(state => state.preloadSamples)
  const currentLoop = useCurrentLoop()
  const isEditorBusy = useIsEditorBusy()
  const fontsLoaded = useFontsLoaded()

  const routeLoopId = useMemo(() => {
    const pathname = window.location.pathname || '/'
    const match = pathname.match(/^\/loop\/([^/]+)$/)
    return match ? match[1] : null
  }, [])

  const isRouteLoopReady = routeLoopId == null ? true : currentLoop?.data.id === routeLoopId

  const shouldWait = !isInitialized || !hasHydrated || !isProgramReady || !audioContext || !currentLoop
    || !isRouteLoopReady
    || isLoopLoading || isEditorBusy

  const [showIntro, setShowIntro] = useState(true)
  const [isFadingIn, setIsFadingIn] = useState(true)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const animationIntroTimeRef = useRef<number>(0)
  const didStartIntroExitRef = useRef(false)

  const [dspError, setDspError] = useState<string>()
  const { timelineHeader, timelineWindowRef } = useTimelineHeader(currentLoop?.data.id ?? null)

  useEffect(() => {
    if (!fontsLoaded) return
    animationIntroTimeRef.current = performance.now()
    requestAnimationFrame(() => {
      setIsFadingIn(false)
    })
  }, [fontsLoaded])

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

  return (
    <RouterProvider>
      <RouterContent
        showIntro={showIntro}
        isFadingIn={isFadingIn}
        isFadingOut={isFadingOut}
        timelineWindowRef={timelineWindowRef}
        currentLoop={currentLoop}
        dspError={dspError}
        timelineHeader={timelineHeader}
        hasHydrated={hasHydrated}
        onDspError={setDspError}
      />
    </RouterProvider>
  )
}
