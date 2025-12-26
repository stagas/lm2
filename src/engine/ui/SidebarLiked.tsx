import { useEffect } from 'react'
import { useAppStore } from '../../app/store.ts'
import { AuthForm } from './AuthForm.tsx'
import { SidebarBrowseList } from './SidebarBrowseList.tsx'

export function SidebarLiked() {
  const sessionData = useAppStore(state => state.sessionData)
  const api = useAppStore(state => state.api)
  const setSessionData = useAppStore(state => state.setSessionData)

  const loops = useAppStore(state => state.likedLoopsCache)
  const refreshLikedLoops = useAppStore(state => state.refreshLikedLoops)

  useEffect(() => {
    if (!sessionData) return
    void refreshLikedLoops()
  }, [refreshLikedLoops, sessionData?.user.id])

  if (!sessionData) {
    return (
      <div className="p-3 flex flex-col gap-2 border-b border-neutral-800">
        <AuthForm api={api} onSessionData={setSessionData} />
      </div>
    )
  }

  return <SidebarBrowseList loops={loops} emptyLabel="No liked loops yet." />
}


