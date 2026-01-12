import { createPortal, forwardRef } from 'preact/compat'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useAppStore } from '../../app/store.ts'
import { Logo } from '../../components/Logo.tsx'
import { RadialGradient } from '../../components/RadialGradient.tsx'
import { SpinnerLarge } from '../../components/Spinner.tsx'
import { useEngine } from '../dsp/program.ts'
import { INTRO_PROGRAM } from '../intro-program.ts'
import { useEngineDspStore, useEngineRuntimeStore } from '../store.ts'
import { Admin } from './Admin.tsx'
import { Browse } from './Browse.tsx'
import { BrowseArtist } from './BrowseArtist.tsx'
import { BrowseLoop } from './BrowseLoop.tsx'
import { Docs } from './docs/Docs.tsx'
import { DspSourceEditor } from './DspSourceEditor.tsx'
import { functionDefinitions } from './function-definitions.ts'
import { Landing } from './Landing.tsx'
import type { Loop } from './loop.ts'
import { Nav } from './Nav.tsx'
import { RouterProvider, useRouter } from './router.tsx'
import { Sidebar } from './Sidebar.tsx'
import { useCurrentLoop } from './useCurrentLoop.ts'
import { useFontsLoaded } from './useFontsLoaded.ts'
import { useIsEditorBusy } from './useIsEditorBusy.ts'
import { useLoopView } from './useLoopView.ts'
import { useSeekToSampleImmediate } from './useSeekToSample.ts'
import { useTimelineHeader } from './useTimelineHeader.ts'

const Intro = forwardRef<
  HTMLDivElement,
  {
    isFadingOut?: boolean
    isFadingIn?: boolean
    audioContextState?: AudioContextState
    onResumeClick?: () => void
  }
>(({ isFadingOut = false, isFadingIn = true, audioContextState, onResumeClick }: {
  isFadingOut?: boolean
  isFadingIn?: boolean
  audioContextState?: AudioContextState
  onResumeClick?: () => void
}, ref: preact.Ref<HTMLDivElement>) => {
  const needsUserInteraction = audioContextState && audioContextState !== 'running'
  console.log({ isFadingOut, isFadingIn, audioContextState, needsUserInteraction })
  return createPortal(
    <div
      ref={ref}
      className={`z-[99999999999] fixed inset-0 w-[100dvw] h-[100dvh] transition-opacity duration-[1000ms] ease-in-out ${
        isFadingOut
          ? 'opacity-0 pointer-events-none'
          : 'opacity-100'
      }`}
      onPointerDown={needsUserInteraction ? onResumeClick : undefined}
    >
      <div className="w-full h-full bg-black flex items-center justify-center">
        <div
          className={`w-full h-full ${
            isFadingIn ? 'opacity-0' : 'transition-opacity duration-[800ms] ease-in-out opacity-100'
          }`}
        >
          <RadialGradient>
            <div
              className={`flex w-full h-full items-center justify-center scale-100 translate-0 ${
                isFadingOut
                  ? 'transition-all ease-in-out duration-[1000ms] scale-y-[1.15] scale-x-[1.25] -translate-y-2.5'
                  : isFadingIn && !isFadingOut
                  ? 'opacity-0 scale-y-[1.025] scale-x-[1.1] translate-y-1 '
                  : 'transition-all ease-in-out duration-[700ms] opacity-100 '
              }`}
            >
              <div className="absolute w-full h-full inset-0 z-10 flex flex-col gap-1 items-center justify-center">
                <Logo size="3.5em" text="loopmaster" />
                {needsUserInteraction
                  ? <div className="text-white text-lg mt-2">Click anywhere to start</div>
                  : <SpinnerLarge />}
              </div>
            </div>
          </RadialGradient>
        </div>
      </div>
    </div>,
    document.getElementById('intro')!,
  )
})

function SyncSampleCount({ currentLoop }: { currentLoop: Loop | null }) {
  useLoopView(currentLoop?.data.id ?? null)
  return null
}

function AppContent({
  timelineWindowRef,
  currentLoop,
  dspError,
  timelineHeader,
  hasHydrated,
  onDspError,
  docsIsOpen,
  setDocsIsOpen,
  docsSelectedId,
  setDocsSelectedId,
}: {
  timelineWindowRef: preact.RefObject<any>
  currentLoop: any
  dspError: string | undefined
  timelineHeader: any
  hasHydrated: boolean
  onDspError: (error: string | undefined) => void
  docsIsOpen: boolean
  setDocsIsOpen: (value: boolean) => void
  docsSelectedId: string | null
  setDocsSelectedId: (value: string | null) => void
}) {
  const { navigate } = useRouter()
  const previousUrlRef = useRef<string>('/')

  return (
    <>
      <RouterContent
        timelineWindowRef={timelineWindowRef}
        currentLoop={currentLoop}
        dspError={dspError}
        timelineHeader={timelineHeader}
        hasHydrated={hasHydrated}
        onDspError={onDspError}
        docsIsOpen={docsIsOpen}
        setDocsIsOpen={setDocsIsOpen}
        docsSelectedId={docsSelectedId}
        setDocsSelectedId={setDocsSelectedId}
        previousUrlRef={previousUrlRef}
      />
      <Docs
        externalIsOpen={docsIsOpen}
        externalSelectedId={docsSelectedId}
        onClose={() => {
          setDocsIsOpen(false)
          setDocsSelectedId(null)
          navigate(previousUrlRef.current, { replace: true })
        }}
      />
    </>
  )
}

function RouterContent({
  timelineWindowRef,
  currentLoop,
  dspError,
  timelineHeader,
  hasHydrated,
  onDspError,
  docsIsOpen,
  setDocsIsOpen,
  docsSelectedId,
  setDocsSelectedId,
  previousUrlRef,
}: {
  timelineWindowRef: preact.RefObject<any>
  currentLoop: any
  dspError: string | undefined
  timelineHeader: any
  hasHydrated: boolean
  onDspError: (error: string | undefined) => void
  docsIsOpen: boolean
  setDocsIsOpen: (value: boolean) => void
  docsSelectedId: string | null
  setDocsSelectedId: (value: string | null) => void
  previousUrlRef: preact.RefObject<string>
}) {
  // Parse loop ID from URL path like /app/browse/loop/<id>
  const { pathname, navigate } = useRouter()
  const loopIdFromUrl = useMemo(() => {
    const match = pathname.match(/^\/app\/browse\/loop\/([^/]+)$/)
    return match ? match[1] : null
  }, [pathname])

  // Parse docs path like /docs/section-slug
  const docsRoute = useMemo(() => {
    const match = pathname.match(/^\/docs(?:\/(.+))?$/)
    return match ? match[1] || '' : null
  }, [pathname])

  const hasCheckedInitialNavigation = useRef(false)

  // Track the last non-docs URL
  useEffect(() => {
    if (!pathname.startsWith('/docs')) {
      previousUrlRef.current = pathname
    }
  }, [pathname, previousUrlRef])

  // Handle docs routing
  useEffect(() => {
    if (docsRoute !== null) {
      setDocsIsOpen(true)

      if (docsRoute === '') {
        // Default /docs to getting-started tutorial
        setDocsSelectedId('tutorial-getting-started')
        navigate('/docs/tutorials/getting-started', { replace: true })
        return
      }

      // Parse the slug and map to doc ID
      const decodedSlug = decodeURIComponent(docsRoute)
      let targetId: string | null = null

      if (decodedSlug.startsWith('tutorials/')) {
        const tutorialSlug = decodedSlug.replace('tutorials/', '')
        targetId = `tutorial-${tutorialSlug.replace(/[^a-z0-9]+/g, '-')}`
      }
      else if (decodedSlug.startsWith('api/')) {
        const apiSlug = decodedSlug.replace('api/', '')
        // Normalize URL slug back to function name
        const normalizedSlug = apiSlug
          .replace(/^array\./, '[].') // array.map -> [].map
          .replace(/^hash-/, '#') // hash-scale -> #scale
        // Find function by name property
        const functionNames = Object.keys(functionDefinitions)
        const matchingFunction = functionNames.find(key => {
          const def = functionDefinitions[key]
          return def.name === normalizedSlug
        })

        if (matchingFunction) {
          // Generate the API ID the same way as in Docs.tsx
          const funcSlug = matchingFunction.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
          let hash = 5381
          for (let i = 0; i < matchingFunction.length; i++) hash = ((hash << 5) + hash) ^ matchingFunction.charCodeAt(i)
          const hashStr = (hash >>> 0).toString(36)
          targetId = `api-${funcSlug}-${hashStr}`
        }
      }
      else if (decodedSlug.startsWith('about/')) {
        const aboutSlug = decodedSlug.replace('about/', '')
        targetId = `about-${aboutSlug}`
      }

      if (targetId) {
        setDocsSelectedId(targetId)
      }
    }
    else {
      setDocsIsOpen(false)
      setDocsSelectedId(null)
    }
  }, [docsRoute, navigate])

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

  // Show landing page when at root path
  const showLanding = pathname === '/'

  // Check for admin route
  const isAdminRoute = pathname === '/admin'

  // Check for browse routes
  const isBrowseRoute = pathname.startsWith('/browse')
  const isBrowseLoopRoute = pathname.match(/^\/browse\/loop\/([^/]+)$/)
  const isBrowseArtistRoute = pathname.startsWith('/browse/artist/') && pathname.match(/^\/browse\/artist\/[^/]+\//)

  if (showLanding) {
    return <Landing />
  }

  if (isAdminRoute) {
    return <Admin />
  }

  if (isBrowseLoopRoute) {
    return <BrowseLoop />
  }

  if (isBrowseArtistRoute) {
    return <BrowseArtist />
  }

  if (isBrowseRoute) {
    return <Browse />
  }

  return (
    <div className="flex flex-col">
      <SyncSampleCount currentLoop={currentLoop} />
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
          docsIsOpen={docsIsOpen}
        />
      </div>
    </div>
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
  const seekToSampleImmediate = useSeekToSampleImmediate()

  const routeLoopId = useMemo(() => {
    const pathname = window.location.pathname || '/'
    const match = pathname.match(/^\/app\/browse\/loop\/([^/]+)$/)
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

  const [docsIsOpen, setDocsIsOpen] = useState(false)
  const [docsSelectedId, setDocsSelectedId] = useState<string | null>(null)

  const [dspError, setDspError] = useState<string>()
  const { timelineHeader, timelineWindowRef } = useTimelineHeader(currentLoop?.data.id ?? null)
  const [audioContextState, setAudioContextState] = useState<AudioContextState | undefined>(
    audioContext?.state,
  )

  useEffect(() => {
    if (!audioContext) {
      setAudioContextState(undefined)
      return
    }
    const updateState = () => setAudioContextState(audioContext.state)
    audioContext.addEventListener('statechange', updateState)
    updateState()
    return () => audioContext.removeEventListener('statechange', updateState)
  }, [audioContext])

  const playIntroLoop = async () => {
    for (let i = 0; i < 100; i++) {
      const audioContext = useEngineRuntimeStore.getState().audioContext
      if (!audioContext || audioContext.state !== 'running') {
        await new Promise<void>(resolve => setTimeout(resolve, 100))
        continue
      }
      await useEngineDspStore.getState().playLoop(Math.random().toString(), INTRO_PROGRAM)
      break
    }
  }

  const handleResumeClick = async () => {
    if (!audioContext) return
    if (didStartIntroExitRef.current) return
    await audioContext.resume()
    if (audioContext.state === 'running') {
      didStartIntroExitRef.current = true
      const deltaTime = performance.now() - animationIntroTimeRef.current
      const t1 = window.setTimeout(() => {
        setIsFadingOut(true)
        const t2 = window.setTimeout(() => {
          setIsFadingOut(false)
          setShowIntro(false)
        }, 2000)
      }, deltaTime < 700 ? (700 - deltaTime) + (3000 - 700) : 3000)
      void playIntroLoop()
    }
  }

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
    if (audioContext?.state !== 'running') return
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
    }, deltaTime < 700 ? (700 - deltaTime) + (3000 - 700) : 3000)
    void playIntroLoop()
    return () => window.clearTimeout(t1)
  }, [shouldWait, showIntro, audioContext])

  return (
    <RouterProvider>
      {showIntro && (
        <Intro
          isFadingIn={isFadingIn}
          isFadingOut={isFadingOut}
          audioContextState={audioContextState}
          onResumeClick={handleResumeClick}
        />
      )}
      <AppContent
        timelineWindowRef={timelineWindowRef}
        currentLoop={currentLoop}
        dspError={dspError}
        timelineHeader={timelineHeader}
        hasHydrated={hasHydrated}
        onDspError={setDspError}
        docsIsOpen={docsIsOpen}
        setDocsIsOpen={setDocsIsOpen}
        docsSelectedId={docsSelectedId}
        setDocsSelectedId={setDocsSelectedId}
      />
    </RouterProvider>
  )
}
