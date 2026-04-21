export type ReferenceKind = 'at' | 'hint' | 'inline'

export interface Reference {
  raw: string
  resolvedPath: string
  // inline/hint 상대 경로는 docDir / projectRoot 둘 다 후보. resolvedPath 가 없으면 fallbackPath 도 시도.
  fallbackPath?: string
  kind: ReferenceKind
  line: number
  col: number
}

// ok:      대상이 존재하고 (파일이면) doc 이후 수정 안 됨 / (디렉토리면) 그냥 존재
// missing: 대상이 존재하지 않음 (삭제/이름 변경/오타)
// stale:   대상 파일이 존재하나 doc 이후 수정됨 (디렉토리에는 적용 안 함 — 노이즈 방지)
export type DriftStatus = 'ok' | 'missing' | 'stale'

export interface VerifiedReference extends Reference {
  status: DriftStatus
  targetMtime?: number
  // target 이 디렉토리이면 true. 디렉토리는 내부 추가·삭제로 mtime 이 항상 갱신되므로 stale 판정 제외.
  isDirectory?: boolean
}

export interface DriftReport {
  docPath: string
  docMtime: number
  projectRoot: string
  references: VerifiedReference[]
  counts: {
    ok: number
    missing: number
    stale: number
  }
  verifiedAt: number
}
