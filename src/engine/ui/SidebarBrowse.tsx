import { useEffect, useState } from 'react'
import { useAppStore } from '../../app/store.ts'
import { SidebarBrowseList } from './SidebarBrowseList.tsx'

export function SidebarBrowse() {
  const loops = useAppStore(state => state.publicLoopsCache)
  const refreshPublicLoops = useAppStore(state => state.refreshPublicLoops)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (loops.length > 0) return
    setIsLoading(true)
    void refreshPublicLoops().finally(() => setIsLoading(false))
  }, [loops.length, refreshPublicLoops])

  return <SidebarBrowseList loops={loops} emptyLabel="No public loops yet." isLoading={isLoading} />
}
