import { CheckIcon, CircleNotchIcon, PencilIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../app/store.ts'
import Switch from '../../components/Switch.tsx'
import { useEngineUiStore } from '../store.ts'
import { AuthForm } from './AuthForm.tsx'

function SidebarSettingsSwitch(
  { children, onClick, checked, onChange }: {
    children: React.ReactNode
    onClick: (checked: boolean) => void
    checked: boolean
    onChange: (checked: boolean) => void
  },
) {
  return (
    <div
      onPointerDown={e => {
        e.stopPropagation()
        onClick(!checked)
      }}
      className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between gap-2 cursor-pointer select-none"
    >
      <div className="text-xs text-neutral-400 truncate">
        {children}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}

export function SidebarSettings(
  {
    apiError,
    setApiError,
  }: {
    apiError: string | null
    setApiError: (error: string | null) => void
  },
) {
  const sessionData = useAppStore(state => state.sessionData)
  const api = useAppStore(state => state.api)
  const setSessionData = useAppStore(state => state.setSessionData)
  const uiZeroBased = useEngineUiStore(state => state.zeroBasedTimelines)
  const setUiZeroBased = useEngineUiStore(state => state.setZeroBasedTimelines)
  const uiShowFunctionDefinitions = useEngineUiStore(state => state.showFunctionDefinitions)
  const setUiShowFunctionDefinitions = useEngineUiStore(state => state.setShowFunctionDefinitions)
  const [editingArtistName, setEditingArtistName] = useState(false)
  const artistNameInputRef = useRef<HTMLInputElement>(null)
  const [isUpdatingArtistName, setIsUpdatingArtistName] = useState(false)
  const [localArtistName, setLocalArtistName] = useState(sessionData?.user.name ?? '')

  useEffect(() => {
    setLocalArtistName(sessionData?.user.name ?? '')
  }, [sessionData?.user.name])

  useEffect(() => {
    if (editingArtistName) {
      setTimeout(() => {
        artistNameInputRef.current?.focus()
        artistNameInputRef.current?.select()
      })
    }
  }, [editingArtistName])

  const handleSaveArtistName = async () => {
    setIsUpdatingArtistName(true)
    try {
      const nextSessionData = await api.updateArtistName(localArtistName.trim())
      setSessionData(nextSessionData)
      setApiError(null)
      setEditingArtistName(false)
    }
    catch (e) {
      setApiError(e instanceof Error ? e.message : String(e))
    }
    finally {
      setIsUpdatingArtistName(false)
    }
  }

  const handleCancelArtistName = () => {
    setLocalArtistName(sessionData?.user.name ?? '')
    setEditingArtistName(false)
  }

  return (
    <>
      {!sessionData
        ? (
          <>
            <div className="p-3 flex flex-col gap-2 border-b border-neutral-800">
              <AuthForm api={api} onSessionData={setSessionData} />
            </div>
          </>
        )
        : (
          <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between gap-2">
            {editingArtistName
              ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={artistNameInputRef}
                    type="text"
                    value={localArtistName}
                    className="text-xs flex py-1 px-2 flex-1 min-w-0 bg-gradient-to-b from-black to-neutral-700 rounded-sm outline-none text-white"
                    onChange={e => setLocalArtistName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        void handleSaveArtistName()
                      }
                      else if (e.key === 'Escape') {
                        handleCancelArtistName()
                      }
                    }}
                  />
                  <button
                    title="Save Artist Name"
                    className="text-xs font-semibold text-neutral-500 hover:text-white"
                    onPointerDown={() => {
                      void handleSaveArtistName()
                    }}
                  >
                    {isUpdatingArtistName
                      ? (
                        <div className="w-4 h-4 text-white animate-spin">
                          <CircleNotchIcon weight="regular" size={16} />
                        </div>
                      )
                      : <CheckIcon weight="regular" size={16} />}
                  </button>
                </div>
              )
              : (
                <div className="text-xs text-neutral-100 font-semibold truncate flex items-center gap-2">
                  {localArtistName}
                  <button
                    title="Edit Artist Name"
                    className="text-xs font-semibold text-neutral-500 hover:text-white"
                    onPointerDown={() => {
                      setEditingArtistName(true)
                    }}
                  >
                    <PencilIcon weight="regular" size={16} />
                  </button>
                </div>
              )}
            <button
              className="text-xs font-semibold bg-neutral-800 text-neutral-200 px-2 py-1"
              onPointerDown={() => {
                void (async () => {
                  setSessionData(null)
                  try {
                    await api.logout()
                  }
                  catch (e) {
                    setApiError(e instanceof Error ? e.message : String(e))
                  }
                })()
              }}
            >
              Sign Out
            </button>
          </div>
        )}
      <SidebarSettingsSwitch onClick={setUiZeroBased} checked={uiZeroBased} onChange={setUiZeroBased}>
        Zero-Based Timeline
      </SidebarSettingsSwitch>
      <SidebarSettingsSwitch onClick={setUiShowFunctionDefinitions} checked={uiShowFunctionDefinitions}
        onChange={setUiShowFunctionDefinitions}
      >
        Show Function Popup
      </SidebarSettingsSwitch>
    </>
  )
}
