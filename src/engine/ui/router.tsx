import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type NavigateOptions = {
  replace?: boolean
}

type RouterValue = {
  pathname: string
  navigate: (to: string, opts?: NavigateOptions) => void
}

const RouterContext = createContext<RouterValue | null>(null)

const normalizeToPathname = (to: string) => {
  if (typeof window === 'undefined') return to.startsWith('/') ? to : `/${to}`
  try {
    const url = new URL(to, window.location.origin)
    const pathname = url.pathname || '/'
    return pathname === '' ? '/' : pathname
  }
  catch {
    const pathname = to.startsWith('/') ? to : `/${to}`
    return pathname === '' ? '/' : pathname
  }
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [pathname, setPathname] = useState(() => (typeof window === 'undefined' ? '/' : window.location.pathname || '/'))

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname || '/')
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to: string, opts?: NavigateOptions) => {
    const next = normalizeToPathname(to)
    const curr = window.location.pathname || '/'
    if (next === curr) return
    if (opts?.replace) window.history.replaceState(null, '', next)
    else window.history.pushState(null, '', next)
    setPathname(next)
  }, [])

  const value = useMemo(() => ({ pathname, navigate }), [navigate, pathname])

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter() {
  const value = useContext(RouterContext)
  if (!value) throw new Error('useRouter must be used within RouterProvider')
  return value
}


