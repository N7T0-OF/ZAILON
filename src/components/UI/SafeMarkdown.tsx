import { Fragment } from 'react'
import { parseMarkdown, type MarkdownBlock, type MarkdownToken } from '../../lib/safeMarkdown'

function Inline({ tokens }: { tokens: MarkdownToken[] }) {
  return <>{tokens.map((token, index) => {
    switch (token.kind) {
      case 'text':
        return <Fragment key={index}>{token.value}</Fragment>
      case 'bold':
        return <strong key={index} className="font-semibold text-white/85">{token.value}</strong>
      case 'code':
        return <code key={index} className="rounded bg-white/[0.07] px-1 py-0.5 font-mono text-[10.5px] text-gold/90">{token.value}</code>
      case 'link':
        return <a key={index} href={token.href} target="_blank" rel="noreferrer" className="text-gold underline decoration-gold/40 underline-offset-2 hover:text-gold-light">{token.text}</a>
      case 'image':
        // Images bornées : jamais plus large que la zone, hauteur proportionnelle.
        return <img key={index} src={token.src} alt={token.alt} className="my-2 block max-h-40 max-w-full rounded-lg object-contain" loading="lazy" />
      default:
        return null
    }
  })}</>
}

function Block({ block }: { block: MarkdownBlock }) {
  switch (block.kind) {
    case 'heading':
      if (block.level === 2) return <h3 className="mt-4 mb-1.5 text-[13px] font-bold text-white/90 first:mt-0">{<Inline tokens={block.tokens} />}</h3>
      if (block.level === 3) return <h4 className="mt-3 mb-1 text-[12px] font-semibold text-white/80 first:mt-0">{<Inline tokens={block.tokens} />}</h4>
      return <h5 className="mt-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/65 first:mt-0">{<Inline tokens={block.tokens} />}</h5>
    case 'paragraph':
      return <p className="my-1.5 leading-relaxed text-white/62 first:mt-0 last:mb-0"><Inline tokens={block.tokens} /></p>
    case 'list':
      return <ul className="my-1.5 space-y-1 pl-4">{block.items.map((item, index) => (
        <li key={index} className="list-disc leading-relaxed text-white/62 marker:text-gold/60"><Inline tokens={item} /></li>
      ))}</ul>
    case 'codeBlock':
      return <pre className="my-2 overflow-x-auto rounded-lg bg-black/35 p-2.5 font-mono text-[10.5px] leading-relaxed text-white/70"><code>{block.code}</code></pre>
    case 'rule':
      return <hr className="my-3 border-white/[0.08]" />
    default:
      return null
  }
}

/** Affiche du Markdown sûr (Release Notes, changelogs). HTML échappé, aucune exécution. */
export function SafeMarkdown({ text, blocks }: { text?: string; blocks?: MarkdownBlock[] }) {
  const source = blocks ?? parseMarkdown(text ?? '')
  if (source.length === 0) return <p className="text-xs leading-relaxed text-white/45">Aucune note fournie pour cette version.</p>
  return <div className="text-xs">{source.map((block, index) => <Block key={index} block={block} />)}</div>
}
