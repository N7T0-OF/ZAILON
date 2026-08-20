/**
 * Parser Markdown minimal et SÛR pour les Release Notes (sans dépendance).
 *
 * Contraintes (spec « Correctif urgent de la fenêtre Nouveautés », §13) :
 * - tout HTML brut est échappé (jamais de script / iframe / HTML arbitraire) ;
 * - les liens ne sont rendus que pour http(s):// (jamais javascript:) ;
 * - les images sont bornées par le CSS (max-width 100 %, hauteur auto) ;
 * - support : titres, listes, gras, code inline, blocs de code, liens, images,
 *   séparateurs, paragraphes.
 *
 * La logique est pure (aucun JSX) pour être testable par `node --test`.
 */

export type MarkdownToken =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'image'; alt: string; src: string }

export type MarkdownBlock =
  | { kind: 'heading'; level: 2 | 3 | 4; tokens: MarkdownToken[] }
  | { kind: 'paragraph'; tokens: MarkdownToken[] }
  | { kind: 'list'; items: MarkdownToken[][] }
  | { kind: 'codeBlock'; code: string }
  | { kind: 'rule' }

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const INLINE_TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g

/** Analyse une ligne en jetons inline (gras, code, liens, images, texte échappé). */
export function parseInline(raw: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = []
  let lastIndex = 0
  for (const match of raw.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0
    if (index > lastIndex) tokens.push({ kind: 'text', value: escapeHtml(raw.slice(lastIndex, index)) })
    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push({ kind: 'bold', value: escapeHtml(token.slice(2, -2)) })
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push({ kind: 'code', value: escapeHtml(token.slice(1, -1)) })
    } else if (token.startsWith('![')) {
      const content = token.slice(2, -1)
      const separator = content.indexOf('](')
      if (separator > 0) {
        const alt = content.slice(0, separator)
        const src = content.slice(separator + 2)
        if (/^https?:\/\//i.test(src)) tokens.push({ kind: 'image', alt: escapeHtml(alt), src })
      }
    } else if (token.startsWith('[')) {
      const content = token.slice(1, -1)
      const separator = content.indexOf('](')
      if (separator > 0) {
        const text = content.slice(0, separator)
        const href = content.slice(separator + 2)
        if (/^https?:\/\//i.test(href)) {
          tokens.push({ kind: 'link', text: escapeHtml(text), href })
        } else {
          tokens.push({ kind: 'text', value: escapeHtml(token) })
        }
      } else {
        tokens.push({ kind: 'text', value: escapeHtml(token) })
      }
    }
    lastIndex = index + token.length
  }
  if (lastIndex < raw.length) tokens.push({ kind: 'text', value: escapeHtml(raw.slice(lastIndex)) })
  return tokens
}

/** Analyse un texte Markdown en blocs (titres, listes, code, paragraphes…). */
export function parseMarkdown(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  const pushParagraph = (start: number, end: number) => {
    const content = lines.slice(start, end).join(' ').trim()
    if (content) blocks.push({ kind: 'paragraph', tokens: parseInline(content) })
  }

  while (index < lines.length) {
    const line = lines[index]

    // Bloc de code fencé.
    if (/^```/.test(line.trim())) {
      const fence = line.trim()
      index += 1
      const code: string[] = []
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1 // fermeture
      blocks.push({ kind: 'codeBlock', code: code.join('\n').replace(/^\n|\n$/g, '') })
      continue
    }

    // Titre.
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      blocks.push({ kind: 'heading', level: clamp(heading[1].length + 1, 2, 4) as 2 | 3 | 4, tokens: parseInline(heading[2]) })
      index += 1
      continue
    }

    // Séparateur.
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push({ kind: 'rule' })
      index += 1
      continue
    }

    // Liste.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: MarkdownToken[][] = []
      let paragraph: string[] = []
      const flushParagraph = () => {
        if (paragraph.length) {
          items.push(parseInline(paragraph.join(' ').trim()))
          paragraph = []
        }
      }
      while (index < lines.length) {
        const current = lines[index]
        const item = current.match(/^\s*[-*]\s+(.+)$/)
        if (item) {
          flushParagraph()
          items.push(parseInline(item[1]))
        } else if (current.trim() === '') {
          break
        } else {
          paragraph.push(current)
        }
        index += 1
      }
      flushParagraph()
      if (items.length) blocks.push({ kind: 'list', items })
      continue
    }

    // Paragraphe : accumuler jusqu'à une ligne vide ou un nouveau bloc.
    const start = index
    while (index < lines.length && lines[index].trim() !== '' && !/^(#{1,3}\s|```|---+\s*$|[-*]\s)/.test(lines[index])) index += 1
    pushParagraph(start, index)
    while (index < lines.length && lines[index].trim() === '') index += 1
  }

  return blocks
}

// Petit helper clamp (évite une dépendance) — Number.prototype n'est pas étendu.
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/** Nombre total d'items de listes (utilisé pour le toast des mises à jour mineures). */
export function countListItems(blocks: MarkdownBlock[]) {
  return blocks.reduce((total, block) => total + (block.kind === 'list' ? block.items.length : 0), 0)
}

/** Résumé : premières listes/paragraphes (≈ `maxItems` changements) + troncature. */
export function summarizeBlocks(blocks: MarkdownBlock[], maxItems = 8): { blocks: MarkdownBlock[]; truncated: boolean } {
  const summary: MarkdownBlock[] = []
  let collected = 0
  let truncated = false
  for (const block of blocks) {
    if (collected >= maxItems) {
      truncated = true
      break
    }
    if (block.kind === 'list') {
      const remaining = maxItems - collected
      const items = block.items.slice(0, remaining)
      collected += items.length
      if (block.items.length > items.length) truncated = true
      summary.push({ ...block, items })
    } else if (block.kind === 'heading' || block.kind === 'paragraph') {
      if (collected > 0 && block.kind === 'paragraph' && summary.filter(item => item.kind === 'paragraph').length >= 2) {
        truncated = true
        break
      }
      summary.push(block)
    }
  }
  return { blocks: summary, truncated }
}
