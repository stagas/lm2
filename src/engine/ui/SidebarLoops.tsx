import { FilePlusIcon, GitBranchIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { LoopData } from '../../../deno/types.ts'
import { useSessionData } from '../../app/hooks/useSessionData.ts'
import { useAppStore } from '../../app/store.ts'
import { SpinnerSmall } from '../../components/Spinner.tsx'
import { isLocalId, makeLocalId, newId } from '../../utils/id.ts'
import { useEngineDspStore, useEngineRuntimeStore, useEngineUiStore } from '../store.ts'
import { AuthForm } from './AuthForm.tsx'
import { DEFAULT_LOOP_CODE, Loop } from './loop.ts'
import { LoopItem } from './LoopItem.tsx'
import { useRouter } from './router.tsx'

export function SidebarLoops(
  {
    scrollContainerRef,
    apiError,
    setApiError,
  }: {
    scrollContainerRef: preact.RefObject<HTMLDivElement | null>
    apiError: string | null
    setApiError: (error: string | null) => void
  },
) {
  const selectedLoopId = useAppStore(state => state.selectedLoopId)
  const [currentLoopId, setCurrentLoopId] = useState<string | null>(selectedLoopId)
  const [loops, setLoops] = useState<Loop[]>([])
  const [queuedPlay, setQueuedPlay] = useState<{ loopId: string } | null>(null)
  const scrollPosRef = useRef(0)
  const didInitialCenterRef = useRef(false)
  const didEnsureInitialLoopRef = useRef(false)

  const { isLoading: isSessionLoading, sessionData } = useSessionData()
  const hasHydrated = useAppStore(state => state.hasHydrated)
  const serverLoopsCache = useAppStore(state => state.serverLoopsCache)
  const serverLoopsUserId = useAppStore(state => state.serverLoopsUserId)
  const api = useAppStore(state => state.api)
  const setSessionData = useAppStore(state => state.setSessionData)
  const upsertServerLoopCache = useAppStore(state => state.upsertServerLoopCache)
  const optimisticUpsertBrowseLoop = useAppStore(state => state.optimisticUpsertBrowseLoop)
  const optimisticDeleteBrowseLoop = useAppStore(state => state.optimisticDeleteBrowseLoop)
  const invalidateBrowseCaches = useAppStore(state => state.invalidateBrowseCaches)
  const bumpLoopEpoch = useAppStore(state => state.bumpLoopEpoch)
  const isLoopEpochLatest = useAppStore(state => state.isLoopEpochLatest)
  const renameLoopEpoch = useAppStore(state => state.renameLoopEpoch)
  const getCodeFile = useAppStore(state => state.getCodeFile)
  const moveBuffer = useAppStore(state => state.moveBuffer)
  const dropBuffer = useAppStore(state => state.dropBuffer)
  const setLoopBase = useAppStore(state => state.setLoopBase)
  const bases = useAppStore(state => state.bases)
  const localLoops = useAppStore(state => state.localLoops)
  const addLocalLoop = useAppStore(state => state.addLocalLoop)
  const updateLocalLoop = useAppStore(state => state.updateLocalLoop)
  const removeLocalLoop = useAppStore(state => state.removeLocalLoop)
  const setSelectedLoopId = useAppStore(state => state.setSelectedLoopId)
  const playLoop = useEngineDspStore(state => state.playLoop)
  const pause = useEngineRuntimeStore(state => state.pause)
  const stop = useEngineRuntimeStore(state => state.stop)
  const { navigate } = useRouter()

  const serverLoops = useMemo(() => {
    if (sessionData) return sessionData.loops
    if (!isSessionLoading) return []
    if (serverLoopsUserId == null) return []
    return serverLoopsCache
  }, [isSessionLoading, serverLoopsCache, serverLoopsUserId, sessionData])

  useEffect(() => {
    setTimeout(() => {
      document.querySelector('textarea')?.focus({ preventScroll: true })
    }, 0)
  }, [currentLoopId])

  const stopIfPlaying = (loopId: string) => {
    const runtime = useEngineRuntimeStore.getState()
    if (runtime.playingLoopId !== loopId) return
    runtime.stop()
    runtime.setPlayingLoopId(null)
  }

  const pickFallbackLoopId = (closingId: string, preferFirst: boolean) => {
    const other = [
      ...loops.filter(loop => loop.isNew),
      ...loops.filter(loop => !loop.isNew).sort((a, b) => (b.data.timestamp ?? 0) - (a.data.timestamp ?? 0)),
    ].filter(loop => loop.data.id !== closingId)
    if (preferFirst) {
      return other[0]?.data.id ?? null
    }
    const untitled = other.find(loop => loop.isNew && loop.data.title.startsWith('Untitled'))
    if (untitled) return untitled.data.id
    const draft = other.find(loop => loop.isNew)
    if (draft) return draft.data.id
    return other[0]?.data.id ?? null
  }

  useLayoutEffect(() => {
    if (!hasHydrated) return
    setLoops(prev => {
      const prevById = new Map(prev.map(loop => [loop.data.id, loop]))
      const next: Loop[] = []
      const seen = new Set<string>()

      for (const data of localLoops) {
        const prevLoop = prevById.get(data.id)
        const codeFile = prevLoop?.codeFile ?? getCodeFile(data.id, data.code ?? '')
        next.push(new Loop({ ...prevLoop?.data, ...data }, codeFile))
        seen.add(data.id)
      }

      for (const data of serverLoops) {
        const prevLoop = prevById.get(data.id)
        const base = bases[data.id]?.code
        const code = data.code ?? base
        const dataWithCode = code != null ? { ...data, code } : data
        const codeFile = prevLoop?.codeFile ?? getCodeFile(data.id, code ?? '')
        if (prevLoop && code && codeFile.value.length === 0) {
          codeFile.value = code
        }
        if (!seen.has(data.id)) {
          const prevData = prevLoop?.data
          const prevTs = prevData?.timestamp ?? 0
          const nextTs = dataWithCode.timestamp ?? 0
          const merged = prevData && prevTs > nextTs
            ? { ...dataWithCode, ...prevData }
            : { ...prevData, ...dataWithCode }
          next.push(new Loop(merged, codeFile))
          seen.add(data.id)
        }
      }

      return next
    })
  }, [bases, hasHydrated, localLoops, serverLoops])

  useEffect(() => {
    if (currentLoopId != null) return
    const localIds = new Set(localLoops.map(l => l.id))
    const sessionIds = new Set(serverLoops.map(l => l.id))
    const has = (id: string | null | undefined) => id != null && (localIds.has(id) || sessionIds.has(id))
    const next = has(selectedLoopId) ? selectedLoopId : null
    if (next) setCurrentLoopId(next)
  }, [currentLoopId, localLoops, selectedLoopId, serverLoops])

  useEffect(() => {
    if (!currentLoopId) return
    if (loops.length === 0) return
    if (loops.some(loop => loop.data.id === currentLoopId)) return
    setCurrentLoopId(null)
    didInitialCenterRef.current = false
  }, [currentLoopId, loops])

  const currentLoop = useMemo(() => loops.find(loop => loop.data.id === currentLoopId), [loops, currentLoopId])
  const isLoopLoading = useAppStore(state => state.isLoopLoading)
  const loadingLoopId = isLoopLoading ? currentLoopId : null

  const handleLoopSelect = useCallback((loopId: string) => {
    setCurrentLoopId(loopId)
    // Navigate to /app/browse/loop/<id> for public, non-new loops
    const loop = loops.find(l => l.data.id === loopId)
    // if (loop && !loop.isNew && loop.data.isPublic) {
    //   navigate(`/app/browse/loop/${loopId}`)
    // }
  }, [loops, navigate])

  useLayoutEffect(() => {
    if (currentLoopId == null) return
    if (selectedLoopId === currentLoopId) return
    setSelectedLoopId(currentLoopId)
  }, [currentLoopId, selectedLoopId, setSelectedLoopId])

  useLayoutEffect(() => {
    if (!queuedPlay) return
    if (currentLoopId !== queuedPlay.loopId) return
    const loop = loops.find(loop => loop.data.id === queuedPlay.loopId)
    if (!loop) return
    const source = loop.codeFile.value
    setQueuedPlay(null)
    void playLoop(loop.data.id, source)
  }, [currentLoopId, loops, playLoop, queuedPlay])

  const preserveScrollPos = (callback: () => void) => {
    const container = scrollContainerRef.current
    if (container) {
      scrollPosRef.current = container.scrollTop
    }
    callback()
  }

  useEffect(() => {
    const container = scrollContainerRef.current
    if (container && scrollPosRef.current > 0) {
      container.scrollTop = scrollPosRef.current
    }
  }, [loops])

  useEffect(() => {
    if (isSessionLoading) return
    if (didInitialCenterRef.current) return
    if (!currentLoopId) return
    if (loops.length === 0) return
    const container = scrollContainerRef.current
    if (!container) return

    const nodes = container.querySelectorAll<HTMLElement>('[data-loop-id]')
    let target: HTMLElement | null = null
    for (const node of nodes) {
      if (node.dataset.loopId === currentLoopId) {
        target = node
        break
      }
    }
    if (!target) return

    didInitialCenterRef.current = true
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
  }, [isSessionLoading, currentLoopId, loops])

  const handleNewLoop = (excludeId?: string) => {
    let newLoopTitle = 'Untitled'
    let untitledCount = 0
    for (const loop of loops) {
      if (!loop.isNew) continue
      if (excludeId && loop.data.id === excludeId) continue
      if (loop.data.title.startsWith('Untitled')) {
        untitledCount = Math.max(untitledCount, parseInt(loop.data.title.split(' ').pop() || '0') || 1)
      }
    }
    if (untitledCount > 0) {
      newLoopTitle = `Untitled ${untitledCount + 1}`
    }

    const id = makeLocalId()
    const userName = sessionData?.user.name ?? 'local'
    const userId = sessionData?.user.id ?? 'local'
    const data: LoopData = {
      id,
      title: newLoopTitle,
      artist: userName,
      artistId: userId,
      code: DEFAULT_LOOP_CODE,
      likesCount: 0,
      commentsCount: 0,
      remixesCount: 0,
      isPublic: false,
      timestamp: 0,
    }

    const codeFile = getCodeFile(id, data.code ?? '')
    const loop = new Loop(data, codeFile)

    addLocalLoop(data)
    setLoops(prev => [loop, ...prev])
    setCurrentLoopId(id)
    setSelectedLoopId(id)
    didInitialCenterRef.current = false
  }

  const handleBranchLoop = useCallback(() => {
    if (!currentLoop) return

    const baseTitle = Number.isFinite(parseInt(currentLoop.data.title.split(' ').pop() || '0'))
      ? currentLoop.data.title.split(' ').slice(0, -1).join(' ')
      : currentLoop.data.title

    let count = 0
    for (const loop of loops) {
      if (loop.data.title.startsWith(baseTitle)) {
        count = Math.max(count, parseInt(loop.data.title.split(' ').pop() || '0') || 1)
      }
    }
    count = count + 1
    const title = `${baseTitle} ${count}`
    const id = makeLocalId()
    const userName = sessionData?.user.name ?? currentLoop.data.artist
    const userId = sessionData?.user.id ?? currentLoop.data.artistId
    const data: LoopData = { ...currentLoop.data, id, title, code: '', timestamp: 0, artist: userName,
      artistId: userId }

    const codeFile = getCodeFile(id, data.code ?? '')
    codeFile.setState(currentLoop.codeFile.getState())
    setLoopBase(id, data.code ?? '', 0)
    const loop = new Loop(data, codeFile)

    addLocalLoop(data)
    setLoops(prev => [loop, ...prev])
    setCurrentLoopId(id)
    setSelectedLoopId(id)
    didInitialCenterRef.current = false
  }, [addLocalLoop, currentLoop, getCodeFile, loops, sessionData?.user.id, sessionData?.user.name, setLoopBase,
    setSelectedLoopId])

  useEffect(() => {
    if (isSessionLoading) return
    if (!hasHydrated) return
    if (didEnsureInitialLoopRef.current) return
    if (localLoops.length > 0) return
    if (serverLoops.length > 0) return
    if (loops.length > 0) return
    didEnsureInitialLoopRef.current = true
    handleNewLoop()
  }, [hasHydrated, isSessionLoading, localLoops.length, serverLoops.length])

  const switchAwayFrom = (closingId: string, preferFirst: boolean) => {
    if (currentLoopId !== closingId && selectedLoopId !== closingId) return

    const nextId = pickFallbackLoopId(closingId, preferFirst)
    if (nextId) {
      setCurrentLoopId(nextId)
      setSelectedLoopId(nextId)
      didInitialCenterRef.current = false
      return
    }

    if (loops.length === 0) {
      handleNewLoop(closingId)
      return
    }

    setCurrentLoopId(null)
    setSelectedLoopId(null)
  }

  const handleSave = (loop: Loop, details: Partial<LoopData>) => {
    if (!sessionData) {
      alert('To save you first need to sign in')
      return
    }
    const title = details.title ?? loop.data.title
    const isPublic = (details.isPublic ?? loop.data.isPublic) ?? false
    const base = useAppStore.getState().getLoopBase(loop.data.id, loop.data.code ?? '')
    const prevIsPublic = loop.data.isPublic ?? false
    const isSameCode = loop.codeFile.value === base
    const isNoopSave = !isLocalId(loop.data.id)
      && title === loop.data.title
      && isPublic === prevIsPublic
      && isSameCode
    if (isNoopSave) return

    const timestamp = Date.now()

    preserveScrollPos(() => {
      setLoopBase(loop.data.id, loop.codeFile.value, timestamp)
      if (isLocalId(loop.data.id)) {
        updateLocalLoop(loop.data.id, {
          ...details,
          timestamp,
          code: loop.data.code ?? '',
        })
      }
      setLoops(prev =>
        prev.map(l =>
          l.data.id === loop.data.id
            ? new Loop({ ...loop.data, ...details, timestamp, isPublic, code: loop.codeFile.value }, loop.codeFile)
            : l
        )
      )

      if (sessionData && isLocalId(loop.data.id)) {
        const localId = loop.data.id
        const serverId = newId(6)
        const epoch = bumpLoopEpoch(localId)
        const state = loop.codeFile.getState()
        const code = state.value
        void (async () => {
          try {
            const remixOfId = loop.data.remixOf?.id
            optimisticUpsertBrowseLoop({
              ...loop.data,
              id: serverId,
              title,
              artist: sessionData.user.name,
              artistId: sessionData.user.id,
              code,
              isPublic,
              timestamp,
              ...(remixOfId ? { remixOfId } : {}),
            })
            invalidateBrowseCaches({ hot: true, best: true, liked: true })
            const res = await api.upsertLoop(serverId, {
              title,
              code,
              isPublic,
              epoch,
              ...(remixOfId ? { remixOfId } : {}),
            })
            if (!isLoopEpochLatest(localId, res.epoch)) return
            renameLoopEpoch(localId, serverId)
            moveBuffer(localId, serverId)
            const codeFile = loop.codeFile
            setLoopBase(serverId, code, timestamp)
            preserveScrollPos(() => {
              const runtime = useEngineRuntimeStore.getState()
              if (runtime.playingLoopId === localId) {
                useEngineUiStore.getState().renameLoopId(localId, serverId)
                runtime.setPlayingLoopId(serverId)
              }

              setLoops(prev =>
                prev.map(l =>
                  l.data.id === localId
                    ? new Loop({ ...l.data, id: serverId, title, isPublic, timestamp, code, remixOfId }, codeFile)
                    : l
                )
              )
              setCurrentLoopId(prev => prev === localId ? serverId : prev)
              setSelectedLoopId(serverId)
              didInitialCenterRef.current = false
            })
            upsertServerLoopCache({
              id: serverId,
              title,
              artist: sessionData.user.name,
              artistId: sessionData.user.id,
              code,
              likesCount: 0,
              commentsCount: 0,
              remixesCount: 0,
              remixOfId,
              isPublic,
              timestamp,
            })
            removeLocalLoop(localId)
          }
          catch (e) {
            if (!isLoopEpochLatest(localId, epoch)) return
            optimisticDeleteBrowseLoop(serverId)
            invalidateBrowseCaches({ public: true, hot: true, best: true, liked: true })
            setApiError(e instanceof Error ? e.message : String(e))
          }
        })()
      }
      else if (sessionData && !isLocalId(loop.data.id)) {
        const epoch = bumpLoopEpoch(loop.data.id)
        void (async () => {
          try {
            const remixOfId = loop.data.remixOf?.id
            upsertServerLoopCache({
              ...loop.data,
              title,
              artist: sessionData.user.name,
              artistId: sessionData.user.id,
              code: loop.codeFile.value,
              isPublic,
              timestamp,
              remixOfId,
            })
            optimisticUpsertBrowseLoop({
              ...loop.data,
              title,
              code: loop.codeFile.value,
              isPublic,
              timestamp,
              ...(remixOfId ? { remixOfId } : {}),
            })
            invalidateBrowseCaches({ hot: true, best: true, liked: true })
            const res = await api.upsertLoop(loop.data.id, {
              title,
              code: loop.codeFile.value,
              isPublic,
              epoch,
              ...(remixOfId ? { remixOfId } : {}),
            })
            if (!isLoopEpochLatest(loop.data.id, res.epoch)) return
            upsertServerLoopCache({
              ...loop.data,
              title,
              artist: sessionData.user.name,
              artistId: sessionData.user.id,
              code: loop.codeFile.value,
              isPublic,
              timestamp,
              remixOfId,
            })
          }
          catch (e) {
            if (!isLoopEpochLatest(loop.data.id, epoch)) return
            invalidateBrowseCaches({ public: true, hot: true, best: true, liked: true })
            setApiError(e instanceof Error ? e.message : String(e))
          }
        })()
      }
    })
  }
  const handleSaveAsNew = (loop: Loop, details: Partial<LoopData>) => {
    const state = loop.codeFile.getState()
    const title = details.title ?? loop.data.title
    const id = makeLocalId()
    const codeFile = getCodeFile(id, state.value)
    codeFile.setState(state)

    loop.codeFile.value = loop.data.code ?? ''

    const userName = sessionData?.user.name ?? loop.data.artist
    const userId = sessionData?.user.id ?? loop.data.artistId
    const timestamp = Date.now()
    const isPublic = loop.data.isPublic ?? false
    const newLoopData: LoopData = {
      ...loop.data,
      ...details,
      id,
      timestamp,
      code: '',
      artist: userName,
      artistId: userId,
      isPublic,
    }
    setLoopBase(id, state.value, timestamp)
    addLocalLoop(newLoopData)
    const newLoop = new Loop({ ...newLoopData, code: state.value }, codeFile)
    setCurrentLoopId(id)
    setSelectedLoopId(id)
    didInitialCenterRef.current = false
    setLoops(prev => [...prev, newLoop])

    if (sessionData) {
      const localId = id
      const serverId = newId(6)
      const epoch = bumpLoopEpoch(localId)
      const code = state.value
      void (async () => {
        try {
          optimisticUpsertBrowseLoop({
            ...loop.data,
            id: serverId,
            title,
            artist: sessionData.user.name,
            artistId: sessionData.user.id,
            code,
            isPublic,
            timestamp,
          })
          invalidateBrowseCaches({ hot: true, best: true, liked: true })
          const res = await api.upsertLoop(serverId, {
            title,
            code,
            isPublic,
            epoch,
          })
          if (!isLoopEpochLatest(localId, res.epoch)) return
          renameLoopEpoch(localId, serverId)
          moveBuffer(localId, serverId)
          const codeFile = newLoop.codeFile
          setLoopBase(serverId, code, timestamp)
          preserveScrollPos(() => {
            const runtime = useEngineRuntimeStore.getState()
            if (runtime.playingLoopId === localId) {
              useEngineUiStore.getState().renameLoopId(localId, serverId)
              runtime.setPlayingLoopId(serverId)
            }

            setLoops(prev =>
              prev.map(l =>
                l.data.id === localId
                  ? new Loop({ ...l.data, id: serverId, title, isPublic, timestamp, code }, codeFile)
                  : l
              )
            )
            setCurrentLoopId(prev => prev === localId ? serverId : prev)
            setSelectedLoopId(serverId)
            didInitialCenterRef.current = false
          })
          upsertServerLoopCache({
            id: serverId,
            title,
            artist: sessionData.user.name,
            artistId: sessionData.user.id,
            code,
            likesCount: 0,
            commentsCount: 0,
            remixesCount: 0,
            isPublic,
            timestamp,
          })
          removeLocalLoop(localId)
        }
        catch (e) {
          if (!isLoopEpochLatest(localId, epoch)) return
          optimisticDeleteBrowseLoop(serverId)
          invalidateBrowseCaches({ public: true, hot: true, best: true, liked: true })
          setApiError(e instanceof Error ? e.message : String(e))
        }
      })()
    }
  }
  const handleSaveAsRemix = (loop: Loop, details: Partial<LoopData>) => {
    const state = loop.codeFile.getState()
    const title = details.title ?? loop.data.title
    const id = makeLocalId()
    const codeFile = getCodeFile(id, state.value)
    codeFile.setState(state)

    loop.codeFile.value = loop.data.code ?? ''

    const userName = sessionData?.user.name ?? loop.data.artist
    const userId = sessionData?.user.id ?? loop.data.artistId
    const timestamp = Date.now()
    const remixOfId = loop.data.id
    const isPublic = loop.data.isPublic ?? false
    const newLoopData: LoopData = {
      ...loop.data,
      ...details,
      id,
      timestamp,
      code: '',
      artist: userName,
      artistId: userId,
      remixOfId,
      isPublic,
    }
    setLoopBase(id, state.value, timestamp)
    addLocalLoop(newLoopData)
    const newLoop = new Loop({ ...newLoopData, code: state.value }, codeFile)
    setCurrentLoopId(id)
    setSelectedLoopId(id)
    didInitialCenterRef.current = false
    setLoops(prev => [...prev, newLoop])

    if (sessionData) {
      const localId = id
      const serverId = newId(6)
      const epoch = bumpLoopEpoch(localId)
      const code = state.value
      void (async () => {
        try {
          optimisticUpsertBrowseLoop({
            ...loop.data,
            id: serverId,
            title,
            artist: sessionData.user.name,
            artistId: sessionData.user.id,
            code,
            isPublic,
            timestamp,
            remixOfId,
          })
          invalidateBrowseCaches({ hot: true, best: true, liked: true })
          const res = await api.upsertLoop(serverId, {
            title,
            code,
            isPublic,
            epoch,
            remixOfId,
          })
          if (!isLoopEpochLatest(localId, res.epoch)) return
          renameLoopEpoch(localId, serverId)
          moveBuffer(localId, serverId)
          const codeFile = newLoop.codeFile
          setLoopBase(serverId, code, timestamp)
          preserveScrollPos(() => {
            const runtime = useEngineRuntimeStore.getState()
            if (runtime.playingLoopId === localId) {
              useEngineUiStore.getState().renameLoopId(localId, serverId)
              runtime.setPlayingLoopId(serverId)
            }

            setLoops(prev =>
              prev.map(l =>
                l.data.id === localId
                  ? new Loop({ ...l.data, id: serverId, title, isPublic, timestamp, code, remixOfId }, codeFile)
                  : l
              )
            )
            setCurrentLoopId(prev => prev === localId ? serverId : prev)
            setSelectedLoopId(serverId)
            didInitialCenterRef.current = false
          })
          upsertServerLoopCache({
            id: serverId,
            title,
            artist: sessionData.user.name,
            artistId: sessionData.user.id,
            code,
            likesCount: 0,
            commentsCount: 0,
            remixesCount: 0,
            remixOfId,
            isPublic,
            timestamp,
          })
          removeLocalLoop(localId)
        }
        catch (e) {
          if (!isLoopEpochLatest(localId, epoch)) return
          optimisticDeleteBrowseLoop(serverId)
          invalidateBrowseCaches({ public: true, hot: true, best: true, liked: true })
          setApiError(e instanceof Error ? e.message : String(e))
        }
      })()
    }
  }
  const handleClose = (loop: Loop) => {
    const base = useAppStore.getState().getLoopBase(loop.data.id, loop.data.code ?? '')
    const isDirty = loop.codeFile.value !== base
    if (isDirty && !confirm('Are you sure? You will lose all your changes!')) return
    preserveScrollPos(() => {
      if (loop.isNew) {
        stopIfPlaying(loop.data.id)
        switchAwayFrom(loop.data.id, true)
        if (isLocalId(loop.data.id)) removeLocalLoop(loop.data.id)
        dropBuffer(loop.data.id)
        setLoops(prev => prev.filter(l => l.data.id !== loop.data.id))
      }
      else {
        loop.codeFile.value = useAppStore.getState().getLoopBase(loop.data.id, loop.data.code ?? '')
        setLoops(prev => [...prev])
      }
    })
  }
  const handleEditDetails = (loop: Loop, details: Partial<LoopData>) => {
    if (sessionData && !isLocalId(loop.data.id)) {
      handleSave(loop, details)
      return
    }
    preserveScrollPos(() => {
      if (isLocalId(loop.data.id)) {
        updateLocalLoop(loop.data.id, details)
      }
      setLoops(prev =>
        prev.map(l =>
          l.data.id === loop.data.id
            ? new Loop({ ...loop.data, ...details }, loop.codeFile)
            : l
        )
      )
    })
  }
  const handleDelete = (loop: Loop) => {
    if (!confirm(`Are you sure you want to delete "${loop.data.title}"?`)) return
    stopIfPlaying(loop.data.id)
    if (sessionData && !isLocalId(loop.data.id)) {
      const epoch = bumpLoopEpoch(loop.data.id)
      void (async () => {
        try {
          setSessionData({
            ...sessionData,
            loops: sessionData.loops.filter(l => l.id !== loop.data.id),
          })
          optimisticDeleteBrowseLoop(loop.data.id)
          invalidateBrowseCaches({ hot: true, best: true, liked: true })
          preserveScrollPos(() => {
            switchAwayFrom(loop.data.id, true)
            dropBuffer(loop.data.id)
            setLoops(prev => prev.filter(l => l.data.id !== loop.data.id))
          })
          const res = await api.deleteLoop(loop.data.id, epoch)
          if (!isLoopEpochLatest(loop.data.id, res.epoch)) return
          setSessionData(res.sessionData)
        }
        catch (e) {
          if (!isLoopEpochLatest(loop.data.id, epoch)) return
          invalidateBrowseCaches({ public: true, hot: true, best: true, liked: true })
          setApiError(e instanceof Error ? e.message : String(e))
        }
      })()
      return
    }

    preserveScrollPos(() => {
      switchAwayFrom(loop.data.id, true)
      if (isLocalId(loop.data.id)) removeLocalLoop(loop.data.id)
      dropBuffer(loop.data.id)
      setLoops(prev => prev.filter(l => l.data.id !== loop.data.id))
    })
  }
  return (
    <>
      <div className="flex flex-col w-full border-b-2 border-orange-600">
        <div className="flex flex-row h-[40px] bg-gradient-to-b from-black to-neutral-800 items-center justify-evenly">
          <button
            title="New"
            onPointerDown={() => handleNewLoop()}
            className="flex items-center justify-center w-full h-full text-neutral-500 hover:text-white"
          >
            <FilePlusIcon weight="regular" size={16} />
          </button>
          <button
            title="New from Current"
            onPointerDown={() => handleBranchLoop()}
            className="flex items-center justify-center w-full h-full text-neutral-500 hover:text-white"
          >
            <GitBranchIcon weight="regular" size={16} />
          </button>
        </div>
        {(() => {
          const newLoops = loops.filter(loop => loop.isNew)
          const untitledNew = newLoops.filter(loop => loop.data.title.startsWith('Untitled'))
          const lastUntitledId = untitledNew.length === 1
            ? untitledNew[0]!.data.id
            : null
          return newLoops.map(loop => (
            <LoopItem
              key={loop.data.id}
              loop={loop}
              isCurrent={currentLoopId === loop.data.id}
              isLoading={loadingLoopId === loop.data.id}
              onClick={() => handleLoopSelect(loop.data.id)}
              onPlay={() => {
                setQueuedPlay({ loopId: loop.data.id })
                setCurrentLoopId(loop.data.id)
              }}
              onPause={pause}
              onStop={stop}
              canSave={sessionData != null}
              hideCloseWhenNotDirty={loops.length === 1}
              onClose={() => handleClose(loop)}
              onEditDetails={details => handleEditDetails(loop, details)}
              onSave={details => handleSave(loop, details)}
              onSaveAsNew={details => handleSaveAsNew(loop, details)}
              onSaveAsRemix={details => handleSaveAsRemix(loop, details)}
            />
          ))
        })()}
      </div>
      <div className="flex flex-col w-full h-full">
        {isSessionLoading
          ? (
            <>
              {loops.some(loop => !loop.isNew)
                ? (
                  <>
                    {loops
                      .filter(loop => !loop.isNew)
                      .sort((a, b) => (b.data.timestamp ?? 0) - (a.data.timestamp ?? 0))
                      .map(loop => (
                        <LoopItem
                          key={loop.data.id}
                          loop={loop}
                          isCurrent={currentLoopId === loop.data.id}
                          onClick={() => handleLoopSelect(loop.data.id)}
                          onPlay={() => {
                            setQueuedPlay({ loopId: loop.data.id })
                            setCurrentLoopId(loop.data.id)
                          }}
                          onPause={pause}
                          onStop={stop}
                          canSave={false}
                          isLoading={loadingLoopId === loop.data.id}
                          onClose={() => handleClose(loop)}
                          onSaveAsNew={details => handleSaveAsNew(loop, details)}
                          onSaveAsRemix={details => handleSaveAsRemix(loop, details)}
                        />
                      ))}
                  </>
                )
                : (
                  <div className="w-full h-full flex items-center justify-center">
                    <SpinnerSmall />
                  </div>
                )}
            </>
          )
          : !sessionData
          ? (
            <>
              <div className="p-3 flex flex-col gap-2 border-b border-neutral-800">
                <AuthForm api={api} onSessionData={setSessionData} />
              </div>
            </>
          )
          : (
            <>
              {apiError && (
                <div className="px-3 py-2 text-xs text-orange-400 border-b border-neutral-800">
                  {apiError}
                </div>
              )}
              {loops.filter(loop => !loop.isNew).sort((a, b) => (b.data.timestamp ?? 0) - (a.data.timestamp ?? 0))
                .map(loop => (
                  <LoopItem
                    key={loop.data.id}
                    loop={loop}
                    isCurrent={currentLoopId === loop.data.id}
                    onClick={() => handleLoopSelect(loop.data.id)}
                    onPlay={() => {
                      setQueuedPlay({ loopId: loop.data.id })
                      setCurrentLoopId(loop.data.id)
                    }}
                    onPause={pause}
                    onStop={stop}
                    canSave={sessionData != null}
                    isLoading={loadingLoopId === loop.data.id}
                    onClose={() => handleClose(loop)}
                    onDelete={() => handleDelete(loop)}
                    onEditDetails={details => handleEditDetails(loop, details)}
                    onSave={details => handleSave(loop, details)}
                    onSaveAsNew={details => handleSaveAsNew(loop, details)}
                    onSaveAsRemix={details => handleSaveAsRemix(loop, details)}
                  />
                ))}
            </>
          )}
      </div>
    </>
  )
}
