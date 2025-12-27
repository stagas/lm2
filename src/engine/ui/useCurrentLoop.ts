import { useEffect, useMemo, useRef } from 'react'
import type { LoopData } from '../../../deno/types.ts'
import { useLoopData } from '../../app/hooks/useLoopData.ts'
import { useSessionData } from '../../app/hooks/useSessionData.ts'
import { useAppStore } from '../../app/store.ts'
import { isLocalId, makeLocalId } from '../../utils/id.ts'
import { useEngineRuntimeStore } from '../store.ts'
import { Loop } from './loop.ts'

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
      code: '',
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

  useEffect(() => {
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
