import {
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  ArticleIcon,
  CheckIcon,
  FilePlusIcon,
  FloppyDiskBackIcon,
  GearSixIcon,
  GlobeIcon,
  HeartIcon,
  LockIcon,
  PencilIcon,
  PlayIcon as PlayIconPhosphor,
  TrashIcon,
  WaveformIcon,
  XIcon,
} from '@phosphor-icons/react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { LoopData } from '../../deno/types.ts'
import { useLoopData } from '../app/hooks/useLoopData.ts'
import { useSessionData } from '../app/hooks/useSessionData.ts'
import { useAppStore } from '../app/store.ts'
import { Spinner } from '../components/Spinner.tsx'
import { Loop } from './loop.ts'
import { useEngineStore } from './store.ts'
import { useCodeFileValue } from './useCodeFileValue.ts'

type SidebarTab = 'loops' | 'liked' | 'browse' | 'compiled' | 'settings'

const SidebarTabIcon: Record<SidebarTab, React.ReactNode> = {
  loops: <WaveformIcon weight="regular" size={16} />,
  liked: <HeartIcon weight="regular" size={16} />,
  browse: <GlobeIcon weight="regular" size={16} />,
  compiled: <ArticleIcon weight="regular" size={16} />,
  settings: <GearSixIcon weight="regular" size={16} />,
}

const LoopItemButton = (
  {
    icon,
    title,
    onClick,
    className,
  }: {
    icon: React.ReactNode
    title: string
    onClick: (() => void) | undefined
    className?: string
  },
) => (
  <button title={title}
    className={`p-1 bg-gradient-to-br from-neutral-300 to-neutral-500 rounded-md text-black hover:from-neutral-200 hover:to-neutral-400 ${
      className ?? ''
    }`} onPointerDown={e => {
    e.stopPropagation()
    onClick?.()
  }}>
    {icon}
  </button>
)

const LoopItem = ({
  loop,
  isCurrent,
  onClick,
  onSave,
  onSaveAsNew,
  onEditDetails,
  onDelete,
  onClose,
}: {
  loop: Loop
  isCurrent: boolean
  onClick: () => void
  onSave?: (details: Partial<LoopData>) => void
  onSaveAsNew?: (details: Partial<LoopData>) => void
  onEditDetails?: (details: Partial<LoopData>) => void
  onDelete?: () => void
  onClose?: () => void
}) => {
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loopTitle, setLoopTitle] = useState(loop.data.title)
  const code = useCodeFileValue(loop.codeFile)
  const playLoop = useEngineStore(state => state.playLoop)
  const playingLoopId = useEngineStore(state => state.playingLoopId)
  const playbackState = useEngineStore(state => state.playbackState)
  const base = useAppStore(state => state.bases[loop.data.id])
  const baseCode = base?.code ?? loop.data.code
  const canCompare = loop.data.code != null || base?.ts != null
  const isDirty = canCompare && baseCode != null && code !== baseCode
  const isPlaying = playbackState === 'running' && playingLoopId === loop.data.id

  const handleStartEditingDetails = () => {
    setIsEditingDetails(true)
  }

  const handleEditDetails = () => {
    setIsEditingDetails(false)
    onEditDetails?.({ title: loopTitle })
  }

  const handleTogglePublic = () => {
    onEditDetails?.({ isPublic: !loop.data.isPublic })
  }

  const handleStartSaving = () => {
    setIsEditingDetails(true)
    setIsSaving(true)
  }

  const handleSave = () => {
    setIsEditingDetails(false)
    setIsSaving(false)
    onSave?.({ title: loopTitle })
  }

  const handleSaveAsNew = () => {
    setIsEditingDetails(false)
    setIsSaving(false)
    setLoopTitle(loop.data.title)
    onSaveAsNew?.({ title: loopTitle })
  }

  useEffect(() => {
    setLoopTitle(loop.data.title)
  }, [loop.data.title])

  useEffect(() => {
    if (isEditingDetails) {
    }
  }, [isEditingDetails])

  return (
    <div
      key={loop.data.id}
      data-loop-id={loop.data.id}
      className={`
      select-none cursor-pointer
      text-sm flex flex-row items-center justify-between gap-2 px-1 w-full flex-shrink-0
      group
      bg-gradient-to-b
      ${
        isCurrent
          ? 'from-neutral-500 to-neutral-800'
          : 'from-black to-neutral-800 hover:from-neutral-700 hover:to-neutral-900'
      }
    `}
      onPointerDown={onClick}
    >
      <div className="flex flex-1 min-w-0 w-0 flex-row items-center gap-2 leading-tight overflow-hidden">
        {isEditingDetails
          ? (
            <div className="flex flex-1 pr-2 min-w-0 w-0 flex-row items-center gap-2 leading-tight overflow-hidden">
              <input
                ref={el => {
                  setTimeout(() => {
                    el?.focus()
                  })
                }}
                className="flex flex-1 bg-gradient-to-b from-black to-neutral-700 outline-none py-1.5 my-0.5 px-2 text-white"
                type="text"
                value={loopTitle}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setLoopTitle(loop.data.title)
                    setIsEditingDetails(false)
                    setIsSaving(false)
                  }
                  else if (e.key === 'Enter') {
                    if (isSaving) {
                      handleSave()
                    }
                    else {
                      handleEditDetails()
                    }
                  }
                }}
                onChange={e => setLoopTitle(e.target.value)}
              />
              {!loop.isNew && !isDirty && (
                <LoopItemButton title="Delete" icon={<TrashIcon weight="regular" size={16} />} onClick={onDelete} />
              )}
              {isSaving
                ? (
                  <>
                    {!loop.isNew && (
                      <LoopItemButton title="Save as New" icon={<FilePlusIcon weight="regular" size={16} />}
                        onClick={handleSaveAsNew} />
                    )}
                    <LoopItemButton title="Save" icon={<CheckIcon weight="regular" size={16} />} onClick={handleSave} />
                  </>
                )
                : (
                  <LoopItemButton title="Done" icon={<CheckIcon weight="regular" size={16} />}
                    onClick={handleEditDetails} />
                )}
              <LoopItemButton title={loop.data.isPublic ? 'Public' : 'Private'} icon={loop.data.isPublic
                ? <GlobeIcon weight="regular" size={16} />
                : <LockIcon weight="regular" size={16} />} onClick={handleTogglePublic} />
            </div>
          )
          : (
            <div className="py-2 px-2 truncate flex-1 flex items-center gap-2 flex-row min-w-0">
              {!loop.isNew && !loop.data.isPublic && (
                <div className="text-neutral-500">
                  <LockIcon weight="regular" size={16} />
                </div>
              )}
              {isDirty && (
                <div
                  title="Has unsaved changes"
                  className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"
                />
              )}
              <div className="truncate">{loopTitle}</div>
            </div>
          )}
      </div>
      {!isEditingDetails && (onEditDetails || isPlaying) && (
        <div
          className={`shrink-0 pr-2 flex flex-row items-center gap-2 ${
            isPlaying || isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <div
            className={`flex flex-row items-center gap-2 ${isPlaying && !isCurrent ? 'hidden group-hover:flex' : ''}`}
          >
            {!isDirty && (
              <LoopItemButton title="Edit" icon={<PencilIcon weight="regular" size={16} />}
                onClick={handleStartEditingDetails} />
            )}
            {(isDirty || loop.isNew) && (
              <LoopItemButton title={!loop.isNew ? 'Discard changes' : 'Close'}
                icon={<XIcon weight="regular" size={16} />} onClick={onClose} />
            )}
            {isDirty && (
              <LoopItemButton title="Save" icon={<FloppyDiskBackIcon weight="regular" size={16} />}
                onClick={handleStartSaving} />
            )}
          </div>
          <LoopItemButton
            title="Play"
            className={isPlaying ? 'text-orange-600' : undefined}
            icon={<PlayIconPhosphor weight={isPlaying ? 'fill' : 'regular'} size={16} />}
            onClick={() => {
              onClick()
              void playLoop(loop.data.id, loop.codeFile.value)
            }}
          />
        </div>
      )}
    </div>
  )
}

export function Sidebar({ onLoopChange }: { onLoopChange: (loop: Loop) => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('loops')
  const [currentLoopId, setCurrentLoopId] = useState<string | null>(null)
  const [loops, setLoops] = useState<Loop[]>([])
  const [authName, setAuthName] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authError, setAuthError] = useState<string | null>(null)
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollPosRef = useRef(0)
  const didInitialCenterRef = useRef(false)

  const { isLoading: isSessionLoading, sessionData } = useSessionData()
  const api = useAppStore(state => state.api)
  const setSessionData = useAppStore(state => state.setSessionData)
  const getCodeFile = useAppStore(state => state.getCodeFile)
  const dropBuffer = useAppStore(state => state.dropBuffer)
  const setLoopBase = useAppStore(state => state.setLoopBase)
  const localLoops = useAppStore(state => state.localLoops)
  const buffers = useAppStore(state => state.buffers)
  const bases = useAppStore(state => state.bases)
  const addLocalLoop = useAppStore(state => state.addLocalLoop)
  const updateLocalLoop = useAppStore(state => state.updateLocalLoop)
  const removeLocalLoop = useAppStore(state => state.removeLocalLoop)
  const selectedLoopId = useAppStore(state => state.selectedLoopId)
  const setSelectedLoopId = useAppStore(state => state.setSelectedLoopId)
  const preloadSamples = useEngineStore(state => state.preloadSamples)

  const isLocalId = (id: string) => id.startsWith('local:')

  const makeLocalId = (title: string) => {
    const suffix = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
    return `local:${title}:${Date.now()}:${suffix}`
  }

  const makeServerId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)

  useEffect(() => {
    if (sessionData) {
      for (const data of sessionData.loops) {
        const base = data.code
        if (base != null) {
          setLoopBase(data.id, base, data.timestamp)
        }
      }
    }
    setLoops(prev => {
      const prevById = new Map(prev.map(loop => [loop.data.id, loop]))
      const next: Loop[] = []
      const seen = new Set<string>()

      for (const data of localLoops) {
        const prevLoop = prevById.get(data.id)
        const codeFile = prevLoop?.codeFile ?? getCodeFile(data.id, data.code ?? '')
        next.push(new Loop({ ...prevLoop?.data, ...data }, codeFile))
        seen.add(data.id)
      }

      if (sessionData) {
        for (const data of sessionData.loops) {
          const prevLoop = prevById.get(data.id)
          const codeFile = prevLoop?.codeFile ?? getCodeFile(data.id, data.code ?? '')
          if (!seen.has(data.id)) {
            next.push(new Loop({ ...prevLoop?.data, ...data }, codeFile))
            seen.add(data.id)
          }
        }
      }

      for (const id of Object.keys(buffers)) {
        if (!sessionData && !isLocalId(id)) continue
        if (seen.has(id)) continue
        if (selectedLoopId !== id && bases[id]?.ts == null) continue
        const prevLoop = prevById.get(id)
        const codeFile = prevLoop?.codeFile ?? getCodeFile(id, buffers[id]?.value ?? '')
        const title = isLocalId(id) ? (id.split(':')[1] || id) : id
        next.push(new Loop({
          id,
          title,
          artist: '',
          artistId: '',
          likesCount: 0,
          commentsCount: 0,
          isPublic: false,
          timestamp: bases[id]?.ts ?? 1,
        }, codeFile))
        seen.add(id)
      }

      if (selectedLoopId && !seen.has(selectedLoopId)) {
        if (!sessionData && !isLocalId(selectedLoopId)) return next
        const prevLoop = prevById.get(selectedLoopId)
        const codeFile = prevLoop?.codeFile ?? getCodeFile(selectedLoopId, buffers[selectedLoopId]?.value ?? '')
        const title = isLocalId(selectedLoopId) ? (selectedLoopId.split(':')[1] || selectedLoopId) : selectedLoopId
        next.push(new Loop({
          id: selectedLoopId,
          title,
          artist: '',
          artistId: '',
          likesCount: 0,
          commentsCount: 0,
          isPublic: false,
          timestamp: bases[selectedLoopId]?.ts ?? 1,
        }, codeFile))
      }

      return next
    })
  }, [bases, buffers, getCodeFile, localLoops, selectedLoopId, sessionData, setLoopBase])

  useEffect(() => {
    if (currentLoopId != null) return
    const first = selectedLoopId ?? localLoops[0]?.id ?? sessionData?.loops[0]?.id
    if (first) setCurrentLoopId(first)
  }, [currentLoopId, localLoops, selectedLoopId, sessionData])

  const currentLoop = useMemo(() => loops.find(loop => loop.data.id === currentLoopId), [loops, currentLoopId])

  const { isLoading: isLoopLoading, loopData } = useLoopData(currentLoopId, currentLoop)

  useEffect(() => {
    if (loopData) {
      if (currentLoop?.data === loopData) return
      const serverCode = loopData.code ?? ''
      if (loopData.code != null) setLoopBase(loopData.id, serverCode, loopData.timestamp)
      const codeFile = currentLoop?.codeFile
      if (codeFile) {
        const hasUserEdits = codeFile.value.length > 0
        if (!hasUserEdits && serverCode.length > 0) {
          codeFile.value = serverCode
        }
      }

      setLoops(prev =>
        prev.map(loop => loop.data.id !== loopData.id ? loop : new Loop({ ...loop.data, ...loopData }, loop.codeFile))
      )
    }
  }, [loopData])

  useLayoutEffect(() => {
    if (!currentLoop) return
    onLoopChange(currentLoop)
    preloadSamples(currentLoop.codeFile.value)
  }, [currentLoopId, currentLoop, onLoopChange, preloadSamples])

  useLayoutEffect(() => {
    if (currentLoopId == null) return
    if (selectedLoopId === currentLoopId) return
    setSelectedLoopId(currentLoopId)
  }, [currentLoopId, selectedLoopId, setSelectedLoopId])

  const preserveScrollPos = (callback: () => void) => {
    const container = scrollContainerRef.current
    if (container) {
      scrollPosRef.current = container.scrollTop
    }
    callback()
  }

  useEffect(() => {
    const container = scrollContainerRef.current
    if (container && scrollPosRef.current > 0) {
      container.scrollTop = scrollPosRef.current
    }
  }, [loops])

  useEffect(() => {
    if (isSessionLoading) return
    if (didInitialCenterRef.current) return
    if (!currentLoopId) return
    if (loops.length === 0) return
    const container = scrollContainerRef.current
    if (!container) return

    const nodes = container.querySelectorAll<HTMLElement>('[data-loop-id]')
    let target: HTMLElement | null = null
    for (const node of nodes) {
      if (node.dataset.loopId === currentLoopId) {
        target = node
        break
      }
    }
    if (!target) return

    didInitialCenterRef.current = true
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
  }, [isSessionLoading, currentLoopId, loops])

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleNewLoop = () => {
    let newLoopTitle = 'Untitled'
    let untitledCount = 0
    for (const loop of loops) {
      if (loop.data.title.startsWith('Untitled')) {
        untitledCount = Math.max(untitledCount, parseInt(loop.data.title.split(' ').pop() || '0') || 1)
      }
    }
    if (untitledCount > 0) {
      newLoopTitle = `Untitled ${untitledCount + 1}`
    }

    const id = makeLocalId(newLoopTitle)
    const userName = sessionData?.user.name ?? 'local'
    const userId = sessionData?.user.id ?? 'local'
    const data: LoopData = {
      id,
      title: newLoopTitle,
      artist: userName,
      artistId: userId,
      code: '',
      likesCount: 0,
      commentsCount: 0,
      isPublic: false,
      timestamp: 0,
    }

    const codeFile = getCodeFile(id, data.code ?? '')
    const loop = new Loop(data, codeFile)

    addLocalLoop(data)
    setLoops(prev => [loop, ...prev])
    setCurrentLoopId(id)
    setSelectedLoopId(id)
    didInitialCenterRef.current = false
  }

  const handleSave = (loop: Loop, details: Partial<LoopData>) => {
    preserveScrollPos(() => {
      const timestamp = Date.now()
      const title = details.title ?? loop.data.title
      const isPublic = (details.isPublic ?? loop.data.isPublic) ?? false
      setLoopBase(loop.data.id, loop.codeFile.value, timestamp)
      if (isLocalId(loop.data.id)) {
        updateLocalLoop(loop.data.id, {
          ...details,
          timestamp,
          code: loop.data.code ?? '',
        })
      }
      setLoops(prev =>
        prev.map(l =>
          l.data.id === loop.data.id
            ? new Loop({ ...loop.data, ...details, timestamp, isPublic, code: loop.codeFile.value }, loop.codeFile)
            : l
        )
      )

      if (sessionData && isLocalId(loop.data.id)) {
        const localId = loop.data.id
        const serverId = makeServerId()
        const state = loop.codeFile.getState()
        const code = state.value
        void (async () => {
          try {
            const next = await api.upsertLoop(serverId, {
              title,
              code,
              isPublic,
              timestamp,
            })
            const codeFile = getCodeFile(serverId, state.value)
            codeFile.setState(state)
            setLoopBase(serverId, code, timestamp)
            removeLocalLoop(localId)
            dropBuffer(localId)
            setCurrentLoopId(prev => prev === localId ? serverId : prev)
            setSelectedLoopId(serverId)
            setSessionData(next)
          }
          catch (e) {
            setAuthError(e instanceof Error ? e.message : String(e))
          }
        })()
      }
      else if (sessionData && !isLocalId(loop.data.id)) {
        void (async () => {
          try {
            const next = await api.upsertLoop(loop.data.id, {
              title,
              code: loop.codeFile.value,
              isPublic,
              timestamp,
            })
            setSessionData(next)
          }
          catch (e) {
            setAuthError(e instanceof Error ? e.message : String(e))
          }
        })()
      }
    })
  }
  const handleSaveAsNew = (loop: Loop, details: Partial<LoopData>) => {
    const state = loop.codeFile.getState()
    const title = details.title ?? loop.data.title
    const id = makeLocalId(title)
    const codeFile = getCodeFile(id, state.value)
    codeFile.setState(state)

    loop.codeFile.value = loop.data.code ?? ''

    const userName = sessionData?.user.name ?? loop.data.artist
    const userId = sessionData?.user.id ?? loop.data.artistId
    const newLoopData: LoopData = {
      ...loop.data,
      ...details,
      id,
      timestamp: 0,
      code: '',
      artist: userName,
      artistId: userId,
    }
    setLoopBase(id, state.value, 0)
    addLocalLoop(newLoopData)
    const newLoop = new Loop({ ...newLoopData, code: state.value }, codeFile)
    setCurrentLoopId(id)
    setSelectedLoopId(id)
    didInitialCenterRef.current = false
    setLoops(prev => [...prev, newLoop])
  }
  const handleClose = (loop: Loop) => {
    const base = useAppStore.getState().getLoopBase(loop.data.id, loop.data.code ?? '')
    const isDirty = loop.codeFile.value !== base
    if (isDirty && !confirm('Are you sure? You will lose all your changes!')) return
    preserveScrollPos(() => {
      if (loop.isNew) {
        if (isLocalId(loop.data.id)) removeLocalLoop(loop.data.id)
        dropBuffer(loop.data.id)
        setLoops(prev => prev.filter(l => l.data.id !== loop.data.id))
      }
      else {
        loop.codeFile.value = useAppStore.getState().getLoopBase(loop.data.id, loop.data.code ?? '')
        setLoops(prev => [...prev])
      }
    })
  }
  const handleEditDetails = (loop: Loop, details: Partial<LoopData>) => {
    if (sessionData && !isLocalId(loop.data.id)) {
      handleSave(loop, details)
      return
    }
    preserveScrollPos(() => {
      if (isLocalId(loop.data.id)) {
        updateLocalLoop(loop.data.id, details)
      }
      setLoops(prev =>
        prev.map(l =>
          l.data.id === loop.data.id
            ? new Loop({ ...loop.data, ...details }, loop.codeFile)
            : l
        )
      )
    })
  }
  const handleDelete = (loop: Loop) => {
    if (!confirm(`Are you sure you want to delete "${loop.data.title}"?`)) return
    if (sessionData && !isLocalId(loop.data.id)) {
      void (async () => {
        try {
          const next = await api.deleteLoop(loop.data.id)
          setSessionData(next)
          preserveScrollPos(() => {
            dropBuffer(loop.data.id)
            setLoops(prev => prev.filter(l => l.data.id !== loop.data.id))
          })
        }
        catch (e) {
          setAuthError(e instanceof Error ? e.message : String(e))
        }
      })()
      return
    }

    preserveScrollPos(() => {
      if (isLocalId(loop.data.id)) removeLocalLoop(loop.data.id)
      dropBuffer(loop.data.id)
      setLoops(prev => prev.filter(l => l.data.id !== loop.data.id))
    })
  }
  return (
    <div className={`z-10 relative h-full min-w-0 ${sidebarOpen ? 'w-[40ch]' : 'w-0'}`}>
      {sidebarOpen && (
        <div className="flex flex-col w-full h-full">
          <div className="h-[40px] bg-black flex shrink-0">
            {Object.entries(SidebarTabIcon).map(([tab, icon]) => (
              <button
                key={tab}
                title={tab}
                onPointerDown={() => setSidebarTab(tab as SidebarTab)}
                className={`flex-1 font-semibold text-xs flex items-center justify-center gap-2 ${
                  sidebarTab === tab
                    ? 'bg-black text-white'
                    : 'bg-gradient-to-b from-black to-neutral-800 text-[#888] hover:text-white'
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-col w-full h-full overflow-y-auto" ref={scrollContainerRef}>
            {sidebarTab === 'loops' && (
              <>
                <div className="flex flex-col w-full border-b-2 border-orange-600">
                  <LoopItem key="<new>" loop={new Loop({
                    id: '<new>',
                    title: '<new>',
                    artist: 'stagas',
                    artistId: 'stagas',
                    code: '',
                    likesCount: 0,
                    commentsCount: 0,
                    isPublic: false,
                    timestamp: 0,
                  })} isCurrent={false} onClick={() => handleNewLoop()} />
                  {loops.filter(loop => loop.isNew).map(loop => (
                    <LoopItem
                      key={loop.data.id}
                      loop={loop}
                      isCurrent={currentLoopId === loop.data.id}
                      onClick={() => setCurrentLoopId(loop.data.id)}
                      onClose={() => handleClose(loop)}
                      onEditDetails={details => handleEditDetails(loop, details)}
                      onSave={details => handleSave(loop, details)}
                      onSaveAsNew={details => handleSaveAsNew(loop, details)}
                    />
                  ))}
                </div>
                <div className="flex flex-col w-full h-full">
                  {isSessionLoading
                    ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-4 h-4">
                          <Spinner />
                        </div>
                      </div>
                    )
                    : !sessionData
                    ? (
                      <>
                        <div className="p-3 flex flex-col gap-2 border-b border-neutral-800">
                          <div className="text-sm text-neutral-300">Sign in to load your loops.</div>
                          <div className="flex flex-row gap-2">
                            <button
                              className={`flex-1 text-xs font-semibold py-2 ${
                                authMode === 'login' ? 'bg-orange-600 text-black' : 'bg-neutral-800 text-neutral-200'
                              }`}
                              onPointerDown={() => setAuthMode('login')}
                            >
                              Login
                            </button>
                            <button
                              className={`flex-1 text-xs font-semibold py-2 ${
                                authMode === 'register' ? 'bg-orange-600 text-black' : 'bg-neutral-800 text-neutral-200'
                              }`}
                              onPointerDown={() => setAuthMode('register')}
                            >
                              Register
                            </button>
                          </div>
                          <input
                            className="bg-black text-white outline-none px-2 py-2 text-sm"
                            placeholder="name"
                            value={authName}
                            onChange={e => setAuthName(e.target.value)}
                          />
                          <input
                            className="bg-black text-white outline-none px-2 py-2 text-sm"
                            placeholder="password"
                            type="password"
                            value={authPassword}
                            onChange={e => setAuthPassword(e.target.value)}
                          />
                          {authError && <div className="text-xs text-orange-400">{authError}</div>}
                          <button
                            className="bg-gradient-to-br from-neutral-300 to-neutral-500 text-black font-semibold py-2 text-sm disabled:opacity-50"
                            disabled={isAuthBusy || authName.length === 0 || authPassword.length === 0}
                            onPointerDown={() => {
                              setIsAuthBusy(true)
                              setAuthError(null)
                              void (async () => {
                                try {
                                  const next = authMode === 'login'
                                    ? await api.login(authName, authPassword)
                                    : await api.register(authName, authPassword)
                                  setSessionData(next)
                                  setAuthPassword('')
                                }
                                catch (e) {
                                  setAuthError(e instanceof Error ? e.message : String(e))
                                }
                                finally {
                                  setIsAuthBusy(false)
                                }
                              })()
                            }}
                          >
                            {isAuthBusy ? '...' : authMode === 'login' ? 'Login' : 'Register'}
                          </button>
                        </div>
                        {loops.filter(loop => !loop.isNew).sort((a, b) =>
                          (b.data.timestamp ?? 0) - (a.data.timestamp ?? 0)
                        )
                          .map(loop => (
                            <LoopItem
                              key={loop.data.id}
                              loop={loop}
                              isCurrent={currentLoopId === loop.data.id}
                              onClick={() => setCurrentLoopId(loop.data.id)}
                              onClose={() => handleClose(loop)}
                              onDelete={() => handleDelete(loop)}
                              onEditDetails={details => handleEditDetails(loop, details)}
                              onSave={details => handleSave(loop, details)}
                              onSaveAsNew={details => handleSaveAsNew(loop, details)}
                            />
                          ))}
                      </>
                    )
                    : (
                      <>
                        <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between gap-2">
                          <div className="text-xs text-neutral-400 truncate">
                            {sessionData.user.name}
                          </div>
                          <button
                            className="text-xs font-semibold bg-neutral-800 text-neutral-200 px-2 py-1"
                            onPointerDown={() => {
                              void (async () => {
                                try {
                                  await api.logout()
                                }
                                finally {
                                  setSessionData(null)
                                }
                              })()
                            }}
                          >
                            Logout
                          </button>
                        </div>
                        {authError && (
                          <div className="px-3 py-2 text-xs text-orange-400 border-b border-neutral-800">
                            {authError}
                          </div>
                        )}
                        {loops.filter(loop => !loop.isNew).sort((a, b) =>
                          (b.data.timestamp ?? 0) - (a.data.timestamp ?? 0)
                        )
                          .map(loop => (
                            <LoopItem
                              key={loop.data.id}
                              loop={loop}
                              isCurrent={currentLoopId === loop.data.id}
                              onClick={() => setCurrentLoopId(loop.data.id)}
                              onClose={() => handleClose(loop)}
                              onDelete={() => handleDelete(loop)}
                              onEditDetails={details => handleEditDetails(loop, details)}
                              onSave={details => handleSave(loop, details)}
                              onSaveAsNew={details => handleSaveAsNew(loop, details)}
                            />
                          ))}
                      </>
                    )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <button
        onPointerDown={toggleSidebar}
        className="
              absolute right-[-37px] top-0 w-[37px] h-[40px] flex items-center justify-center bg-red-500
              bg-gradient-to-br from-neutral-700 to-black text-[#888] hover:text-white
            "
      >
        {sidebarOpen
          ? <ArrowLineLeftIcon weight="regular" size={16} />
          : <ArrowLineRightIcon weight="regular" size={16} />}
      </button>
    </div>
  )
}
