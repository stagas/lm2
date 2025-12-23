import {
  CheckIcon,
  CircleNotch,
  FilePlusIcon,
  FloppyDiskBackIcon,
  GlobeIcon,
  LockIcon,
  PencilIcon,
  PlayIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { MouseButtons } from 'utils/mouse-buttons'
import type { LoopData } from '../../deno/types.ts'
import { useAppStore } from '../app/store.ts'
import { PlayGradientIcon } from './Icons.tsx'
import { Loop } from './loop.ts'
import { useEngineStore } from './store.ts'
import { useCodeFileValue } from './useCodeFileValue.ts'
import { useRestartLoop } from './useRestartLoop.tsx'

const LoopItemButton = (
  {
    icon,
    title,
    onClick,
    className,
  }: {
    icon: React.ReactNode
    title: string
    onClick: ((e: React.PointerEvent<HTMLButtonElement>) => void) | undefined
    className?: string
  },
) => (
  <button
    title={title}
    className={`p-1 bg-gradient-to-br from-neutral-300 to-neutral-500 rounded-md text-black hover:from-neutral-200 hover:to-neutral-400 ${
      className ?? ''
    }`}
    onContextMenu={e => e.preventDefault()}
    onPointerUp={e => {
      if (e.button === 1) {
        e.preventDefault()
      }
    }}
    onPointerDown={e => {
      e.preventDefault()
      e.stopPropagation()
      onClick?.(e)
    }}
  >
    {icon}
  </button>
)

export const LoopItem = ({
  loop,
  isCurrent,
  onClick,
  onPlay,
  onPause,
  onStop,
  canSave = true,
  onSave,
  onSaveAsNew,
  onEditDetails,
  onDelete,
  onClose,
  hideCloseWhenNotDirty = false,
  isLoading = false,
}: {
  loop: Loop
  isCurrent: boolean
  onClick: () => void
  onPlay?: () => void
  onPause?: () => void
  onStop?: () => void
  canSave?: boolean
  onSave?: (details: Partial<LoopData>) => void
  onSaveAsNew?: (details: Partial<LoopData>) => void
  onEditDetails?: (details: Partial<LoopData>) => void
  onDelete?: () => void
  onClose?: () => void
  hideCloseWhenNotDirty?: boolean
  isLoading?: boolean
}) => {
  const restartLoop = useRestartLoop()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loopTitle, setLoopTitle] = useState(loop.data.title)
  const code = useCodeFileValue(loop.codeFile)
  const playingLoopId = useEngineStore(state => state.playingLoopId)
  const playbackState = useEngineStore(state => state.playbackState)
  const base = useAppStore(state => state.bases[loop.data.id])
  const wasDirty = useAppStore(state => state.dirtyById[loop.data.id] === true)
  const baseCode = base?.code ?? loop.data.code ?? ''
  const isDirty = loop.data.code == null ? wasDirty : code !== baseCode
  const isPlaying = playbackState === 'running'
  const isLive = isPlaying && playingLoopId === loop.data.id
  const shouldHideClose = hideCloseWhenNotDirty && loop.isNew && !isDirty

  type PendingPointerHandler = {
    handler: (event: React.PointerEvent<HTMLElement>) => void
    event: React.PointerEvent<HTMLElement>
  }

  const pendingPointerHandlersRef = useRef<PendingPointerHandler[]>([])

  useEffect(() => {
    if (isLoading) return
    if (loop.data.code == null) return
    if (pendingPointerHandlersRef.current.length === 0) return
    const queued = pendingPointerHandlersRef.current.splice(0)
    queued.forEach(entry => entry.handler(entry.event))
  }, [isLoading, loop.data.code])

  const runWhenLoopReady = useCallback(
    <E extends HTMLElement>(handler?: (event: React.PointerEvent<E>) => void) => {
      return (event: React.PointerEvent<E>) => {
        if (!handler) return
        if (!isLoading && loop.data.code != null) {
          handler(event)
          return
        }
        onClick()
        pendingPointerHandlersRef.current.push({
          handler: handler as unknown as (event: React.PointerEvent<HTMLElement>) => void,
          event: event as unknown as React.PointerEvent<HTMLElement>,
        })
      }
    },
    [isLoading, loop.data.code, onClick],
  )

  const handlePlayClick = runWhenLoopReady<HTMLButtonElement>(async e => {
    if (e.buttons & MouseButtons.Right) {
      onStop?.()
      return
    }
    if (isLive && ((e.buttons & MouseButtons.Middle) || e.ctrlKey)) {
      restartLoop()
      return
    }
    if (isLive) {
      onPause?.()
    }
    else {
      if (!isPlaying && ((e.buttons & MouseButtons.Middle) || e.ctrlKey)) {
        await restartLoop()
      }
      onPlay?.()
    }
  })

  const alertSaveRequiresSignIn = () => {
    alert('You need to sign in first.')
  }

  const cancelEditingDetails = () => {
    setLoopTitle(loop.data.title)
    setIsEditingDetails(false)
    setIsSaving(false)
  }

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
    if (!canSave) {
      alertSaveRequiresSignIn()
      return
    }
    setIsEditingDetails(true)
    setIsSaving(true)
  }

  const handleSave = () => {
    if (!canSave) {
      alertSaveRequiresSignIn()
      return
    }
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
      const onPointerDown = (e: PointerEvent) => {
        const root = rootRef.current
        if (!root) return
        const t = e.target
        if (t instanceof Node && root.contains(t)) return
        cancelEditingDetails()
      }
      document.addEventListener('pointerdown', onPointerDown, { capture: true })
      return () => {
        document.removeEventListener('pointerdown', onPointerDown, { capture: true })
      }
    }
  }, [isEditingDetails, loop.data.title])

  // useEffect(() => {
  //   if (!isEditingDetails) return
  //   if (isCurrent) return
  //   cancelEditingDetails()
  // }, [isCurrent, isEditingDetails, loop.data.title])

  useEffect(() => {
    if (isEditingDetails) {
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [isEditingDetails])

  return (
    <div
      ref={rootRef}
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
                ref={inputRef}
                className="flex flex-1 min-w-0 bg-gradient-to-b from-black to-neutral-700 rounded-sm outline-none py-1.5 my-0.5 px-2 text-white"
                type="text"
                value={loopTitle}
                onPointerDown={e => e.stopPropagation()}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    cancelEditingDetails()
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
              {isLoading && (
                <div className="text-neutral-400 animate-spin shrink-0">
                  <CircleNotch weight="regular" size={16} />
                </div>
              )}
              <div className="truncate">{loopTitle}</div>
            </div>
          )}
      </div>
      {!isEditingDetails && (onEditDetails || isLive) && (
        <div
          className={`shrink-0 pr-2 flex flex-row items-center gap-2 ${
            isLive || isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <div
            className={`flex flex-row items-center gap-2 ${isLive && !isCurrent ? 'hidden group-hover:flex' : ''}`}
          >
            {!isDirty && (
              <LoopItemButton title="Edit" icon={<PencilIcon weight="regular" size={16} />}
                onClick={handleStartEditingDetails} />
            )}
            {(isDirty || loop.isNew) && !shouldHideClose && (
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
            className={isLive ? 'text-orange-600' : undefined}
            icon={isLive ? <PlayGradientIcon size={16} /> : <PlayIcon weight="regular" size={16} />}
            onClick={handlePlayClick}
          />
        </div>
      )}
    </div>
  )
}
