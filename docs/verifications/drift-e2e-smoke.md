# Drift Verifier — Headless E2E Smoke

- **Date**: 2026-04-21
- **Executor**: Nova Orbit (human-in-loop)
- **Scope**: `drift:verify` 핸들러 핵심 로직 (extractor → fs.stat → ok/missing/stale 판정)
- **Script**: `scripts/drift-smoke.ts` (`pnpm exec tsx scripts/drift-smoke.ts`)
- **실행 환경**: macOS Darwin 25.2.0, Node v24.14.1, Electron 외부 (IPC 경계 제외)

## 결과: 6/6 PASS

| # | 시나리오 | 기대 | 판정 |
|---|----------|------|------|
| 1 | mixed: `@/ok.ts` (ok) + `@/stale.ts` (target mtime > doc mtime) + `@/missing.ts` (없음) | counts={ok:1, stale:1, missing:1} | ✅ PASS |
| 2 | `@/deep/nested/file.ts` resolve — projectRoot 기반 절대 경로 변환 | resolvedPath 정확 매치 | ✅ PASS |
| 3 | 2MB 초과 문서 → 빈 리포트 반환 (핸들러 emptyReport 경로) | empty=true | ✅ PASS |
| 4 | 코드블록 첫 줄 힌트 `// a/b.ts` → kind=hint, status=ok | hint 추출 + ok | ✅ PASS |
| 5 | 인라인 백틱 `` `utils/helper.ts` `` → kind=inline | inline 추출 + ok | ✅ PASS |
| 6 | 참조 없는 평문 문서 → 빈 refs, 모든 counts=0 | refs=0 | ✅ PASS |

## 검증 범위 (covered)

- Reference Extractor 파서 (at / hint / inline 3종) 의 실제 파일 시스템 대상 resolve 정확성
- `fs.stat` 성공 시 mtime 비교로 `ok` vs `stale` 분기
- `fs.stat` 실패(ENOENT) 시 `missing` 폴백
- `MAX_DRIFT_FILE_BYTES` (2MB) 게이트로 대형 문서 빈 리포트 폴백
- counts 집계 정확성 (references[] 를 status 별로 카운트)

## 검증 외 (not covered)

이 smoke 는 IPC 이전의 **순수 함수 계약**만 본다. 아래는 GUI 또는 실제 Electron 런타임 필요:

- `assertInWorkspace` path-traversal 차단 (validators 테스트에서 별도 커버)
- `ipcMain.handle('drift:verify', ...)` 의 zod 입력 검증 경로
- React 렌더러 측 `useDrift` 훅의 debounce/concurrency/언마운트 가드 — React 테스트 환경 필요
- DriftPanel UI 상호작용 (토글/재검증/무시) — Playwright 등 E2E 도구 필요
- chokidar fs:change 이벤트 → 자동 재검증 플로우

## Known Limitations (스크립트 주석 반영)

1. **FS mtime 정밀도**: FAT32 / 일부 macOS HFS+ 는 1초 정밀도 → 동일 초 내 저장 시 `ok` 오판 가능
2. **git checkout 오판**: mtime 이 체크아웃 시각으로 덮여 전 레포가 stale 로 표시될 수 있음 — v2 에서 content hash 기반 판정 권장

## 재현 방법

```bash
cd /path/to/markwand
pnpm exec tsx scripts/drift-smoke.ts
# → 콘솔에 6/6 OK 출력, exit 0
```

실패 시 exit 1 + 어느 시나리오에서 어떤 counts/references 가 나왔는지 상세 로그.
