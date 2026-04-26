declare module 'dom-anchor-text-quote' {
  export interface TextQuoteSelectorShape {
    exact: string
    prefix?: string
    suffix?: string
  }
  // README: options.hint 는 텍스트 오프셋(정수). diff-match-patch loc 으로 전달.
  export function fromRange(root: Node, range: Range): TextQuoteSelectorShape
  export function toRange(
    root: Node,
    selector: TextQuoteSelectorShape,
    options?: { hint?: number }
  ): Range | null
  export function fromTextPosition(
    root: Node,
    selector: { start: number; end: number }
  ): TextQuoteSelectorShape
  export function toTextPosition(
    root: Node,
    selector: TextQuoteSelectorShape,
    options?: { hint?: number }
  ): { start: number; end: number } | null
}

declare module 'dom-anchor-text-position' {
  export function fromRange(root: Node, range: Range): { start: number; end: number }
  export function toRange(
    root: Node,
    selector: { start: number; end: number }
  ): Range | null
}
