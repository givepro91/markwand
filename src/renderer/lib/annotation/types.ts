// v0.4 S7 — Annotation MVP.
// Sidecar JSON schema는 main 측 zod 스키마와 대칭 유지 (main/ipc/annotation.ts).

export interface TextQuoteSelector {
  type: 'TextQuote'
  exact: string
  prefix?: string
  suffix?: string
}

export interface TextPositionFallback {
  start: number
  end: number
}

export type AnnotationColor = 'yellow'

export interface Annotation {
  id: string
  selector: TextQuoteSelector
  positionFallback?: TextPositionFallback
  color: AnnotationColor
  createdAt: string
  // runtime only — 직렬화 제외. anchor 복원 실패 시 true.
  orphan?: boolean
}

export interface AnnotationFile {
  version: 1
  annotations: Annotation[]
}

export const CURRENT_ANNOTATION_VERSION = 1 as const
export const DEFAULT_ANNOTATION_COLOR: AnnotationColor = 'yellow'
