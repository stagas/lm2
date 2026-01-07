import { MagnifyingGlassIcon, QuestionIcon, XIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Logo } from '../../../components/Logo.tsx'
import { Modal } from '../../../components/Modal.tsx'
import { useEngineDspStore, useEngineRuntimeStore } from '../../store.ts'
import { functionDefinitions } from '../function-definitions.ts'
import { Link } from '../router.tsx'
import { tokenizer } from '../tokenizer.ts'
import { fuzzyScore } from './fuzzy.ts'
import { InlineEditor, inlineEditorRegistry } from './InlineEditor.tsx'
import { MarkdownDoc } from './markdown.tsx'

type Tutorial = {
  file: string
  title: string
  markdown: string
}

type DocItem = {
  id: string
  title: string
  group: 'tutorial' | 'api' | 'about'
  searchText: string
  fileSlug?: string
  functionName?: string
  render: () => preact.ComponentChild
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function hashId(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return (h >>> 0).toString(36)
}

function apiId(name: string): string {
  return `api-${slug(name)}-${hashId(name)}`
}

function functionNameToUrlSlug(name: string): string {
  // Replace special characters with URL-friendly words
  return name
    .replace(/^\[\]\./, 'array.') // [].map -> array.map
    .replace(/^#/, 'hash-') // #scale -> hash-scale
}

function urlSlugToFunctionName(slug: string): string {
  // Reverse the URL slug transformation
  return slug
    .replace(/^array\./, '[].') // array.map -> [].map
    .replace(/^hash-/, '#') // hash-scale -> #scale
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to fetch ${path}`)
  return await res.json()
}

async function fetchText(path: string): Promise<string> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to fetch ${path}`)
  return await res.text()
}

function titleFromMarkdown(file: string, md: string): string {
  const m = md.match(/^#\s+(.+)\s*$/m)
  return m?.[1]?.trim() || file.replace(/\.md$/i, '')
}

function getTokenClass(type: string): string {
  switch (type) {
    case 'function':
      return 'text-[#ea580c]' // orange-600 from duochrome theme
    case 'parameter':
      return 'text-[#dddddd]' // light gray for parameter names
    case 'argument':
      return 'text-[#dddddd]' // light gray for parameter names in complex signatures
    case 'identifier':
      return 'text-[#aaaaaa]' // darker gray for types
    case 'number':
      return 'text-[#ffff00]' // yellow from duochrome theme
    case 'string':
      return 'text-[#cccccc]' // light gray from duochrome theme
    case 'keyword':
      return 'text-white'
    case 'operator':
      return 'text-[#bbb]' // light gray from duochrome theme
    case 'punctuation':
      return 'text-[#bbbbbb]' // light gray from duochrome theme
    case 'comment':
      return 'text-[#666666]' // dark gray from duochrome theme
    default:
      return 'text-white'
  }
}

function SignatureHighlight({ signature }: { signature: string }) {
  const tokens = tokenizer(signature, true)
  return (
    <span className="text-sm font-[Space_Mono]">
      {tokens.map((token, i) => (
        <span key={i} className={getTokenClass(token.type)}>
          {token.content}
        </span>
      ))}
    </span>
  )
}

export function Docs({
  externalIsOpen = false,
  externalSelectedId = null,
  onClose = () => {},
}: {
  externalIsOpen?: boolean
  externalSelectedId?: string | null
  onClose?: () => void
} = {}) {
  const [isOpen, setIsOpen] = useState(false)
  const [tutorials, setTutorials] = useState<Tutorial[]>([])
  const [tutorialError, setTutorialError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const lastPlayedExampleRef = useRef<string | null>(null)

  // Use external control if provided, otherwise use internal state
  const effectiveIsOpen = externalIsOpen !== undefined ? externalIsOpen : isOpen
  const effectiveSelectedId = externalSelectedId !== null ? externalSelectedId : selectedId

  useEffect(() => {
    let isCancelled = false
    ;(async () => {
      try {
        const files = await fetchJson<string[]>('/docs/tutorials/index.json')
        const next: Tutorial[] = []
        for (const file of files) {
          const markdown = await fetchText(`/docs/tutorials/${file}`)
          next.push({ file, markdown, title: titleFromMarkdown(file, markdown) })
        }
        if (!isCancelled) {
          setTutorials(next)
          setTutorialError(null)
        }
      }
      catch (err) {
        if (!isCancelled) setTutorialError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!effectiveIsOpen) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [effectiveIsOpen])

  const handleDocsKeyDown = useCallback((e: KeyboardEvent) => {
    if (!effectiveIsOpen) return
    const metaKey = e.ctrlKey || e.metaKey
    if (e.key === ' ' && metaKey) {
      e.preventDefault()
      e.stopPropagation()

      // Get all registered InlineEditors
      const editors = Array.from(inlineEditorRegistry.entries())
      if (editors.length === 0) return

      // Find the last played example or use the first one
      let targetEditor: [string, { play: () => void; stop: () => void }] | undefined
      if (lastPlayedExampleRef.current) {
        targetEditor = editors.find(([id]) => id === lastPlayedExampleRef.current)
      }
      if (!targetEditor) {
        targetEditor = editors[0]
      }

      if (targetEditor) {
        const [editorId, { play }] = targetEditor
        play()
        lastPlayedExampleRef.current = editorId
      }
    }
  }, [effectiveIsOpen])

  useEffect(() => {
    if (effectiveIsOpen) {
      window.addEventListener('keydown', handleDocsKeyDown)
      return () => window.removeEventListener('keydown', handleDocsKeyDown)
    }
  }, [effectiveIsOpen, handleDocsKeyDown])

  const items = useMemo((): DocItem[] => {
    const out: DocItem[] = []

    for (const t of tutorials) {
      const fileSlug = t.file.replace(/\.md$/i, '')
      const id = `tutorial-${slug(fileSlug)}`
      out.push({
        id,
        title: t.title,
        group: 'tutorial',
        searchText: `${t.title}\n${t.markdown}`,
        fileSlug,
        render: () => (
          <>
            <div className="mt-4">
              <MarkdownDoc idPrefix={id} markdown={t.markdown} />
            </div>
          </>
        ),
      })
    }

    const names = Object.keys(functionDefinitions).sort((a, b) => a.localeCompare(b))
    for (const name of names) {
      const def = functionDefinitions[name]!
      const id = apiId(name)
      const params = (def.parameters ?? [])
        .map(p =>
          `${p.name}:${p.type}${p.optional ? '?' : ''}${p.defaultValue !== undefined ? `=${p.defaultValue}` : ''}`
        )
        .join(', ')
      const sig = `${def.name}${def.type === 'variable' ? '' : `(${params})`}${
        def.returnType ? `: ${def.returnType}` : ''
      }`
      const examples = (def.examples ?? []).join('\n\n')
      const searchText = `${def.name}\n${sig}\n${def.description ?? ''}\n${params}\n${examples}`
      out.push({
        id,
        title: def.name,
        group: 'api',
        searchText,
        functionName: def.name,
        render: () => (
          <div className="flex flex-col gap-5">
            <h3 className="text-2xl font-semibold text-white -mt-4">{def.name}</h3>
            <SignatureHighlight signature={sig} />
            {def.description && (
              <p className="text-neutral-200 leading-relaxed whitespace-pre-line">{def.description}</p>
            )}
            {params.length > 0 && (
              <div className="text-sm text-neutral-200">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-600">
                      <th className="text-left py-2 px-2 font-semibold text-white">Parameter</th>
                      <th className="text-left py-2 px-2 font-semibold text-white">Type</th>
                      <th className="text-left py-2 px-2 font-semibold text-white">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {def.parameters.map((p, i) => (
                      <tr key={i} className="border-b border-neutral-700">
                        <td className="py-2 px-2">
                          <span className="font-[Space_Mono] text-white">{p.name}</span>
                          {p.optional && <span className="text-neutral-400 ml-1">(optional)</span>}
                        </td>
                        <td className="py-2 px-2">
                          <span className="font-[Space_Mono] text-neutral-300">{p.type}</span>
                          {p.defaultValue !== undefined && (
                            <span className="text-neutral-400 ml-2">= {String(p.defaultValue)}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-neutral-300">
                          {p.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(def.examples?.length ?? 0) > 0 && (
              <div className="mt-1">
                <div className="font-semibold text-white">Examples</div>
                <div className="mt-2 flex flex-col gap-3">
                  {def.examples?.map((ex, i) => {
                    const editorId = `${id}:ex:${i}`
                    return (
                      <InlineEditor key={editorId} id={editorId} initialCode={`\n${ex.split('\n').join('\n\n')}`} />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ),
      })
    }

    const about = [
      {
        id: 'about-contact',
        title: 'Contact',
        text: [
          'Email: support@loopmaster.app',
          'Discord: discord.gg/loopmaster',
          'If you found a bug or have a feature request, include your browser version and a short repro.',
        ].join('\n'),
      },
      {
        id: 'about-terms',
        title: 'Terms of Service',
        text: [
          'By using loopmaster, you agree to these Terms.',
          '',
          'You are responsible for any content you create, upload, share, or publish. Do not upload content that infringes copyrights, violates laws, or harms others.',
          '',
          'The service is provided “as is” without warranties. We may modify, suspend, or discontinue parts of the service at any time.',
          '',
          'To the extent permitted by law, loopmaster is not liable for indirect, incidental, or consequential damages, or loss of data, revenue, or profits.',
          '',
          'You may not abuse the service (e.g. attempting to overload systems, bypass access controls, or reverse engineer protected components).',
          '',
          'We may terminate or restrict access if we reasonably believe these Terms are violated.',
        ].join('\n'),
      },
      {
        id: 'about-privacy',
        title: 'Privacy Statement',
        text: [
          'loopmaster is built to be privacy-conscious.',
          '',
          'We may process basic technical data required to operate the service (e.g. device/browser info, request logs, crash diagnostics).',
          '',
          'If you create an account and publish loops, your public profile and published content are visible to others.',
          '',
          'We do not sell your personal information. We may share limited data with service providers strictly to operate the app (hosting, analytics, storage).',
          '',
          'You can request deletion of your account and associated personal data by contacting support.',
        ].join('\n'),
      },
    ] as const

    for (const a of about) {
      out.push({
        id: a.id,
        title: a.title,
        group: 'about',
        searchText: `${a.title}\n${a.text}`,
        render: () => (
          <>
            <h2 className="text-2xl font-semibold text-white">{a.title}</h2>
            <div className="mt-3 whitespace-pre-wrap text-neutral-200 leading-relaxed">
              {a.text}
            </div>
          </>
        ),
      })
    }

    return out
  }, [tutorials])

  useEffect(() => {
    const currentSelected = items.find(i => i.id === effectiveSelectedId)
    if (currentSelected?.group === 'tutorial') return
    if (externalSelectedId !== null) return // Don't auto-select if externally controlled
    setSelectedId(items[0]?.id ?? null)
  }, [items, effectiveSelectedId, externalSelectedId])

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) {
      return {
        list: items,
        byId: new Map(items.map(it => [it.id, it])),
      }
    }
    const scored = items
      .map(it => ({ it, score: fuzzyScore(q, it.searchText) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.it)
    return { list: scored, byId: new Map(scored.map(it => [it.id, it])) }
  }, [items, query])

  const sidebarGroups = useMemo(() => {
    const list = filtered.list
    const tutorials = list.filter(i => i.group === 'tutorial')
    const api = list.filter(i => i.group === 'api')
    const about = list.filter(i => i.group === 'about')
    return { tutorials, api, about }
  }, [filtered.list])

  const selected = useMemo(() => {
    if (!effectiveSelectedId) return null
    return items.find(i => i.id === effectiveSelectedId) ?? null
  }, [items, effectiveSelectedId])

  return (
    <>
      {!effectiveIsOpen && externalIsOpen === undefined && (
        <button
          className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-neutral-900 border border-[#333] flex items-center justify-center text-white"
          onClick={() => setIsOpen(true)}
          aria-label="Open documentation"
          title="Help & Documentation"
        >
          <QuestionIcon weight="regular" size={22} />
        </button>
      )}
      {!effectiveIsOpen && externalIsOpen !== undefined && (
        <Link
          to="/docs"
          className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-neutral-900 border border-[#333] flex items-center justify-center text-white"
          aria-label="Open documentation"
          title="Help & Documentation"
        >
          <QuestionIcon weight="regular" size={22} />
        </Link>
      )}

      <Modal
        isOpen={effectiveIsOpen}
        onClose={() => {
          if (externalIsOpen !== undefined) {
            onClose()
          }
          else {
            setIsOpen(false)
          }
        }}
        width="w-[96dvw]"
        maxWidth="max-w-none"
        className="h-[96dvh] rounded-lg overflow-hidden relative"
        contentClassName="h-full"
      >
        <div className="h-full w-full flex" onKeyDown={e => e.stopPropagation()} data-docs-container>
          <main className="flex-1 min-h-0 flex flex-col bg-black">
            <div className="sticky top-0 z-10 px-6 py-2 bg-black border-b border-[#333]">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Logo size="3em" text="loopmaster" />
                  <div className="text-neutral-300">
                    Audio programming — docs, tutorials, and playable examples.
                  </div>
                </div>
                <button
                  className="w-9 h-9 flex items-center justify-center text-neutral-300 hover:text-white bg-neutral-900 border border-[#333] rounded-full"
                  onClick={() => {
                    if (externalIsOpen !== undefined) {
                      onClose()
                    }
                    else {
                      setIsOpen(false)
                    }
                  }}
                  aria-label="Close documentation"
                  title="Close"
                >
                  <XIcon weight="light" size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <div className="max-w-[68rem] mx-auto px-6 py-8 flex flex-col gap-8">
                {filtered.list.length === 0 && query.trim() && (
                  <div className="text-neutral-300">
                    No matches for <span className="text-white font-mono">{query.trim()}</span>.
                  </div>
                )}

                {selected && (
                  <div className="border border-[#222] bg-neutral-950 rounded-lg p-5">
                    <div className="mt-3">
                      {selected.render()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>

          <aside className="w-auto border-r border-[#333] bg-neutral-950 overflow-auto">
            <div className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <MagnifyingGlassIcon size={18} className="text-neutral-400 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onInput={e => setQuery((e.currentTarget as HTMLInputElement).value)}
                  onKeyDown={e => e.stopPropagation()}
                  placeholder="Search docs…"
                  className="flex-1 bg-transparent outline-none text-white placeholder:text-neutral-500"
                />
              </div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">Navigation</div>
              {tutorialError && (
                <div className="mt-2 text-xs text-red-300">
                  Tutorials failed to load: {tutorialError}
                </div>
              )}

              {sidebarGroups.tutorials.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-semibold text-white">Tutorials</div>
                  <div className="mt-2 flex flex-col gap-1">
                    {sidebarGroups.tutorials.map(it => (
                      externalIsOpen !== undefined && it.fileSlug
                        ? (
                          <Link
                            key={it.id}
                            to={`/docs/tutorials/${it.fileSlug}`}
                            className={`block text-left text-sm hover:text-white whitespace-nowrap ${
                              it.id === effectiveSelectedId ? 'text-white' : 'text-neutral-300'
                            }`}
                          >
                            {it.title}
                          </Link>
                        )
                        : (
                          <button
                            key={it.id}
                            className={`text-left text-sm hover:text-white whitespace-nowrap ${
                              it.id === effectiveSelectedId ? 'text-white' : 'text-neutral-300'
                            }`}
                            onClick={() => setSelectedId(it.id)}
                          >
                            {it.title}
                          </button>
                        )
                    ))}
                  </div>
                </div>
              )}

              {sidebarGroups.about.length > 0 && (
                <div className="mt-5">
                  <div className="text-sm font-semibold text-white">About</div>
                  <div className="mt-2 flex flex-col gap-1">
                    {sidebarGroups.about.map(it => {
                      const aboutSlug = it.id.replace('about-', '')
                      return externalIsOpen !== undefined
                        ? (
                          <Link
                            key={it.id}
                            to={`/docs/about/${aboutSlug}`}
                            className={`block text-left text-sm hover:text-white whitespace-nowrap ${
                              it.id === effectiveSelectedId ? 'text-white' : 'text-neutral-300'
                            }`}
                          >
                            {it.title}
                          </Link>
                        )
                        : (
                          <button
                            key={it.id}
                            className={`text-left text-sm hover:text-white whitespace-nowrap ${
                              it.id === effectiveSelectedId ? 'text-white' : 'text-neutral-300'
                            }`}
                            onClick={() => setSelectedId(it.id)}
                          >
                            {it.title}
                          </button>
                        )
                    })}
                  </div>
                </div>
              )}

              {sidebarGroups.api.length > 0 && (
                <div className="mt-5">
                  <div className="text-sm font-semibold text-white">API</div>
                  <div className="mt-2 flex flex-col gap-1">
                    {sidebarGroups.api.map(it => {
                      const urlSlug = it.functionName ? functionNameToUrlSlug(it.functionName) : ''
                      return externalIsOpen !== undefined && it.functionName
                        ? (
                          <Link
                            key={it.id}
                            to={`/docs/api/${urlSlug}`}
                            className={`block text-left text-sm hover:text-white font-mono whitespace-nowrap ${
                              it.id === effectiveSelectedId ? 'text-white' : 'text-neutral-300'
                            }`}
                          >
                            {it.title}
                          </Link>
                        )
                        : (
                          <button
                            key={it.id}
                            className={`text-left text-sm hover:text-white font-mono whitespace-nowrap ${
                              it.id === effectiveSelectedId ? 'text-white' : 'text-neutral-300'
                            }`}
                            onClick={() => setSelectedId(it.id)}
                          >
                            {it.title}
                          </button>
                        )
                    })}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </Modal>
    </>
  )
}
