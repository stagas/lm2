import { MagnifyingGlassIcon, QuestionIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Logo } from '../../../components/Logo.tsx'
import { Modal } from '../../../components/Modal.tsx'
import { functionDefinitions } from '../function-definitions.ts'
import { fuzzyScore } from './fuzzy.ts'
import { InlineEditor } from './InlineEditor.tsx'
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

export function Docs() {
  const [isOpen, setIsOpen] = useState(false)
  const [tutorials, setTutorials] = useState<Tutorial[]>([])
  const [tutorialError, setTutorialError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

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
    if (!isOpen) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [isOpen])

  const items = useMemo((): DocItem[] => {
    const out: DocItem[] = []

    for (const t of tutorials) {
      const id = `tutorial-${slug(t.file)}`
      out.push({
        id,
        title: t.title,
        group: 'tutorial',
        searchText: `${t.title}\n${t.markdown}`,
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
      const sig = `${def.name}(${params})${def.returnType ? ` -> ${def.returnType}` : ''}`
      const examples = (def.examples ?? []).join('\n\n')
      const searchText = `${def.name}\n${sig}\n${def.description ?? ''}\n${params}\n${examples}`
      out.push({
        id,
        title: def.name,
        group: 'api',
        searchText,
        render: () => (
          <div className="flex flex-col gap-2">
            <h3 className="text-xl font-semibold text-white">{def.name}</h3>
            <div className="text-sm text-neutral-300 font-mono">{sig}</div>
            {def.description && <p className="text-neutral-200 leading-relaxed">{def.description}</p>}
            {params.length > 0 && (
              <div className="text-sm text-neutral-200">
                <div className="font-semibold text-white">Parameters</div>
                <ul className="mt-1 list-disc pl-6">
                  {def.parameters.map((p, i) => (
                    <li key={i}>
                      <span className="font-mono text-white">{p.name}</span>
                      <span className="text-neutral-400">:</span>
                      <span className="font-mono text-neutral-300">{p.type}</span>
                      {p.optional && <span className="text-neutral-400">(optional)</span>}
                      {p.defaultValue !== undefined && (
                        <span className="text-neutral-400">, default {String(p.defaultValue)}</span>
                      )}
                      {p.description && <span className="text-neutral-300">— {p.description}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(def.examples?.length ?? 0) > 0 && (
              <div className="mt-1">
                <div className="font-semibold text-white">Examples</div>
                <div className="mt-2 flex flex-col gap-3">
                  {def.examples?.map((ex, i) => <InlineEditor key={i} id={`${id}:ex:${i}`} initialCode={`\n${ex}`} />)}
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
    if (selectedId && items.some(i => i.id === selectedId)) return
    setSelectedId(items[0]?.id ?? null)
  }, [items, selectedId])

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
    if (!selectedId) return null
    return items.find(i => i.id === selectedId) ?? null
  }, [items, selectedId])

  return (
    <>
      <button
        className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-neutral-900 border border-[#333] flex items-center justify-center text-white"
        onClick={() => setIsOpen(true)}
        aria-label="Open documentation"
        title="Help & Documentation"
      >
        <QuestionIcon weight="regular" size={22} />
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        width="w-[96dvw]"
        maxWidth="max-w-none"
        className="h-[96dvh] rounded-lg overflow-hidden relative"
        contentClassName="h-full"
      >
        <div className="h-full w-full flex" onKeyDown={e => e.stopPropagation()}>
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
                      <button
                        key={it.id}
                        className={`text-left text-sm hover:text-white whitespace-nowrap ${
                          it.id === selectedId ? 'text-white' : 'text-neutral-300'
                        }`}
                        onClick={() => setSelectedId(it.id)}
                      >
                        {it.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {sidebarGroups.about.length > 0 && (
                <div className="mt-5">
                  <div className="text-sm font-semibold text-white">About</div>
                  <div className="mt-2 flex flex-col gap-1">
                    {sidebarGroups.about.map(it => (
                      <button
                        key={it.id}
                        className={`text-left text-sm hover:text-white whitespace-nowrap ${
                          it.id === selectedId ? 'text-white' : 'text-neutral-300'
                        }`}
                        onClick={() => setSelectedId(it.id)}
                      >
                        {it.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {sidebarGroups.api.length > 0 && (
                <div className="mt-5">
                  <div className="text-sm font-semibold text-white">API</div>
                  <div className="mt-2 flex flex-col gap-1">
                    {sidebarGroups.api.map(it => (
                      <button
                        key={it.id}
                        className={`text-left text-sm hover:text-white font-mono whitespace-nowrap ${
                          it.id === selectedId ? 'text-white' : 'text-neutral-300'
                        }`}
                        onClick={() => setSelectedId(it.id)}
                      >
                        {it.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

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
                  onClick={() => setIsOpen(false)}
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
        </div>
      </Modal>
    </>
  )
}
