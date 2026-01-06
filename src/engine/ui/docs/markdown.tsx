import { Fragment } from 'preact'
import { InlineEditor } from './InlineEditor.tsx'

type MdNode =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'code'; code: string; id: string }

function parseMarkdown(src: string, idPrefix: string): MdNode[] {
  const out: MdNode[] = []

  let pos = 0
  let codeIndex = 0
  while (pos < src.length) {
    const fenceStart = src.indexOf('```', pos)
    if (fenceStart === -1) {
      pushText(src.slice(pos))
      break
    }
    pushText(src.slice(pos, fenceStart))
    const fenceEnd = src.indexOf('```', fenceStart + 3)
    if (fenceEnd === -1) {
      pushText(src.slice(fenceStart))
      break
    }
    const raw = src.slice(fenceStart + 3, fenceEnd)
    const code = raw.replace(/^\w+\n/, '').trim()
    out.push({ type: 'code', code, id: `${idPrefix}:code:${codeIndex++}` })
    pos = fenceEnd + 3
  }

  return out

  function pushText(text: string) {
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    let i = 0
    while (i < lines.length) {
      while (i < lines.length && !lines[i]!.trim()) i++
      if (i >= lines.length) break

      const line = lines[i]!
      const h = line.match(/^(#{1,3})\s+(.*)$/)
      if (h) {
        const level = h[1]!.length as 1 | 2 | 3
        out.push({ type: 'heading', level, text: h[2]!.trim() })
        i++
        continue
      }

      if (line.trim().startsWith('- ')) {
        const items: string[] = []
        while (i < lines.length && lines[i]!.trim().startsWith('- ')) {
          items.push(lines[i]!.trim().slice(2).trim())
          i++
        }
        out.push({ type: 'list', items })
        continue
      }

      const parts: string[] = []
      while (i < lines.length && lines[i]!.trim() && !lines[i]!.trim().startsWith('- ')) {
        parts.push(lines[i]!.trim())
        i++
      }
      out.push({ type: 'paragraph', text: parts.join(' ') })
    }
  }
}

export function MarkdownDoc({ idPrefix, markdown }: { idPrefix: string; markdown: string }) {
  const nodes = parseMarkdown(markdown, idPrefix)
  return (
    <div className="flex flex-col gap-3">
      {nodes.map((n, i) => {
        if (n.type === 'code') {
          return <InlineEditor key={`${n.id}:${i}`} id={n.id} initialCode={n.code} />
        }
        if (n.type === 'heading') {
          const Tag = (n.level === 1 ? 'h2' : n.level === 2 ? 'h3' : 'h4') as any
          const cls = n.level === 1
            ? 'text-2xl font-semibold'
            : n.level === 2
              ? 'text-xl font-semibold'
              : 'text-lg font-semibold'
          return (
            <Tag key={i} className={`${cls} text-white`}>
              {n.text}
            </Tag>
          )
        }
        if (n.type === 'list') {
          return (
            <ul key={i} className="list-disc pl-6 text-neutral-200">
              {n.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} className="text-neutral-200 leading-relaxed">
            {n.text}
          </p>
        )
      })}
    </div>
  )
}

