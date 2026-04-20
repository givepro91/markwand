export type ReferenceKind = 'at' | 'hint' | 'inline'

export interface Reference {
  raw: string
  resolvedPath: string
  kind: ReferenceKind
  line: number
  col: number
}

// ok: 대상 파일이 존재하고 doc 작성 시점 이후 수정되지 않음
// missing: 대상 파일이 존재하지 않음 (삭제/이름 변경/오타)
// stale: 대상 파일이 존재하나 doc 이후 수정됨 (내용이 doc 설명과 달라졌을 가능성)
export type DriftStatus = 'ok' | 'missing' | 'stale'

export interface VerifiedReference extends Reference {
  status: DriftStatus
  targetMtime?: number
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
