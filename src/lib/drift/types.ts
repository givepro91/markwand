export type ReferenceKind = 'at' | 'hint' | 'inline' | 'plain'

export interface Reference {
  raw: string
  resolvedPath: string
  // inline/hint 상대 경로는 docDir / projectRoot 둘 다 후보. resolvedPath 가 없으면 fallbackPath 도 시도.
  fallbackPath?: string
  // 추가 후보들. 예: projectRoot 가 `/repo/apps/lbd` 이고 문서가 `apps/lbd/src/foo.ts` 를
  // 언급하면 `/repo/apps/lbd/src/foo.ts` 도 시도한다.
  fallbackPaths?: string[]
  // 파일명만 적힌 코드 참조(`toast-provider.tsx`)는 docDir/projectRoot 직접 stat 이후
  // 로컬 프로젝트 파일 시스템에서 basename lookup 을 시도한다. SSH 는 성능상 전역 탐색 제외.
  lookupBasename?: string
  // 축약된 소스 루트 경로(`screens/Today.tsx`, `seed/sessionDetail.ts`)는
  // docDir/projectRoot 직접 stat 이후 로컬 프로젝트 안에서 같은 suffix 를 한 번 더 찾는다.
  lookupSuffix?: string
  // false면 대상이 존재할 때만 관계로 인정하고, 없을 때는 missing으로 보고하지 않는다.
  // 예: `origin/main`, `path/posix`, `docs/` 처럼 경로처럼 보이지만 실제 파일 참조인지 애매한 토큰.
  reportMissing?: boolean
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
