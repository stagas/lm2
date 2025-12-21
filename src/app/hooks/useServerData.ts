import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SessionData } from '../../../deno/types.ts'
import { API } from '../api.ts'

export function useServerData(fetcher: typeof globalThis.fetch) {
  const api = useMemo(() => new API(fetcher), [fetcher])
  const [isLoading, setIsLoading] = useState(true)
  const [sessionData, setSessionData] = useState<SessionData | null>(null)

  const withLoading = useCallback((fn: () => Promise<void>) => {
    setIsLoading(true)
    fn().finally(() => setIsLoading(false))
  }, [])

  useEffect(() =>
    withLoading(async () => {
      const data = await api.fetchSessionData()
      setSessionData(data)
    }), [api])

  return { isLoading, sessionData }
}
