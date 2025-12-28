import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { LoopData } from '../../../deno/types.ts'
import type { Loop } from '../../engine/ui/loop.ts'
import { isLocalId } from '../../utils/id.ts'
import { useAppStore } from '../store.ts'

export function useLoopData(loopId: string | null, currentLoop: Loop | undefined) {
  const api = useAppStore(state => state.api)
  const base = useAppStore(state => (loopId ? state.bases[loopId]?.code : undefined))
  const publicLoopsCache = useAppStore(state => state.publicLoopsCache)
  const likedLoopsCache = useAppStore(state => state.likedLoopsCache)
  const getPublicLoopCode = useAppStore(state => state.getPublicLoopCode)
  const setLoopBase = useAppStore(state => state.setLoopBase)
  const getCodeFile = useAppStore(state => state.getCodeFile)
  const [loopData, setLoopData] = useState<LoopData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const setLoopLoading = useAppStore(state => state.setLoopLoading)
  const upsertServerLoopCache = useAppStore(state => state.upsertServerLoopCache)
  const didFetchIdRef = useRef<string | null>(null)
  const loopLoadingReqRef = useRef(0)

  const withLoading = useCallback((fn: () => Promise<void>) => {
    setIsLoading(true)
    fn().finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    loopLoadingReqRef.current++
    if (loopId == null) {
      didFetchIdRef.current = null
      setLoopData(null)
      setIsLoading(false)
      setLoopLoading(false)
      return
    }
    if (isLocalId(loopId)) {
      didFetchIdRef.current = loopId
      setLoopData(null)
      setIsLoading(false)
      setLoopLoading(false)
      return
    }

    const isPublicLoop = publicLoopsCache.some(l => l.id === loopId) || likedLoopsCache.some(l => l.id === loopId)
    if (isPublicLoop) {
      if (base != null || currentLoop?.data.code != null) {
        didFetchIdRef.current = loopId
        setLoopData(null)
        setIsLoading(false)
        return
      }
      if (didFetchIdRef.current === loopId) return
      didFetchIdRef.current = loopId

      const fetch = async () => {
        const code = await getPublicLoopCode(loopId)
        setLoopBase(loopId, code, currentLoop?.data.timestamp)
        const codeFile = getCodeFile(loopId, code)
        if (codeFile.value.length === 0 && code.length > 0) {
          codeFile.value = code
        }
      }

      withLoading(fetch)
      return
    }

    if (base != null || currentLoop?.data.code != null) {
      didFetchIdRef.current = loopId
      setLoopData(null)
      setIsLoading(false)
      return
    }
    if (didFetchIdRef.current === loopId) return
    didFetchIdRef.current = loopId

    const fetch = async () => {
      const data = await api.fetchLoopData(loopId)
      setLoopData(data)
      upsertServerLoopCache(data)
    }

    withLoading(fetch)
  }, [
    api,
    base,
    currentLoop?.data.code,
    currentLoop?.data.timestamp,
    getCodeFile,
    getPublicLoopCode,
    likedLoopsCache,
    loopId,
    publicLoopsCache,
    setLoopBase,
    upsertServerLoopCache,
    withLoading,
  ])

  useEffect(() => {
    const req = ++loopLoadingReqRef.current
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (loopLoadingReqRef.current !== req) return
        setLoopLoading(isLoading)
      })
    })
  }, [isLoading, setLoopLoading])

  const best = loopId && loopData?.id === loopId
    ? loopData
    : (currentLoop?.data ?? null)

  return { isLoading, loopData: best }
}
