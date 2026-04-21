---
slug: remote-fs-transport-m1-m2
sprint: M1·M2 선행 — Transport Interface + Hash 보조
created: 2026-04-21
approved: 2026-04-21 (U-M2-1 사용자 승인 — M2 scope 축소: hash는 보조 필드만, 진짜 전환은 별도 Plan)
status: approved
design_ref: docs/designs/remote-fs-transport.md (§2.2 rev. M1, §3.2, §6)
target_version: v0.9 (로컬 이득 선행, v1.0 SSH는 별도 Plan)
> Mode: deep
> Iterations: 1
---

# Remote FS Transport — M1·M2 선행 스프린트 Plan

## Context

**배경**: v0.3 이미지 MVP 완료 후, v1.0 SSH 원격 워크스페이스 로드맵(M1~M8) 중 **로컬 사용자에게도 이득이 되는 M1·M2만 선행** 착수. M3+ SSH 본격 구현은 v0.3 피드백 1~2 사이클 후 feature flag dogfood로 분리 (Design Contract DC-6).

**입력 문서**:
- 설계서: `docs/designs/remote-fs-transport.md` §2.2 rev. M1, §3.2, §6
- UX Audit 산출: Design Contract DC-1~DC-7 (2026-04-21 `/nova:ux-audit` 5-jury 만장일치)

**제약**:
- **DC-5 Merge 조건**: 로컬 hot path p95 회귀 ≤ 3%
- **DC-6 Phasing**: 로컬 회귀 0 보장이 merge 조건
- **Scope Guard**: M3+ 작업 금지, SSH 관련 코드 commit 금지, `ssh2` NPM 의존성 추가 금지
- 기존 Known Risks·Known Gaps 회귀 0

## Problem

### M1: Transport interface 부재
현재 `src/main/**` 코드가 `fs.promises.*` / `chokidar` / `fast-glob` / `execa` / `pathToFileURL`을 직접 호출한다(전수조사 43지점). M3 SSH 도입 시 **IPC 핸들러 + UI를 transport 모르게** 유지하려면 추상화 계층이 필요하다. 지금 도입하지 않으면 M3에서 동시에 건드리게 되어 회귀 위험 × 복잡도 증가.

### M2: Drift 판정의 mtime 정밀도 한계
`drift:verify`가 `hit.mtimeMs > docMtime` 비교로 판정(`src/main/ipc/drift.ts:88-90`). 두 가지 오판:
- **git checkout mtime 덮어쓰기** → 컨텐츠 그대로인데 stale
- **FAT32·동일 초 내 저장** → 변경됐는데 ok

NOVA-STATE Known Gap `drift mtime 정밀도 / git checkout`이 v0.3 Low로 미결. M2는 이 Gap을 **로컬 사용자에게 즉시 이득**으로 해소한다.

## Solution

### M1: Transport Interface 도입 + LocalTransport 래핑

#### M1.1 — 설계서 §2.2 rev. M1 (완료)
이 Plan 작성 시점에 설계서 선수정 완료:
- `ScannerDriver.detectWorkspaceMode(root)` 추가 (기존 `scanner.ts:163 detectWorkspaceMode`를 interface화)
- `FsDriver.readFile`의 기본 `maxBytes: 2MB` 계약 명시 (Known Risk 동시 해소)
- Plan은 **설계서를 단일 소스로 참조만** 한다 (interface drift 방지)

#### M1.2 — 신규 파일 (4개)

| 파일 | 역할 |
|------|------|
| `src/main/transport/types.ts` | 설계서 §2.2의 `FileStat`/`ReadOptions`/`FsDriver`/`ScannerDriver`/`WatcherDriver`/`ExecDriver`/`Transport` 타입 선언. `WatcherDriver`·`ExecDriver`는 M1에서 **타입만** (구현 stub은 M4·M6). `LOCAL_TRANSPORT_ID='local'` 상수. |
| `src/main/transport/local/fs.ts` | `LocalFsDriver` 구현. `stat`/`readFile`(maxBytes 2MB 기본)/`readStream`(readable from `fs.createReadStream`)/`access`. 15개 `fs.promises.*` 호출 지점을 이쪽으로 위임. |
| `src/main/transport/local/scanner.ts` | `LocalScannerDriver`. 기존 `src/main/services/scanner.ts`의 `countDocs`/`scanDocs`/`detectWorkspaceMode`를 래핑. scanner.ts 자체는 단위 테스트를 위해 유지하되 IPC에서 직접 호출하지 않음. |
| `src/main/transport/local/index.ts` | `localTransport` module-level singleton export. `{ id:'local', kind:'local', fs, scanner, watcher:undefined, exec:undefined, dispose(){} }`. |

#### M1.3 — 수정 파일 (6개)

| File:Line | 현재 | M1 후 | 난이도 |
|-----------|------|-------|--------|
| `src/main/ipc/workspace.ts:66` (add) | `detectWorkspaceMode(root)` 직접 호출 | `localTransport.scanner.detectWorkspaceMode(root)` | M |
| `src/main/ipc/workspace.ts:158/169` (scan/refresh) | `scanProjects(roots, mode)` | transport 경유. `scanProjects` 자체는 M1에선 그대로 두되 내부 `fs.promises.readdir` 호출만 `localTransport.fs`로 치환 | M |
| `src/main/ipc/workspace.ts:179` (project:get-doc-count) | `countDocs(cwd)` | `localTransport.scanner.countDocs(cwd, VIEWABLE_GLOB, IGNORE)` | M |
| `src/main/ipc/workspace.ts:196` (project:scan-docs) | `scanDocs(...)` generator | `localTransport.scanner.scanDocs(...)` AsyncIterable | M |
| `src/main/ipc/fs.ts:29-32` (fs:read-doc) | `fs.promises.stat`+`readFile` | `localTransport.fs.stat`+`readFile({maxBytes:2MB})` — 초과 시 `FILE_TOO_LARGE` 에러 | L |
| `src/main/ipc/drift.ts:43/55/70/75` (drift:verify) | `fs.promises.stat`×4 | `localTransport.fs.stat`×4 (statWithFallback 내부도 포함) | L |
| `src/main/ipc/composer.ts:31` (composer:estimate-tokens) | `fs.promises.stat` loop | `localTransport.fs.stat` loop | L |
| `src/main/security/validators.ts:120` (assertInWorkspace) | `(path, roots)` | `(path, roots, opts?: {posix?:boolean})` default false. M1 사용처 0 — **M3 SSH 검증의 사전 계약**임을 ADR 주석으로 명기 (dead param 오인 방지) | L |
| `src/renderer/state/store.ts` (workspace 엔트리) | `{id,name,root,mode,addedAt,lastOpened}` | `{...,transport:{type:'local'}}` 필드 추가. **Lazy 마이그레이션**: 누락 엔트리는 로드 시 `{type:'local'}` 기본값 주입. | L |

#### M1.4 — IPC 핸들러 보안 체크리스트 (Critic G-Major)
각 핸들러가 transport 위임 후에도 `assertInWorkspace` 호출을 유지하는지 확인.

**결정**: `assertInWorkspace`는 **IPC 핸들러 레벨에 유지** (transport 외부). 근거:
- path traversal 방어는 "외부 입력 검증"이므로 경계(IPC)에서 수행
- transport 내부 이동 시 단위 테스트가 핸들러 우회 가능 → 테스트 거짓 안심
- M3 SSH에서도 `{posix:true}` 옵션으로 동일 위치에서 검증

**테스트 케이스** (각 IPC 핸들러마다 1건):
- `fs:read-doc` with `../etc/passwd` → `PATH_OUT_OF_WORKSPACE`
- `drift:verify` with ref 경로가 workspace 밖 → 해당 ref는 `missing`
- `workspace:scan-docs` with 외부 root → 거부
- `composer:estimate-tokens` with 외부 paths → 거부

### M2: Drift mtime → Content Hash 전환

#### M2.1 — 결정 사항 고정

| 항목 | 결정 | 근거 |
|------|------|------|
| 알고리즘 | **sha256** | Node 내장 `crypto`, NPM 추가 0, electron 번들 증가 0. 50KB 파일 ~0.5ms |
| Scope | **전체 content** (frontmatter 포함) | body/frontmatter 분리의 의미 차이가 drift 관점에서 없음 (참조 변경 감지) |
| Cache 키 | `(absPath, mtimeMs, size)` | size 포함 — mtime 동일 + size 다를 때 강제 재해시 (설계서 §3.2보다 안전) |
| Cache 저장소 | **인메모리 Map (main process, drift.ts 스코프)** | 세션 스코프, electron-store 오염 방지 |
| 마이그레이션 shim | **불필요** | `ignoredDriftRefs`는 세션 메모리, 영속 데이터 없음 (Critic 확인) |
| Watcher 무효화 훅 | **구현 안 함** | watcher가 v0.3.2 현재 완전 비활성 (src/main/index.ts:93-96 주석). M4 재도입 시 추가. |

#### M2.2 — 신규 파일 (2개)

```ts
// src/lib/drift/hash.ts — 신규
import { createHash } from 'node:crypto'
import type { FsDriver } from '@/main/transport/types'

type CacheEntry = { mtimeMs: number; size: number; hash: string }
const cache = new Map<string, CacheEntry>()

export async function contentHash(
  fs: FsDriver,
  absPath: string,
  stat: { mtimeMs: number; size: number },
): Promise<string> {
  const cached = cache.get(absPath)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.hash  // cache hit
  }
  const buf = await fs.readFile(absPath, { maxBytes: 2 * 1024 * 1024 })
  const hash = createHash('sha256').update(buf).digest('hex')
  cache.set(absPath, { mtimeMs: stat.mtimeMs, size: stat.size, hash })
  return hash
}

export function invalidateHash(absPath: string): void {
  cache.delete(absPath)
}

export function clearHashCache(): void {
  cache.clear()
}

// M3 SSH 전환 시 stat도 동일 캐시로 통합 가능 — 현재는 stat 중복 허용 (로컬 stat < 1ms)
```

- `hash.test.ts` — 5 회귀 케이스:
  - 같은 mtime + 다른 content → 다른 hash
  - 다른 mtime + 같은 content → cache miss → 같은 hash (cache 재갱신)
  - 같은 (mtime, size) → cache hit (readFile 호출 0회 검증)
  - 2MB 초과 파일 → `FILE_TOO_LARGE` 전파
  - invalidate 후 재계산

#### M2.3 — 수정 파일 (2개)

| File:Line | 현재 | M2 후 |
|-----------|------|-------|
| `src/main/ipc/drift.ts:88-90` | `status = hit.mtimeMs > docMtime ? 'stale' : 'ok'` | `const refHash = await contentHash(fs, refPath, refStat); status = refHash === storedHashForThisDoc ? 'ok' : 'stale'`. **Fallback**: hash IO 실패 시 기존 mtime 비교 유지 (try/catch). |
| `src/lib/drift/types.ts` (`VerifiedReference`) | 기존 필드 | `hashAtCheck?: string` 추가. UI 미사용(M2 스코프 밖), 디버깅·감사용. |

**판정 로직 상세**:
- doc(문서) 자체의 hash를 계산 → 각 reference path의 hash와 비교하면 "의미 없음"임에 주의. drift는 **각 reference 파일의 최신성**을 본다.
- 기존 로직이 `hit.mtimeMs > docMtime`였다는 건 "ref 파일이 doc 파일보다 최근이면 stale"이 아니라 **"doc 작성 시점보다 ref가 늦게 수정됐으면 stale"**이다. 이 전제를 hash로 단순 치환할 수 없음.
- **M2 판정 재정의**: "doc을 마지막으로 열었을 때 ref의 hash"를 doc 메타로 저장하지 않으므로, hash만으로 stale 판정은 불가능하다.

**정정된 M2 설계** (핵심 발견):
- **단순 교체 불가** — mtime 기반 판정은 "문서가 본 시점"을 메모리에 저장하지 않고도 동작했기 때문.
- **현실적 선택 1 (권고)**: doc을 열 때마다 모든 ref의 hash를 계산해 "현재 세션에서 본 ref hash"를 메모리 Map으로 보관. 같은 세션 안에서 ref가 변경되면 stale. **한계**: 앱 재시작 시 "지금 시점 스냅샷"으로 초기화 (전부 ok).
- **현실적 선택 2**: doc frontmatter에 `refs_hash: {path: hash}` 필드를 사용자가 명시 기록 (수동). 스코프 밖.
- **현실적 선택 3**: `.markwand-refs.json` 사이드카 파일. DC-1(readonly) 위반.

**판정** (Critic 재검토 필요): M2의 순수 hash 치환은 **mtime 기반과 등가가 아님**. 권고:
- **M2 범위 축소**: hash는 **보조 확인용**으로만 도입 (`VerifiedReference.hashAtCheck`). 판정은 여전히 mtime 기반 유지.
- **진짜 hash 기반 전환은 v1.0 이후 별도 Plan** — "본 시점 스냅샷" 영속 저장 설계가 필요.
- 이로써 NOVA-STATE Known Gap "drift mtime 정밀도"는 **M2에서 해소되지 않음**. 재정의 필요.

> ⚠️ **Critic self_verify uncertain 영역 확정**: 이 재정의는 Critic 단계를 넘어 Refiner 단계에서 발견됐다. Sprint Contract로 넘기기 전 **사용자 결정** 필요 (아래 Unknowns U-M2-1).

## Sprint Contract

### S1 — M1 Transport Interface (2일)
- [ ] `src/main/transport/types.ts` 작성 (설계서 §2.2 rev. M1 반영)
- [ ] `src/main/transport/local/{fs,scanner,index}.ts` 구현
- [ ] IPC 핸들러 6곳 위임 수정
- [ ] `validators.ts` `{posix?:boolean}` 옵트 추가 + ADR 주석
- [ ] `store.ts` workspace.transport 필드 lazy 마이그레이션
- [ ] 단위 테스트 `src/main/transport/local/*.test.ts` (최소 각 드라이버 핵심 메서드 3케이스)
- [ ] IPC 핸들러 보안 테스트 4건 (`PATH_OUT_OF_WORKSPACE`)
- **DoD**: typecheck + vitest + drift-smoke + bench-transport(p95 ≤3%) + 독립 Evaluator PASS

### S2 — M2 Hash 보조 도입 (0.5일, 범위 축소)
- [ ] `src/lib/drift/hash.ts` + `hash.test.ts` (5 케이스)
- [ ] `VerifiedReference.hashAtCheck?: string` 필드 추가
- [ ] `drift:verify`에서 hash를 **병행 계산만** (판정은 기존 mtime 유지)
- **DoD**: 기존 drift-smoke 21/21 PASS 유지 + hash.test.ts 5/5 PASS

### S3 — Bench Harness (0.5일)
- [ ] `tests/fixtures/bench-ws/` 체크인 (5 projects × 50 md = 250 파일, 계층 3단계)
- [ ] `scripts/bench-transport.ts` 신규 — 5 hot path (scanDocs/watcher/fs:read-doc/drift:verify/app://)
- [ ] 3회 반복 평균 p50/p95/p99 + 표준편차
- [ ] `package.json`에 `bench:transport` script 추가
- [ ] CI(GitHub Actions) 또는 로컬 간이 통합 — M1 merge gate
- **DoD**: 실행 성공 + baseline 기록 + p95 회귀 판정 자동화

**총 추정**: 3일 (2026-04-21 → 2026-04-24)

## Risk Map

| ID | 영역 | 위험 | 심각도 | 대응 |
|----|------|------|--------|------|
| RM-1 | M2 scope | hash 기반 판정 재정의 없이는 mtime과 등가 불가 → Known Gap 해소 실패 | **High** | S2 범위 축소: hash는 보조 필드만. 진짜 전환은 별도 Plan. 사용자 결정 U-M2-1. |
| RM-2 | 성능 | IPC 핸들러 위임 시 async 경계 +1단 → p95 회귀 >3% | Medium | bench-transport CI gate. 초과 시 인라인 호출 유지(LocalTransport에 위임 안 함) 허용. |
| RM-3 | 보안 | `assertInWorkspace` 호출 위치 이동 시 path traversal 우회 | Medium | 핸들러 레벨 고정 + 테스트 4건 추가. |
| RM-4 | 회귀 | `scanProjects` 내부 리팩터가 workspace add/refresh 회귀 | Medium | 기존 vitest + 수동 GUI 17 projects 로드 확인. |
| RM-5 | UX | `fs:read-doc` 2MB 초과 파일이 이제 `FILE_TOO_LARGE` 에러 → 기존 사용자 대형 md 열림 불가 | Low | 릴리스 노트 안내 + 초과 시 에러 UI는 기존 `MarkdownViewer` 에러 화면 재사용 |
| RM-6 | interface drift | 설계서 §2.2와 실제 코드 drift | Low | 설계서를 단일 소스로, Plan은 참조만 (§M1.1) |

## Unknowns

- **U-M2-1** — M2 scope 축소안 사용자 승인: "hash는 보조 필드로 도입, 진짜 mtime→hash 판정 전환은 별도 Plan"이 수용 가능한가?
- **U-BENCH-1** — fixture 250 파일이 실 워크스페이스(971 파일) 대비 상대적 회귀 감지에 충분한지 — 3회 반복 평균 표준편차가 5% 이내 안정인지 측정 전 미확정.
- **U-CI-1** — CI(GitHub Actions)가 현재 프로젝트에 구성돼 있는지, 아니면 로컬 전용으로 bench를 돌릴지 결정 필요.
- **U-KR-READ-1** — `fs:read-doc` 2MB 상한을 M1에서 도입하는 것이 기존 사용자의 대형 md 파일(>2MB)을 차단하는 UX 저하를 유발하지 않는지 실측 필요.

## Verification Hooks

1. **Typecheck**: `pnpm typecheck` — 0 error
2. **Unit tests**: `pnpm test` — 전체 PASS (기존 + transport/local/* + hash.test.ts)
3. **Drift smoke**: `tsx scripts/drift-smoke.ts` — 21/21 PASS 유지 (RM-1 해소 확인)
4. **Bench transport**: `tsx scripts/bench-transport.ts` — p95 회귀 ≤ 3% 전 hot path
5. **IPC 보안 테스트**: 4건 `PATH_OUT_OF_WORKSPACE` 케이스 PASS
6. **독립 Evaluator**: Critical 0, Major ≤ 3 (반영 또는 Known Gap 이관)
7. **수동 GUI 검증**: `pnpm dev` → 17 projects 로드(초기 920ms 회귀 0) + drift 패널 동작 + 이미지 뷰어 회귀 0
8. **릴리스 노트 초안**: "v0.9 변경: Transport 추상화 도입(내부 리팩터, 사용자 변화 0). `fs:read-doc`에 2MB 상한 추가(기존 Known Risk 해소)."

## Rollback 경로

- **M1 단독 rollback**: `src/main/transport/` 제거 + IPC 핸들러 6곳 revert (git revert 1~2 커밋). workspace.transport 필드는 유지(미사용, lazy 마이그레이션이라 무해).
- **M2 단독 rollback**: `drift.ts` hash 호출 제거 + `hash.ts`·`hash.test.ts` 삭제 (git revert 1 커밋).
- **S3 bench rollback**: fixture·스크립트 삭제 (저장소에만 영향, 제품 무영향).
- **M1/M2는 독립 커밋으로 분리** — 선택적 rollback 보장.

## Known Risk 연계 결정

| Known Risk / Gap | M1·M2 연계 | 결정 |
|-----------------|-----------|------|
| `fs:read-doc 파일 크기 무제한` (Hard) | M1 `FsDriver.readFile`에 `maxBytes:2MB` 기본값 | **M1에서 동시 해소** |
| `preload onDocsChunk/onChange raw event 노출` (Medium) | M1 리팩터 범위 | **M1 스코프 제외**, Known Risk 유지 (별도 PR) |
| `drift mtime 정밀도 / git checkout` (v0.3 Low) | M2 hash 전환 | **M2 범위 축소로 미해소** — U-M2-1 결정 후 재계획 |
| `FsChangeEvent mtime 누락` (v0.4 Low) | watcher 비활성 | **건드리지 않음** (M4 재도입 시) |

## Refs

- Design: `docs/designs/remote-fs-transport.md` §2.2 rev. M1, §3.2, §6
- UX Audit: 2026-04-21 `/nova:ux-audit` 5 jury 산출 DC-1~DC-7
- Prior Plan: `docs/plans/image-viewer-mvp.md` (v0.3 완료)
- Explorer 리포트 (이 deepplan 세션): (1) Impact Matrix 43지점, (2) Hot Path Budget 5경로, (3) Drift v2 Spec
- Critic 리포트 (이 deepplan 세션, nova:architect): CONDITIONAL PASS + 5건 수정 지시 반영
