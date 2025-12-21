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
import { CodeFile } from 'mini-code'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

// type Loop = {
//   id: string
//   title: string
//   artist: string
//   artistId: string
//   isTab: boolean
//   isDirty: boolean
//   isPublic: boolean
//   timestamp: number
// }

type RemixOfData = Pick<
  LoopData,
  | 'id'
  | 'title'
  | 'artist'
  | 'artistId'
  | 'likesCount'
  | 'commentsCount'
>

type LoopData = {
  id: string
  title: string
  artist: string
  artistId: string
  code: string
  likesCount: number
  commentsCount: number
  remixOf: RemixOfData | null
  isPublic: boolean
  timestamp: number
}

class Loop {
  codeFile: CodeFile
  constructor(public data: LoopData) {
    this.codeFile = new CodeFile(data.code)
  }
  get isNew() {
    return this.data.timestamp === 0
  }
  get isDirty() {
    return this.codeFile.value !== this.data.code
  }
}

type SidebarTab = 'loops' | 'liked' | 'browse' | 'compiled' | 'settings'

const SidebarTabIcon: Record<SidebarTab, React.ReactNode> = {
  loops: <WaveformIcon weight="regular" size={16} />,
  liked: <HeartIcon weight="regular" size={16} />,
  browse: <GlobeIcon weight="regular" size={16} />,
  compiled: <ArticleIcon weight="regular" size={16} />,
  settings: <GearSixIcon weight="regular" size={16} />,
}

const titles = [
  'Ostkreuz',
  'Acid',
  'Phosphorus',
  'More Acid',
  'LSD',
  'Voices',
  'Zeitgeist',
  'Synesthesia',
  'Blueprint',
  'Mirage',
  'Pulse',
  'Cosmos',
  'Nebula',
  'Galaxy',
  'Universe',
  'Infinity',
  'Eternity',
  'Paradise',
  'Eden',
  'Garden',
  'Hell',
  'Darkness',
  'Light',
  'Shadow',
  'Ghost',
  'Specter',
  'Phantom',
  'Chaos',
  'Order',
  'Balance',
  'Harmony',
  'Symmetry',
  'Asymmetry',
  'Random',
  'Pattern',
  'Noise',
]

function createDemoLoop(title: string, isNew: boolean = Math.random() < 0.2,
  isDirty: boolean | null = Math.random() < 0.2)
{
  const loop = new Loop({
    id: title,
    title,
    artist: 'stagas',
    artistId: 'stagas',
    code: '',
    likesCount: 0,
    commentsCount: 0,
    remixOf: null,
    isPublic: isNew ? false : Math.random() < 0.8,
    timestamp: isNew ? 0 : Math.random() * 1000000 | 0,
  })
  if ((isNew && isDirty !== null) || isDirty) {
    loop.codeFile.value = '// make dirty'
  }
  return loop
}

const demoLoops: Loop[] = titles.map(title => createDemoLoop(title))

const LoopItemButton = (
  { icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: (() => void) | undefined },
) => (
  <button title={title}
    className="p-1 bg-gradient-to-br from-neutral-300 to-neutral-500 rounded-md text-black hover:from-neutral-200 hover:to-neutral-400"
    onPointerDown={e => {
      e.stopPropagation()
      onClick?.()
    }}
  >
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
              {!loop.isNew && !loop.isDirty && (
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
              {loop.isDirty && (
                <div
                  title="Has unsaved changes"
                  className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"
                />
              )}
              <div className="truncate">{loopTitle}</div>
            </div>
          )}
      </div>
      {!isEditingDetails && onEditDetails && (
        <div
          className={`shrink-0 pr-2 flex flex-row items-center gap-2 ${
            isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {!loop.isDirty && (
            <LoopItemButton title="Edit" icon={<PencilIcon weight="regular" size={16} />}
              onClick={handleStartEditingDetails} />
          )}
          {(loop.isDirty || loop.isNew) && (
            <LoopItemButton title={!loop.isNew ? 'Discard changes' : 'Close'}
              icon={<XIcon weight="regular" size={16} />} onClick={onClose} />
          )}
          {loop.isDirty && (
            <LoopItemButton title="Save" icon={<FloppyDiskBackIcon weight="regular" size={16} />}
              onClick={handleStartSaving} />
          )}
          <LoopItemButton title="Play" icon={<PlayIconPhosphor weight="regular" size={16} />} onClick={() => {}} />
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('loops')
  const [currentLoopId, setCurrentLoopId] = useState<string>(
    demoLoops[Math.random() * demoLoops.length | 0]?.data.id ?? demoLoops[0]!.data.id,
  )
  const [loops, setLoops] = useState<Loop[]>(demoLoops)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollPosRef = useRef(0)

  const currentLoop = useMemo(() => loops.find(loop => loop.data.id === currentLoopId), [loops, currentLoopId])

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

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleNewLoop = () => {
    let newLoop = 'Untitled'
    let untitledCount = 0
    for (const loop of loops) {
      if (loop.data.title.startsWith('Untitled')) {
        untitledCount = Math.max(untitledCount, parseInt(loop.data.title.split(' ').pop() || '0') || 1)
      }
    }
    if (untitledCount > 0) {
      newLoop = `Untitled ${untitledCount + 1}`
    }
    setLoops([createDemoLoop(newLoop, true, null), ...loops])
  }

  const handleSave = (loop: Loop, details: Partial<LoopData>) => {
    preserveScrollPos(() => {
      details.timestamp = Date.now()
      setLoops(loops.map(l => l.data.id === loop.data.id ? new Loop({ ...loop.data, ...details }) : l))
    })
  }
  const handleSaveAsNew = (loop: Loop, details: Partial<LoopData>) => {
    // preserveScrollPos(() => {
    details.timestamp = Date.now()

    // restore the original code on the previous loop
    loop.codeFile.value = loop.data.code

    const newLoop = new Loop({ ...loop.data, ...details })
    newLoop.data.id = `${newLoop.data.title}-${Date.now()}`
    setCurrentLoopId(newLoop.data.id)

    setLoops([...loops, newLoop])
    // })
  }
  const handleClose = (loop: Loop) => {
    if (loop.isDirty
      && !confirm('Are you sure? You will lose all your changes!')) return
    preserveScrollPos(() => {
      if (loop.isNew) {
        setLoops(loops.filter(l => l.data.id !== loop.data.id))
      }
      else {
        loop.codeFile.value = loop.data.code
        setLoops([...loops])
      }
    })
  }
  const handleEditDetails = (loop: Loop, details: Partial<LoopData>) => {
    preserveScrollPos(() => {
      setLoops(loops.map(l =>
        l.data.id === loop.data.id
          ? Object.assign(new Loop({ ...loop.data, ...details }), { codeFile: loop.codeFile })
          : l
      ))
    })
  }
  const handleDelete = (loop: Loop) => {
    if (!confirm(`Are you sure you want to delete "${loop.data.title}"?`)) return
    preserveScrollPos(() => {
      setLoops(loops.filter(l => l.data.id !== loop.data.id))
    })
  }
  return (
    <div className={`z-10 relative h-full min-w-0 ${sidebarOpen ? 'w-[30dvw]' : 'w-0'}`}>
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
                    remixOf: null,
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
                  {loops.filter(loop => !loop.isNew).sort((a, b) => b.data.timestamp - a.data.timestamp).map(loop => (
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
