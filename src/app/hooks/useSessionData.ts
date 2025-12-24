import { useEffect, useMemo } from 'react'
import { useAppStore } from '../store.ts'

export function useSessionData() {
  const api = useAppStore(state => state.api)
  const setSessionData = useAppStore(state => state.setSessionData)
  const sessionData = useAppStore(state => state.sessionData)
  const hasHydrated = useAppStore(state => state.hasHydrated)
  const sessionFetchState = useAppStore(state => state.sessionFetchState)
  const setSessionFetchState = useAppStore(state => state.setSessionFetchState)

  const isLoading = useMemo(() => {
    if (sessionFetchState !== 'loading') return false
    return sessionData == null
  }, [sessionData, sessionFetchState])

  useEffect(() => {
    if (!hasHydrated) return
    if (sessionFetchState !== 'idle') return

    setSessionFetchState('loading')

    void (async () => {
      try {
        const data = await api.fetchSessionData()
        setSessionData(data)
      }
      catch {
        // Keep any cached session data on network errors; server remains the source of truth.
      }
      finally {
        setSessionFetchState('done')
      }
    })()
  }, [api, hasHydrated, sessionFetchState, setSessionData, setSessionFetchState])

  return { isLoading, sessionData }
}
