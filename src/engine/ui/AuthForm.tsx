import { CircleNotchIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import type { SessionData } from '../../../deno/types.ts'
import type { API } from '../../app/api.ts'

type AuthMode = 'login' | 'register'

const inputClass = (hasError: boolean) =>
  `bg-gradient-to-b from-black to-neutral-700 rounded-sm text-white px-2 py-2 text-sm ${
    hasError ? 'outline outline-2 outline-orange-600' : 'outline-none'
  }`

export function AuthForm(
  {
    api,
    onSessionData,
  }: {
    api: API
    onSessionData: (data: SessionData) => void
  },
) {
  const [artistName, setArtistName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<AuthMode>('login')
  const [msg, setMsg] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [touched, setTouched] = useState({
    artistName: false,
    email: false,
    password: false,
  })

  const errors = useMemo(() => {
    const next: Record<'artistName' | 'email' | 'password', string | null> = {
      artistName: null,
      email: null,
      password: null,
    }
    if (mode === 'register' && artistName.trim().length === 0) next.artistName = 'Required'
    if (email.trim().length === 0) next.email = 'Required'
    if (password.trim().length === 0) next.password = 'Required'
    return next
  }, [artistName, email, mode, password])

  const hasErrors = useMemo(() => {
    if (mode === 'register' && errors.artistName) return true
    return Boolean(errors.email || errors.password)
  }, [errors, mode])

  const submit = () => {
    const nextTouched = {
      artistName: touched.artistName || mode === 'register',
      email: true,
      password: true,
    }
    setTouched(nextTouched)

    if (hasErrors) {
      const missingArtistName = mode === 'register' && artistName.trim().length === 0
      const missingEmail = email.trim().length === 0
      const missingPassword = password.trim().length === 0
      const first = missingArtistName
        ? 'Artist name is required'
        : missingEmail
        ? 'Email is required'
        : missingPassword
        ? 'Password is required'
        : 'Missing required fields'
      setMsg(first)
      return
    }

    setIsBusy(true)
    setMsg(null)
    void (async () => {
      try {
        const next = mode === 'login'
          ? await api.login(email.trim(), password)
          : await api.register(artistName.trim(), email.trim(), password)
        onSessionData(next)
        setPassword('')
        setEmail('')
        setArtistName('')
      }
      catch (e) {
        setMsg(e instanceof Error ? e.message : String(e))
      }
      finally {
        setIsBusy(false)
      }
    })()
  }

  const showArtistName = mode === 'register'
  const artistNameError = showArtistName && touched.artistName ? errors.artistName : null
  const emailError = touched.email ? errors.email : null
  const passwordError = touched.password ? errors.password : null

  return (
    <form onSubmit={e => e.preventDefault()} className="flex flex-col gap-2">
      {showArtistName && (
        <div className="flex flex-col gap-1">
          <input
            className={inputClass(Boolean(artistNameError))}
            placeholder="Artist name"
            value={artistName}
            required
            onBlur={() => setTouched(t => ({ ...t, artistName: true }))}
            onChange={e => setArtistName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submit()
            }}
          />
          {artistNameError && <div className="text-xs text-orange-400">{artistNameError}</div>}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <input
          className={inputClass(Boolean(emailError))}
          placeholder="Email"
          value={email}
          autoComplete="email"
          required
          onBlur={() => setTouched(t => ({ ...t, email: true }))}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') submit()
          }}
        />
        {emailError && <div className="text-xs text-orange-400">{emailError}</div>}
      </div>
      <div className="flex flex-col gap-1">
        <input
          className={inputClass(Boolean(passwordError))}
          placeholder="Password"
          type="password"
          value={password}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          onBlur={() => setTouched(t => ({ ...t, password: true }))}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') submit()
          }}
        />
        {passwordError && <div className="text-xs text-orange-400">{passwordError}</div>}
      </div>

      <button
        className="bg-gradient-to-br from-neutral-300 to-neutral-600 rounded-md text-black font-semibold py-2 text-sm disabled:from-neutral-700 disabled:to-neutral-600"
        disabled={isBusy}
        onPointerDown={() => submit()}
      >
        {isBusy
          ? (
            <div className="flex items-center justify-center py-0.5">
              <div className="w-4 h-4 text-white animate-spin">
                <CircleNotchIcon weight="regular" size={16} />
              </div>
            </div>
          )
          : mode === 'login'
          ? 'Sign In'
          : 'Sign Up'}
      </button>

      {msg && <div className="text-xs text-orange-400">{msg}</div>}

      <p className="text-xs text-neutral-400">
        {mode === 'register' && (
          <>
            Already have an account?{' '}
            <button
              className="text-orange-400"
              onPointerDown={() => {
                setMsg(null)
                setTouched({ artistName: false, email: false, password: false })
                setMode('login')
              }}
            >
              Sign In
            </button>
          </>
        )}
        {mode === 'login' && (
          <>
            Don't have an account?{' '}
            <button
              className="text-orange-400"
              onPointerDown={() => {
                setMsg(null)
                setTouched({ artistName: false, email: false, password: false })
                setMode('register')
              }}
            >
              Sign Up
            </button>
          </>
        )}
      </p>
    </form>
  )
}
