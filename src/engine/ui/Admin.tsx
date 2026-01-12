import {
  ArrowLeftIcon,
  CodeIcon,
  DownloadIcon,
  EyeIcon,
  EyeSlashIcon,
  FireSimpleIcon,
  ListIcon,
  SignInIcon,
  TrashIcon,
  UserCircleIcon,
  UsersIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { AdminLoop, AdminUser } from '../../../deno/types.ts'
import { useAppStore } from '../../app/store.ts'
import { Logo } from '../../components/Logo.tsx'
import { RadialGradient } from '../../components/RadialGradient.tsx'
import { Link, useRouter } from './router.tsx'

export function Admin() {
  const { navigate } = useRouter()
  const sessionData = useAppStore(state => state.sessionData)
  const api = useAppStore(state => state.api)
  const setSessionData = useAppStore(state => state.setSessionData)

  const [activeTab, setActiveTab] = useState<'users' | 'loops' | 'import'>('users')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loops, setLoops] = useState<AdminLoop[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [isLoadingLoops, setIsLoadingLoops] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!sessionData?.user.isAdmin) {
      navigate('/')
      return
    }
  }, [sessionData, navigate])

  useEffect(() => {
    if (activeTab === 'users' && users.length === 0 && !isLoadingUsers) {
      setIsLoadingUsers(true)
      void api.fetchAdminUsers()
        .then(setUsers)
        .catch(e => console.error('Failed to fetch users:', e))
        .finally(() => setIsLoadingUsers(false))
    }
  }, [activeTab, users.length, isLoadingUsers, api])

  useEffect(() => {
    if (activeTab === 'loops' && loops.length === 0 && !isLoadingLoops) {
      setIsLoadingLoops(true)
      void api.fetchAdminLoops()
        .then(setLoops)
        .catch(e => console.error('Failed to fetch loops:', e))
        .finally(() => setIsLoadingLoops(false))
    }
  }, [activeTab, loops.length, isLoadingLoops, api])

  const handleLoginAs = async (userId: string) => {
    try {
      const session = await api.adminLoginAs(userId)
      setSessionData(session)
      navigate('/app')
    }
    catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to login as user')
    }
  }

  const handleSendWelcomeEmail = async (userId: string) => {
    try {
      const res = await api.adminSendWelcomeEmail(userId)
      setUsers(users.map(u => u.id === userId ? { ...u, welcomeEmailSent: true } : u))
      alert(res.message)
    }
    catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to send welcome email')
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return
    try {
      await api.adminDeleteUser(userId)
      setUsers(users.filter(u => u.id !== userId))
    }
    catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete user')
    }
  }

  const handleDeleteLoop = async (loopId: string) => {
    if (!confirm('Are you sure you want to delete this loop?')) return
    try {
      await api.adminDeleteLoop(loopId)
      setLoops(loops.filter(l => l.id !== loopId))
    }
    catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete loop')
    }
  }

  const handleToggleVisibility = async (loopId: string) => {
    try {
      const res = await api.adminToggleLoopVisibility(loopId)
      setLoops(loops.map(l => l.id === loopId ? { ...l, isPublic: res.isPublic } : l))
    }
    catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to toggle visibility')
    }
  }

  const handleFileSelect = async (e: Event) => {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setImportError(null)
    setImportResult(null)

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!Array.isArray(data)) {
        throw new Error('Invalid file format: expected an array')
      }

      const result = await api.adminImportV1(data)
      setImportResult(result)
      if (result.errors.length > 0) {
        console.error('Import errors:', result.errors)
      }
    }
    catch (e) {
      setImportError(e instanceof Error ? e.message : 'Failed to import data')
    }
    finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (!sessionData?.user.isAdmin) {
    return null
  }

  return (
    <div className="min-h-screen text-white relative">
      <RadialGradient>
        <div className="relative min-h-screen">
          <div className="mx-auto px-6 py-12 min-h-screen flex flex-col">
            <div className="text-center mb-12">
              <Link to="/">
                <Logo text="loopmaster" size="4em" />
              </Link>
              <h1 className="text-3xl font-bold text-white mt-6 mb-2">Admin Panel</h1>
              <p className="text-neutral-400">Manage users, loops, and import data</p>
            </div>

            <div className="flex flex-row items-center justify-center gap-2 mb-8">
              <button
                onClick={() => setActiveTab('users')}
                className={`px-6 py-3 font-semibold text-sm flex items-center justify-center gap-2 rounded-lg ${
                  activeTab === 'users'
                    ? 'bg-gradient-to-br from-orange-400 to-red-600 text-white'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white border-2 border-neutral-800 hover:border-orange-600'
                }`}
              >
                <UsersIcon weight="regular" size={18} />
                <span>Users</span>
              </button>
              <button
                onClick={() => setActiveTab('loops')}
                className={`px-6 py-3 font-semibold text-sm flex items-center justify-center gap-2 rounded-lg ${
                  activeTab === 'loops'
                    ? 'bg-gradient-to-br from-orange-400 to-red-600 text-white'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white border-2 border-neutral-800 hover:border-orange-600'
                }`}
              >
                <ListIcon weight="regular" size={18} />
                <span>Loops</span>
              </button>
              <button
                onClick={() => setActiveTab('import')}
                className={`px-6 py-3 font-semibold text-sm flex items-center justify-center gap-2 rounded-lg ${
                  activeTab === 'import'
                    ? 'bg-gradient-to-br from-orange-400 to-red-600 text-white'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white border-2 border-neutral-800 hover:border-orange-600'
                }`}
              >
                <DownloadIcon weight="regular" size={18} />
                <span>Import V1</span>
              </button>
              <span className="text-neutral-500 mx-2">or</span>
              <Link to="/app"
                className="px-6 py-3 font-semibold text-sm flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-orange-400 to-red-600 text-white"
              >
                <CodeIcon weight="regular" size={18} />
                <span>Enter App</span>
              </Link>
            </div>

            <div className="flex-1">
              {activeTab === 'users' && (
                <div className="bg-black border-2 border-orange-600 rounded-lg p-6">
                  <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                    <UsersIcon weight="regular" size={24} />
                    Users
                  </h2>
                  {isLoadingUsers
                    ? <div className="text-neutral-400 text-center py-8">Loading users...</div>
                    : users.length === 0
                    ? <div className="text-neutral-400 text-center py-8">No users found.</div>
                    : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b-2 border-neutral-800">
                              <th className="pb-3 text-neutral-400 font-semibold">Name</th>
                              <th className="pb-3 text-neutral-400 font-semibold">Email</th>
                              <th className="pb-3 text-neutral-400 font-semibold">Loops</th>
                              <th className="pb-3 text-neutral-400 font-semibold">Likes</th>
                              <th className="pb-3 text-neutral-400 font-semibold">Welcome Email</th>
                              <th className="pb-3 text-neutral-400 font-semibold">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {users.map(user => (
                              <tr key={user.id} className="border-b border-neutral-900">
                                <td className="py-3 text-white">{user.name}</td>
                                <td className="py-3 text-neutral-300">{user.email}</td>
                                <td className="py-3 text-neutral-400">{user.loopsCount}</td>
                                <td className="py-3 text-neutral-400">{user.likesCount}</td>
                                <td className="py-3 text-neutral-400">
                                  {user.welcomeEmailSent
                                    ? <span className="text-green-400">✓ Sent</span>
                                    : <span className="text-yellow-400">Not sent</span>}
                                </td>
                                <td className="py-3">
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleLoginAs(user.id)}
                                      className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm flex items-center gap-1"
                                      title="Login as user"
                                    >
                                      <SignInIcon weight="regular" size={14} />
                                    </button>
                                    <button
                                      onClick={() => handleSendWelcomeEmail(user.id)}
                                      className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-sm"
                                      title="Send welcome email"
                                    >
                                      Email
                                    </button>
                                    <button
                                      onClick={() => handleDeleteUser(user.id)}
                                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm flex items-center gap-1"
                                      title="Delete user"
                                    >
                                      <TrashIcon weight="regular" size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                </div>
              )}

              {activeTab === 'loops' && (
                <div className="bg-black border-2 border-orange-600 rounded-lg p-6">
                  <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                    <ListIcon weight="regular" size={24} />
                    Loops
                  </h2>
                  {isLoadingLoops
                    ? <div className="text-neutral-400 text-center py-8">Loading loops...</div>
                    : loops.length === 0
                    ? <div className="text-neutral-400 text-center py-8">No loops found.</div>
                    : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b-2 border-neutral-800">
                              <th className="pb-3 text-neutral-400 font-semibold">Title</th>
                              <th className="pb-3 text-neutral-400 font-semibold">User ID</th>
                              <th className="pb-3 text-neutral-400 font-semibold">Public</th>
                              <th className="pb-3 text-neutral-400 font-semibold">Date</th>
                              <th className="pb-3 text-neutral-400 font-semibold">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {loops.map(loop => (
                              <tr key={loop.id} className="border-b border-neutral-900">
                                <td className="py-3 text-white">{loop.title}</td>
                                <td className="py-3 text-neutral-300 font-mono text-sm">{loop.userId}</td>
                                <td className="py-3 text-neutral-400">{loop.isPublic ? 'Yes' : 'No'}</td>
                                <td className="py-3 text-neutral-400 text-sm">
                                  {new Date(loop.timestamp).toLocaleDateString()}
                                </td>
                                <td className="py-3">
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleToggleVisibility(loop.id)}
                                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1"
                                      title={loop.isPublic ? 'Make private' : 'Make public'}
                                    >
                                      {loop.isPublic
                                        ? <EyeSlashIcon weight="regular" size={14} />
                                        : <EyeIcon weight="regular" size={14} />}
                                    </button>
                                    <button
                                      onClick={() => handleDeleteLoop(loop.id)}
                                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm flex items-center gap-1"
                                      title="Delete loop"
                                    >
                                      <TrashIcon weight="regular" size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                </div>
              )}

              {activeTab === 'import' && (
                <div className="bg-black border-2 border-orange-600 rounded-lg p-6">
                  <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                    <DownloadIcon weight="regular" size={24} />
                    Import User Data from V1
                  </h2>
                  <p className="text-neutral-400 mb-6">
                    Upload a JSON file exported from V1 to migrate user data to the current backend.
                  </p>

                  <div className="mb-6">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="import-file"
                    />
                    <label
                      htmlFor="import-file"
                      className="inline-block px-6 py-3 bg-gradient-to-br from-orange-400 to-red-600 text-white font-semibold rounded-lg cursor-pointer hover:opacity-90"
                    >
                      Select JSON File
                    </label>
                  </div>

                  {isImporting && <div className="text-neutral-400 text-center py-4">Importing data...</div>}

                  {importError && (
                    <div className="bg-red-900/50 border-2 border-red-600 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <XIcon weight="regular" size={20} className="text-red-400" />
                        <span className="text-red-400 font-semibold">Import Error</span>
                      </div>
                      <p className="text-red-300">{importError}</p>
                    </div>
                  )}

                  {importResult && (
                    <div className="bg-green-900/50 border-2 border-green-600 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-green-400 font-semibold">Import Complete</span>
                      </div>
                      <div className="text-green-300 space-y-1">
                        <p>Imported: {importResult.imported} users</p>
                        <p>Skipped: {importResult.skipped} users</p>
                        {importResult.errors.length > 0 && (
                          <div className="mt-3">
                            <p className="text-yellow-400 font-semibold mb-1">Errors ({importResult.errors.length}):</p>
                            <ul className="list-disc list-inside text-sm space-y-1">
                              {importResult.errors.slice(0, 10).map((error, i) => (
                                <li key={i} className="text-yellow-300">{error}</li>
                              ))}
                              {importResult.errors.length > 10 && (
                                <li className="text-yellow-300">... and {importResult.errors.length - 10} more</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </RadialGradient>
    </div>
  )
}
