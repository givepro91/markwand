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
  // M2 (2026-04-21, U-M2-1 사용자 승인 scope): target 파일 content 의 sha256 hex.
  // verify 시점에 계산해 감사/디버깅용으로만 기록. 현재 ok/stale 판정에는 사용하지 않음 —
  // 판정은 mtime 기반 유지 (Plan §S2 축소안). 디렉토리는 undefined, 파일 읽기 실패 시 undefined.
  hashAtCheck?: string
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
  // 크기 한도(2MB) 초과로 건너뛴 파일 수 — 존재할 경우 UI 푸터에 안내.
  sizeSkipped?: number
}
