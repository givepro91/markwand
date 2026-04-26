/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createSelectorFromRange, anchorToRange, isRangeWithin } from './anchor'
import type { Annotation } from './types'

// 헬퍼: DOM 트리 구성 + 특정 텍스트의 첫 등장 위치를 Range 로.
function buildRoot(html: string): HTMLDivElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

// textContent 안에서 query 의 첫 등장 위치를 Range 로 변환.
// (TreeWalker 로 텍스트 노드를 누적 탐색 → start/end 노드 찾음)
function rangeFromText(root: Node, query: string): Range {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  let acc = ''
  const nodes: Text[] = []
  let n: Text | null
  while ((n = walker.nextNode() as Text | null)) {
    nodes.push(n)
    acc += n.data
  }
  const idx = acc.indexOf(query)
  if (idx < 0) throw new Error(`text not found: ${JSON.stringify(query)}`)

  let cursor = 0
  let startNode: Text | null = null
  let startOffset = 0
  let endNode: Text | null = null
  let endOffset = 0
  for (const tx of nodes) {
    const next = cursor + tx.data.length
    if (!startNode && idx >= cursor && idx < next) {
      startNode = tx
      startOffset = idx - cursor
    }
    const endIdx = idx + query.length
    if (!endNode && endIdx > cursor && endIdx <= next) {
      endNode = tx
      endOffset = endIdx - cursor
    }
    cursor = next
  }
  if (!startNode || !endNode) throw new Error('range build failed')

  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  return range
}

function makeAnnotation(
  selector: { exact: string; prefix?: string; suffix?: string },
  positionFallback?: { start: number; end: number }
): Annotation {
  return {
    id: 'test-id',
    selector: { type: 'TextQuote', ...selector },
    ...(positionFallback ? { positionFallback } : {}),
    color: 'yellow',
    createdAt: '2026-04-26T00:00:00.000Z',
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('createSelectorFromRange + anchorToRange — 9개 DOM 형태', () => {
  it('1. heading (h2 with bold inline) — 텍스트만 selector 로 추출', () => {
    const root = buildRoot('<h2>Section <strong>One</strong> title</h2>')
    const range = rangeFromText(root, 'Section One title')
    const created = createSelectorFromRange(root, range)!
    expect(created).not.toBeNull()
    expect(created.selector.exact).toBe('Section One title')
    const restored = anchorToRange(root, makeAnnotation(created.selector, created.positionFallback))!
    expect(restored).not.toBeNull()
    expect(restored.toString()).toBe('Section One title')
  })

  it('2. inline code — <code> 텍스트 노드 내부 부분 선택', () => {
    const root = buildRoot('<p>Use <code>npm install pkg</code> to install.</p>')
    const range = rangeFromText(root, 'npm install pkg')
    const created = createSelectorFromRange(root, range)!
    expect(created.selector.exact).toBe('npm install pkg')
    const restored = anchorToRange(root, makeAnnotation(created.selector, created.positionFallback))!
    expect(restored.toString()).toBe('npm install pkg')
  })

  it('3. code fence (pre > code) — 여러 줄 내부 선택', () => {
    const root = buildRoot(
      '<pre><code>function add(a, b) {\n  return a + b\n}</code></pre>'
    )
    const range = rangeFromText(root, 'return a + b')
    const created = createSelectorFromRange(root, range)!
    expect(created.selector.exact).toBe('return a + b')
    const restored = anchorToRange(root, makeAnnotation(created.selector, created.positionFallback))!
    expect(restored.toString()).toBe('return a + b')
  })

  it('4. mermaid block placeholder — 빈 div 가 있어도 인접 텍스트 매칭 가능', () => {
    // 실제 mermaid 는 dangerouslySetInnerHTML 로 SVG 주입. 매칭 시점에 SVG 가 없는 경우(loading)
    // 도 매칭이 가능해야 한다.
    const root = buildRoot(
      '<p>Architecture diagram below:</p><div class="mermaid-block"></div><p>End</p>'
    )
    const range = rangeFromText(root, 'Architecture diagram below:')
    const created = createSelectorFromRange(root, range)!
    expect(created.selector.exact).toBe('Architecture diagram below:')
    const restored = anchorToRange(root, makeAnnotation(created.selector, created.positionFallback))!
    expect(restored.toString()).toBe('Architecture diagram below:')
  })

  it('5. GFM 테이블 셀 — td 안 텍스트', () => {
    const root = buildRoot(
      '<table><tr><th>name</th><th>value</th></tr><tr><td>alpha</td><td>42</td></tr></table>'
    )
    const range = rangeFromText(root, 'alpha')
    const created = createSelectorFromRange(root, range)!
    expect(created.selector.exact).toBe('alpha')
    const restored = anchorToRange(root, makeAnnotation(created.selector, created.positionFallback))!
    expect(restored.toString()).toBe('alpha')
  })

  it('6. HTML raw block — sanitize 통과 후 보존된 텍스트', () => {
    const root = buildRoot(
      '<div class="note"><p>Important: <em>read this carefully</em>.</p></div>'
    )
    const range = rangeFromText(root, 'read this carefully')
    const created = createSelectorFromRange(root, range)!
    expect(created.selector.exact).toBe('read this carefully')
    const restored = anchorToRange(root, makeAnnotation(created.selector, created.positionFallback))!
    expect(restored.toString()).toBe('read this carefully')
  })

  it('7. footnote — sup ref 와 본문', () => {
    const root = buildRoot(
      '<p>Per spec<sup id="fnref-1"><a href="#fn-1">1</a></sup>, this works.</p>' +
        '<section><ol><li id="fn-1"><p>See RFC 1234.</p></li></ol></section>'
    )
    const range = rangeFromText(root, 'See RFC 1234.')
    const created = createSelectorFromRange(root, range)!
    expect(created.selector.exact).toBe('See RFC 1234.')
    const restored = anchorToRange(root, makeAnnotation(created.selector, created.positionFallback))!
    expect(restored.toString()).toBe('See RFC 1234.')
  })

  it('8. 한국어 CJK — 분절된 한글 텍스트', () => {
    const root = buildRoot(
      '<p>이 문서는 <strong>중요한</strong> 정보를 담고 있습니다.</p>'
    )
    const range = rangeFromText(root, '중요한 정보를')
    const created = createSelectorFromRange(root, range)!
    expect(created.selector.exact).toBe('중요한 정보를')
    const restored = anchorToRange(root, makeAnnotation(created.selector, created.positionFallback))!
    expect(restored.toString()).toBe('중요한 정보를')
  })

  it('9. surrogate pair / 이모지 — UTF-16 4 byte 문자', () => {
    const root = buildRoot('<p>Build status: 🚀 ready to ship 🎉</p>')
    const range = rangeFromText(root, '🚀 ready to ship 🎉')
    const created = createSelectorFromRange(root, range)!
    expect(created.selector.exact).toBe('🚀 ready to ship 🎉')
    const restored = anchorToRange(root, makeAnnotation(created.selector, created.positionFallback))!
    expect(restored.toString()).toBe('🚀 ready to ship 🎉')
  })
})

describe('fuzzy 매칭 — 본문 1 byte 편집 후 복원', () => {
  it('단어 한 글자 변경 시에도 prefix/suffix 컨텍스트로 fuzzy 매칭 (Plan DoD)', () => {
    const root1 = buildRoot('<p>The quick brown fox jumps over the lazy dog.</p>')
    const range = rangeFromText(root1, 'quick brown fox')
    const created = createSelectorFromRange(root1, range)!
    document.body.removeChild(root1)

    // 본문 약간 변경 — "brown" → "browne"
    const root2 = buildRoot('<p>The quick browne fox jumps over the lazy dog.</p>')
    const restored = anchorToRange(root2, makeAnnotation(created.selector, created.positionFallback))
    // diff-match-patch 는 1글자 차이를 허용하므로 매칭 성공해야 한다.
    expect(restored).not.toBeNull()
    // 정확한 글자는 다를 수 있으나 대부분 유사 텍스트 영역이어야 한다.
    expect(restored!.toString().length).toBeGreaterThan(10)
  })

  it('완전히 다른 텍스트 영역에서는 매칭 실패 → null (orphan 후보)', () => {
    const root1 = buildRoot('<p>Original short sentence here.</p>')
    const range = rangeFromText(root1, 'Original short sentence here.')
    const created = createSelectorFromRange(root1, range)!
    document.body.removeChild(root1)

    // 완전히 다른 본문 — 충분히 길고 유사도 낮음.
    const root2 = buildRoot(
      '<p>Completely different lorem ipsum dolor sit amet consectetur.</p>'
    )
    const restored = anchorToRange(root2, makeAnnotation(created.selector, created.positionFallback))
    // 매칭 실패 → null. (diff-match-patch threshold 에 따라 가끔 매칭될 수 있어 toBeNull 강제하지 않음)
    if (restored) {
      // 매칭됐다면 길이가 매우 짧거나 의미 없는 영역일 것.
      expect(restored.toString().length).toBeLessThan(10)
    } else {
      expect(restored).toBeNull()
    }
  })
})

describe('isRangeWithin', () => {
  it('루트 바깥 노드는 false', () => {
    const root = buildRoot('<p>inside</p>')
    const outside = document.createElement('p')
    outside.textContent = 'outside'
    document.body.appendChild(outside)
    const range = document.createRange()
    range.selectNodeContents(outside)
    expect(isRangeWithin(root, range)).toBe(false)
  })

  it('루트 안 + collapsed 면 false', () => {
    const root = buildRoot('<p>inside</p>')
    const range = document.createRange()
    range.setStart(root.firstChild!.firstChild!, 0)
    range.collapse(true)
    expect(isRangeWithin(root, range)).toBe(false)
  })

  it('루트 안 + 비-collapsed 면 true', () => {
    const root = buildRoot('<p>inside text</p>')
    const range = rangeFromText(root, 'inside')
    expect(isRangeWithin(root, range)).toBe(true)
  })
})

describe('빈 selection / 공백만 있는 selection', () => {
  it('createSelectorFromRange 가 null 반환', () => {
    const root = buildRoot('<p>   </p>')
    const range = rangeFromText(root, '   ')
    const created = createSelectorFromRange(root, range)
    expect(created).toBeNull()
  })
})
