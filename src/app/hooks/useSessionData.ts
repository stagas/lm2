import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store.ts'

export function useSessionData() {
  const api = useAppStore(state => state.api)
  const setSessionData = useAppStore(state => state.setSessionData)
  const sessionState = useAppStore(state => state.sessionState)
  const sessionData = useAppStore(state => state.sessionData)

  const shouldFetch = useMemo(() => {
    return sessionState === 'signedIn' && sessionData == null
  }, [sessionData, sessionState])

  const [isLoading, setIsLoading] = useState(shouldFetch)

  const withLoading = useCallback((fn: () => Promise<void>) => {
    setIsLoading(true)
    fn().finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (!shouldFetch) {
      setIsLoading(false)
      return
    }
    withLoading(async () => {
      try {
        const data = await api.fetchSessionData()
        setSessionData(data)
      }
      catch {
        // Keep any cached session data on network errors; server remains the source of truth.
      }
    })
  }, [api, shouldFetch, withLoading, setSessionData])

  return { isLoading, sessionData }
}
