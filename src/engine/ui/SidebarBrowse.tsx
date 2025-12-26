import { useEffect } from 'react'
import { useAppStore } from '../../app/store.ts'
import { SidebarBrowseList } from './SidebarBrowseList.tsx'

export function SidebarBrowse() {
  const loops = useAppStore(state => state.publicLoopsCache)
  const refreshPublicLoops = useAppStore(state => state.refreshPublicLoops)

  useEffect(() => {
    if (loops.length > 0) return
    void refreshPublicLoops()
  }, [loops.length, refreshPublicLoops])

  return <SidebarBrowseList loops={loops} emptyLabel="No public loops yet." />
}
