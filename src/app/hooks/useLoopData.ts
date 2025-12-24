import { useCallback, useEffect, useRef, useState } from 'react'
import type { LoopData } from '../../../deno/types.ts'
import type { Loop } from '../../engine/ui/loop.ts'
import { useAppStore } from '../store.ts'

export function useLoopData(loopId: string | null, currentLoop: Loop | undefined) {
  const api = useAppStore(state => state.api)
  const base = useAppStore(state => (loopId ? state.bases[loopId]?.code : undefined))
  const [loopData, setLoopData] = useState<LoopData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const setLoopLoading = useAppStore(state => state.setLoopLoading)
  const upsertServerLoopCache = useAppStore(state => state.upsertServerLoopCache)
  const didFetchIdRef = useRef<string | null>(null)
  const isLocalId = (id: string) => id.startsWith('local:')

  const withLoading = useCallback((fn: () => Promise<void>) => {
    setIsLoading(true)
    fn().finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (loopId == null) {
      didFetchIdRef.current = null
      setLoopData(null)
      setIsLoading(false)
      return
    }
    if (isLocalId(loopId)) {
      didFetchIdRef.current = loopId
      setLoopData(null)
      setIsLoading(false)
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
  }, [api, base, currentLoop?.data.code, loopId, upsertServerLoopCache, withLoading])

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setLoopLoading(isLoading)
      })
    })
  }, [isLoading, setLoopLoading])

  const best = loopId && loopData?.id === loopId
    ? loopData
    : (currentLoop?.data ?? null)

  return { isLoading, loopData: best }
}
