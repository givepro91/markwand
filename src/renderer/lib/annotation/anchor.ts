import * as textQuote from 'dom-anchor-text-quote'
import * as textPosition from 'dom-anchor-text-position'
import type { Annotation, TextQuoteSelector, TextPositionFallback } from './types'

// Range → selector (exact/prefix/suffix + start/end).
// prefix/suffix 가 없으면 exact 만 반환. 빈 텍스트는 null.
export function createSelectorFromRange(
  root: Node,
  range: Range
): { selector: TextQuoteSelector; positionFallback: TextPositionFallback } | null {
  const text = range.toString()
  if (!text || !text.trim()) return null
  const positionFallback = textPosition.fromRange(root, range)
  const quote = textQuote.fromRange(root, range)
  const selector: TextQuoteSelector = {
    type: 'TextQuote',
    exact: quote.exact,
    ...(quote.prefix ? { prefix: quote.prefix } : {}),
    ...(quote.suffix ? { suffix: quote.suffix } : {}),
  }
  return { selector, positionFallback }
}

// selector → Range. positionFallback.start 를 hint 로 전달해 근처 매칭 우선.
// dom-anchor-text-quote 는 options.hint(텍스트 오프셋 정수) 만 인식. {start,end} 객체는 무시됨.
// 실패(fuzzy 도 안됨) 시 null — 호출부가 orphan 처리.
export function anchorToRange(root: Node, annotation: Annotation): Range | null {
  const hint = annotation.positionFallback?.start
  // dom-anchor-text-quote 는 prefix/suffix 를 string 으로 가정한다 (빈 문자열도 명시 필요).
  // sidecar 에 omit 된 경우 ''로 복원해야 매칭 안정성 확보.
  const querySelector = {
    exact: annotation.selector.exact,
    prefix: annotation.selector.prefix ?? '',
    suffix: annotation.selector.suffix ?? '',
  }
  try {
    const range = textQuote.toRange(
      root,
      querySelector,
      typeof hint === 'number' ? { hint } : undefined
    )
    return range ?? null
  } catch {
    return null
  }
}

// Range 가 root 내부에 완전히 포함돼 있고 시작/끝이 같지 않은지 검사.
export function isRangeWithin(root: Node, range: Range): boolean {
  if (range.collapsed) return false
  return (
    root.contains(range.startContainer) && root.contains(range.endContainer)
  )
}
