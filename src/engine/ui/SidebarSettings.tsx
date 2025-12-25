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
            <div className="text-xs text-neutral-100 font-semibold truncate">
              {sessionData.user.name}
            </div>
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
