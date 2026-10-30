// Tests unitaires du parser Markdown sûr des Release Notes (fix modale débordante).
//   node --test .github/scripts/test-safe-markdown.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countListItems, escapeHtml, parseInline, parseMarkdown, summarizeBlocks } from '../../src/lib/safeMarkdown.ts'

test('escapeHtml neutralise le HTML arbitraire', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;')
  assert.equal(escapeHtml('a & b'), 'a &amp; b')
})

test('parseInline : gras, code, lien https, image bornée', () => {
  const tokens = parseInline('Voici **un gras**, du `code` et [un lien](https://example.com) ![img](https://example.com/x.png)')
  assert.equal(tokens.length, 8)
  assert.deepEqual(tokens[1], { kind: 'bold', value: 'un gras' })
  assert.deepEqual(tokens[3], { kind: 'code', value: 'code' })
  assert.deepEqual(tokens[5], { kind: 'link', text: 'un lien', href: 'https://example.com' })
  assert.deepEqual(tokens[7], { kind: 'image', alt: 'img', src: 'https://example.com/x.png' })
})

test('parseInline : lien non-http rendu comme texte (jamais javascript:)', () => {
  const tokens = parseInline('[piège](javascript:alert(1))')
  assert.ok(tokens.length >= 1)
  assert.ok(tokens.every(token => token.kind === 'text'))
})

test('parseMarkdown : titres, listes, séparateurs, blocs de code', () => {
  const blocks = parseMarkdown('# Titre\n\n- un\n- deux\n\n---\n\n```\nlet x = 1\n```\n\nParagraphe final.')
  const kinds = blocks.map(block => block.kind)
  assert.deepEqual(kinds, ['heading', 'list', 'rule', 'codeBlock', 'paragraph'])
  assert.equal((blocks[1] as { kind: 'list'; items: unknown[] }).items.length, 2)
  assert.equal((blocks[3] as { kind: 'codeBlock'; code: string }).code, 'let x = 1')
})

test('parseMarkdown : le HTML dans le texte reste échappé', () => {
  const blocks = parseMarkdown('<b>pas gras</b>')
  const paragraph = blocks[0]
  assert.equal(paragraph.kind, 'paragraph')
  const tokens = (paragraph as { kind: 'paragraph'; tokens: { kind: string; value: string }[] }).tokens
  assert.equal(tokens[0].kind, 'text')
  assert.equal(tokens[0].value, '&lt;b&gt;pas gras&lt;/b&gt;')
})

test('parseMarkdown : texte non vide produit au moins un paragraphe', () => {
  assert.ok(parseMarkdown('Une seule ligne.').length > 0)
  assert.equal(parseMarkdown('   ').length, 0)
})

test('résumé : un long changelog reste pliable', () => {
  const blocks = parseMarkdown(Array.from({ length: 20 }, (_, index) => `- changement ${index + 1}`).join('\n'))
  const { blocks: summary, truncated } = summarizeBlocks(blocks, 8)
  assert.equal(summary.length, 1)
  const items = (summary[0] as { kind: 'list'; items: unknown[] }).items
  assert.equal(items.length, 8)
  assert.equal(truncated, true)
  assert.equal(countListItems(blocks), 20)
})
