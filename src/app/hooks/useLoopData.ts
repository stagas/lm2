import { useCallback, useEffect, useState } from 'react'
import type { LoopData } from '../../../deno/types.ts'
import { useAppStore } from '../store.ts'

export function useLoopData(loopId: string | null) {
  const api = useAppStore(state => state.api)
  const [loopData, setLoopData] = useState<LoopData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const withLoading = useCallback((fn: () => Promise<void>) => {
    setIsLoading(true)
    fn().finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (loopId == null) return
    withLoading(async () => {
      const data = await api.fetchLoopData(loopId)
      setLoopData(data)
    })
  }, [api, withLoading, loopId])

  return { isLoading, loopData }
}
