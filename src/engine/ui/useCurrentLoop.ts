import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks'
import type { LoopData } from '../../../deno/types.ts'
import { useLoopData } from '../../app/hooks/useLoopData.ts'
import { useSessionData } from '../../app/hooks/useSessionData.ts'
import { useAppStore } from '../../app/store.ts'
import { isLocalId, makeLocalId } from '../../utils/id.ts'
import { useEngineRuntimeStore } from '../store.ts'
import { DEFAULT_LOOP_CODE, Loop } from './loop.ts'

export function useCurrentLoop(): Loop | null {
  const { isLoading: isSessionLoading, sessionData } = useSessionData()

  const hasHydrated = useAppStore(state => state.hasHydrated)
  const serverLoopsCache = useAppStore(state => state.serverLoopsCache)
  const serverLoopsUserId = useAppStore(state => state.serverLoopsUserId)
  const publicLoopsCache = useAppStore(state => state.publicLoopsCache)
  const hotLoopsCache = useAppStore(state => state.hotLoopsCache)
  const bestLoopsCache = useAppStore(state => state.bestLoopsCache)
  const likedLoopsCache = useAppStore(state => state.likedLoopsCache)
  const bases = useAppStore(state => state.bases)

  const localLoops = useAppStore(state => state.localLoops)
  const addLocalLoop = useAppStore(state => state.addLocalLoop)
  const selectedLoopId = useAppStore(state => state.selectedLoopId)
  const setSelectedLoopId = useAppStore(state => state.setSelectedLoopId)
  const getCodeFile = useAppStore(state => state.getCodeFile)
  const getPublicLoopCode = useAppStore(state => state.getPublicLoopCode)
  const upsertPublicLoopCache = useAppStore(state => state.upsertPublicLoopCache)

  // When landing on /loop/<id>, prefer that loop immediately (before picking defaults).
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const pathname = window.location.pathname || '/'
    const match = pathname.match(/^\/loop\/([^/]+)$/)
    const id = match ? match[1] : null
    if (!id) return

    const state = useAppStore.getState()
    const hasLoop = state.localLoops.some(l => l.id === id)
      || state.serverLoopsCache.some(l => l.id === id)
      || state.publicLoopsCache.some(l => l.id === id)
      || state.hotLoopsCache.some(l => l.id === id)
      || state.bestLoopsCache.some(l => l.id === id)
      || state.likedLoopsCache.some(l => l.id === id)

    if (!hasLoop) {
      // Ensure the loop exists in the browse caches early so `currentLoop` can materialize immediately.
      // Code and metadata will be fetched via `useLoopData` once the loop is recognized as public.
      upsertPublicLoopCache({
        id,
        title: 'Loading…',
        artist: 'Unknown',
        artistId: 'unknown',
        code: undefined,
        likesCount: 0,
        commentsCount: 0,
        remixesCount: 0,
        isPublic: true,
        timestamp: 0,
      })
    }

    if (selectedLoopId === id) return
    setSelectedLoopId(id)
  }, [selectedLoopId, setSelectedLoopId, upsertPublicLoopCache])

  const serverLoops = useMemo(() => {
    if (sessionData) return sessionData.loops
    if (!isSessionLoading) return []
    if (serverLoopsUserId == null) return []
    return serverLoopsCache
  }, [isSessionLoading, serverLoopsCache, serverLoopsUserId, sessionData])

  const browseLoops = useMemo(() => {
    const seen = new Set<string>()
    const out: LoopData[] = []
    for (const l of likedLoopsCache) {
      if (seen.has(l.id)) continue
      seen.add(l.id)
      out.push(l)
    }
    for (const l of publicLoopsCache) {
      if (seen.has(l.id)) continue
      seen.add(l.id)
      out.push(l)
    }
    for (const l of hotLoopsCache) {
      if (seen.has(l.id)) continue
      seen.add(l.id)
      out.push(l)
    }
    for (const l of bestLoopsCache) {
      if (seen.has(l.id)) continue
      seen.add(l.id)
      out.push(l)
    }
    return out
  }, [bestLoopsCache, hotLoopsCache, likedLoopsCache, publicLoopsCache])

  const didEnsureInitialLoopRef = useRef(false)

  useEffect(() => {
    if (isSessionLoading) return
    if (!hasHydrated) return
    if (useAppStore.getState().selectedLoopId != null) return
    if (didEnsureInitialLoopRef.current) return
    if (localLoops.length > 0) return
    if (serverLoops.length > 0) return
    didEnsureInitialLoopRef.current = true

    const title = 'Untitled'
    const id = makeLocalId()
    const userName = sessionData?.user.name ?? 'local'
    const userId = sessionData?.user.id ?? 'local'
    const data: LoopData = {
      id,
      title,
      artist: userName,
      artistId: userId,
      code: DEFAULT_LOOP_CODE,
      likesCount: 0,
      commentsCount: 0,
      remixesCount: 0,
      isPublic: false,
      timestamp: 0,
    }
    getCodeFile(id, data.code ?? '')
    addLocalLoop(data)
    setSelectedLoopId(id)
  }, [
    addLocalLoop,
    getCodeFile,
    hasHydrated,
    isSessionLoading,
    localLoops.length,
    serverLoops.length,
    sessionData?.user.id,
    sessionData?.user.name,
    setSelectedLoopId,
  ])

  useEffect(() => {
    if (!hasHydrated) return
    if (selectedLoopId != null) return
    const first = localLoops[0]?.id ?? serverLoops[0]?.id ?? null
    if (first) setSelectedLoopId(first)
  }, [hasHydrated, localLoops, selectedLoopId, serverLoops, setSelectedLoopId])

  // Fetch loop data if selectedLoopId is set but not found in any cache
  useEffect(() => {
    if (!selectedLoopId) return
    if (!hasHydrated) return

    // Check if loop already exists in any cache
    const existsInLocal = localLoops.some(l => l.id === selectedLoopId)
    const existsInServer = serverLoops.some(l => l.id === selectedLoopId)
    const existsInBrowse = browseLoops.some(l => l.id === selectedLoopId)

    if (existsInLocal || existsInServer || existsInBrowse) return

    // If not found, try to fetch as public loop
    const fetchLoop = async () => {
      try {
        const code = await getPublicLoopCode(selectedLoopId)
        // If we get code, it means the loop exists and was fetched
        // The getPublicLoopCode function should populate the cache
      } catch (error) {
        console.warn(`Failed to fetch loop ${selectedLoopId}:`, error)
        // If the loop doesn't exist, create a placeholder local loop
        // so the user can still work with it
        const placeholderLoop: LoopData = {
          id: selectedLoopId,
          title: 'Loading...',
          artist: 'Unknown',
          artistId: 'unknown',
          code: '',
          likesCount: 0,
          commentsCount: 0,
          remixesCount: 0,
          isPublic: false,
          timestamp: 0,
        }
        addLocalLoop(placeholderLoop)
      }
    }

    fetchLoop()
  }, [
    selectedLoopId,
    hasHydrated,
    isSessionLoading,
    localLoops,
    serverLoops,
    browseLoops,
    getPublicLoopCode,
    addLocalLoop,
  ])

  const baseLoopData = useMemo((): LoopData | null => {
    if (!selectedLoopId) return null
    const local = localLoops.find(l => l.id === selectedLoopId)
    if (local) return local
    const server = serverLoops.find(l => l.id === selectedLoopId)
    if (server) {
      const base = bases[selectedLoopId]?.code
      const code = server.code ?? base
      if (code == null) return server
      return { ...server, code }
    }

    const pub = browseLoops.find(l => l.id === selectedLoopId)
    if (!pub) return null
    const base = bases[selectedLoopId]?.code
    const code = pub.code ?? base
    if (code == null) return pub
    return { ...pub, code }
  }, [bases, browseLoops, localLoops, selectedLoopId, serverLoops])

  const codeFile = useMemo(() => {
    if (!baseLoopData) return null
    return getCodeFile(baseLoopData.id, baseLoopData.code ?? '')
  }, [baseLoopData, getCodeFile])

  const baseLoop = useMemo(() => {
    if (!baseLoopData || !codeFile) return undefined
    return new Loop(baseLoopData, codeFile)
  }, [baseLoopData, codeFile])

  const { loopData } = useLoopData(selectedLoopId ?? null, baseLoop)

  const loop = useMemo(() => {
    if (!loopData || !codeFile) return null
    return new Loop(loopData, codeFile)
  }, [codeFile, loopData])

  const setCurrentLoop = useEngineRuntimeStore(state => state.setCurrentLoop)

  useLayoutEffect(() => {
    setCurrentLoop(loop)
  }, [loop, setCurrentLoop])

  useEffect(() => {
    if (!selectedLoopId) return
    if (!codeFile) return
    if (isLocalId(selectedLoopId)) return
    if (codeFile.value.length > 0) return
    const code = bases[selectedLoopId]?.code
    if (code == null || code.length === 0) return
    codeFile.value = code
  }, [bases, codeFile, selectedLoopId])

  return loop
}
