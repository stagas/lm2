import { useCallback, useEffect, useState } from 'react'
import type { LoopData } from '../../../deno/types.ts'
import type { Loop } from '../../engine/loop.ts'
import { useAppStore } from '../store.ts'

export function useLoopData(loopId: string | null, currentLoop: Loop | undefined) {
  const api = useAppStore(state => state.api)
  const [loopData, setLoopData] = useState<LoopData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const setLoopLoading = useAppStore(state => state.setLoopLoading)

  const withLoading = useCallback((fn: () => Promise<void>) => {
    setIsLoading(true)
    fn().finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (currentLoop?.data.code != null) return
    if (loopId == null) return
    withLoading(async () => {
      const data = await api.fetchLoopData(loopId)
      setLoopData(data)
    })
  }, [api, withLoading, loopId])

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setLoopLoading(isLoading)
      })
    })
  }, [isLoading, setLoopLoading])

  if (currentLoop?.data.code != null) return { isLoading: false, loopData: currentLoop.data }

  return { isLoading, loopData }
}
