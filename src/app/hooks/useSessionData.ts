import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../store.ts'

export function useSessionData() {
  const api = useAppStore(state => state.api)
  const setSessionData = useAppStore(state => state.setSessionData)
  const [isLoading, setIsLoading] = useState(true)

  const withLoading = useCallback((fn: () => Promise<void>) => {
    setIsLoading(true)
    fn().finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    withLoading(async () => {
      try {
        const data = await api.fetchSessionData()
        setSessionData(data)
      }
      catch {
        setSessionData(null)
      }
    })
  }, [api, withLoading, setSessionData])

  return { isLoading, sessionData: useAppStore(state => state.sessionData) }
}
