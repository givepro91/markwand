// 커스텀 문서 내 검색 — Electron native findInPage 대체.
//
// 이유: native findInPage는 매 네비게이션마다 ~400ms 고정 지연이 있고,
// 입력 중인 <input>의 포커스를 매치 DOM으로 훔쳐 한국어 IME 조합을 깨뜨린다.
//
// 전략: TreeWalker로 text node 순회 → 매치 Range 수집 → CSS Highlight API로 칠함.
// DOM을 변형하지 않으므로 rehype-highlight/mermaid SVG 구조를 건드리지 않고,
// 수백 Range 하이라이트도 수 ms 내 완료된다.
//
// CSS Highlight API는 Chromium 105+ 에서 지원. Electron 33은 Chromium 130+ 이므로 안전.

export interface FindState {
  /** 1-based 현재 매치 순번 (total=0이면 0) */
  active: number
  /** 전체 매치 수 */
  total: number
}

export interface FindController {
  /** 새 쿼리 검색. 매치 수 반환. */
  update(query: string): number
  /** 다음 매치로 이동 */
  next(): void
  /** 이전 매치로 이동 */
  prev(): void
  /** 하이라이트와 내부 상태 초기화 */
  clear(): void
  /** 현재 active/total 조회 */
  getState(): FindState
  /** active/total 변경 콜백 (next/prev/update 시 호출) */
  onChange(cb: (s: FindState) => void): () => void
  /** 파괴 — 리스너/하이라이트 정리 */
  destroy(): void
}

const HL_ALL = 'markwand-find-match'
const HL_ACTIVE = 'markwand-find-match-active'

// scroll 여백: find toolbar(검색 입력창 바)에 매치가 가려지지 않도록 상하에 확보하는 픽셀.
// ProjectView의 find toolbar 실제 높이는 ~40px이며, 뷰포트 안 판정 시 이 여백을 제외한다.
const SCROLL_VIEWPORT_PADDING = 40

function supportsCssHighlights(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
}

function collectRanges(container: HTMLElement, query: string): Range[] {
  if (!query) return []
  const needle = query.toLowerCase()
  const ranges: Range[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // 빈 text node 제외
      const v = node.nodeValue
      if (!v) return NodeFilter.FILTER_REJECT
      // <script>/<style> 내부 텍스트 제외 (SHOW_TEXT만 요청해도 DOM에 있으면 포함됨)
      const parent = node.parentElement
      if (parent) {
        const tag = parent.tagName
        if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let node: Node | null
  while ((node = walker.nextNode())) {
    const raw = node.nodeValue ?? ''
    const hay = raw.toLowerCase()
    let from = 0
    while (true) {
      const idx = hay.indexOf(needle, from)
      if (idx < 0) break
      const range = document.createRange()
      range.setStart(node, idx)
      range.setEnd(node, idx + needle.length)
      ranges.push(range)
      from = idx + needle.length
    }
  }
  return ranges
}

function isLiveRange(r: Range): boolean {
  // mermaid 늦은 렌더 등으로 text node가 교체되면 Range가 detach될 수 있다.
  // detach된 Range를 Highlight에 포함시키면 하이라이트가 그려지지 않거나 DOMException을 유발하므로 제외.
  return r.startContainer.isConnected && r.endContainer.isConnected
}

function applyHighlights(ranges: Range[], activeIndex: number): void {
  if (!supportsCssHighlights()) return
  const live = ranges.filter(isLiveRange)
  if (live.length === 0) {
    CSS.highlights.delete(HL_ALL)
    CSS.highlights.delete(HL_ACTIVE)
    return
  }
  CSS.highlights.set(HL_ALL, new Highlight(...live))
  const activeRange = activeIndex >= 0 && activeIndex < ranges.length ? ranges[activeIndex] : null
  if (activeRange && isLiveRange(activeRange)) {
    CSS.highlights.set(HL_ACTIVE, new Highlight(activeRange))
  } else {
    CSS.highlights.delete(HL_ACTIVE)
  }
}

function scrollRangeIntoView(container: HTMLElement, range: Range): void {
  if (!isLiveRange(range)) return
  const rangeRect = range.getBoundingClientRect()
  const cRect = container.getBoundingClientRect()
  // viewport 안에 이미 있으면 유지
  if (
    rangeRect.top >= cRect.top + SCROLL_VIEWPORT_PADDING &&
    rangeRect.bottom <= cRect.bottom - SCROLL_VIEWPORT_PADDING
  ) {
    return
  }
  // 상단에서 1/3 지점에 오도록 보정
  const offset = rangeRect.top - cRect.top + container.scrollTop - container.clientHeight / 3
  container.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' })
}

export function createFindController(container: HTMLElement): FindController {
  let ranges: Range[] = []
  let activeIdx = -1
  const listeners = new Set<(s: FindState) => void>()

  function emit(): void {
    const state = getState()
    listeners.forEach((cb) => cb(state))
  }

  function getState(): FindState {
    return {
      active: activeIdx >= 0 ? activeIdx + 1 : 0,
      total: ranges.length,
    }
  }

  function clear(): void {
    ranges = []
    activeIdx = -1
    if (supportsCssHighlights()) {
      CSS.highlights.delete(HL_ALL)
      CSS.highlights.delete(HL_ACTIVE)
    }
    emit()
  }

  function update(query: string): number {
    if (!query.trim()) {
      clear()
      return 0
    }
    ranges = collectRanges(container, query)
    activeIdx = ranges.length > 0 ? 0 : -1
    applyHighlights(ranges, activeIdx)
    if (activeIdx >= 0) scrollRangeIntoView(container, ranges[activeIdx])
    emit()
    return ranges.length
  }

  function move(delta: 1 | -1): void {
    if (ranges.length === 0) return
    activeIdx = (activeIdx + delta + ranges.length) % ranges.length
    applyHighlights(ranges, activeIdx)
    scrollRangeIntoView(container, ranges[activeIdx])
    emit()
  }

  return {
    update,
    next: () => move(1),
    prev: () => move(-1),
    clear,
    getState,
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    destroy() {
      clear()
      listeners.clear()
    },
  }
}
