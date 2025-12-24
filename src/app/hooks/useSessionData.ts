import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store.ts'

export function useSessionData() {
  const api = useAppStore(state => state.api)
  const setSessionData = useAppStore(state => state.setSessionData)
  const sessionData = useAppStore(state => state.sessionData)
  const hasHydrated = useAppStore(state => state.hasHydrated)

  const [isLoading, setIsLoading] = useState(false)
  const didFetchRef = useRef(false)

  useEffect(() => {
    if (!hasHydrated) return
    if (didFetchRef.current) return
    didFetchRef.current = true

    const shouldBlock = sessionData == null
    if (shouldBlock) setIsLoading(true)

    void (async () => {
      try {
        const data = await api.fetchSessionData()
        setSessionData(data)
      }
      catch {
        // Keep any cached session data on network errors; server remains the source of truth.
      }
      finally {
        if (shouldBlock) setIsLoading(false)
      }
    })()
  }, [api, hasHydrated, sessionData, setSessionData])

  return { isLoading, sessionData }
}
