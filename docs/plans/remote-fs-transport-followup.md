---
slug: remote-fs-transport-followup
sprint: M-2 Follow-up — IPC 분기 + UI (SSH e2e 경로 완성)
created: 2026-04-21
status: draft
design_ref: docs/designs/remote-fs-transport.md
parent_plan: docs/plans/remote-fs-transport-m3-m4.md
target_version: v1.0 (experimentalFeatures.sshTransport flag)
---

> Mode: plain
> Parent Plan: docs/plans/remote-fs-transport-m3-m4.md
> Parent Design: docs/designs/remote-fs-transport.md (v1.0)

# Remote FS Transport — Follow-up (M-2 IPC 분기 + UI)

## Context

**배경**: M3·M4 스프린트(docs/plans/remote-fs-transport-m3-m4.md)에서 SSH 인프라
계층이 완성됐다. ssh2 Client 래퍼·SshFsDriver·SshScannerDriver·hostKeyDb·reconnect backoff·
SshPoller watcher·pool.ts·resolve.ts 전부 구현 완료이며 Docker sshd 통합 테스트 6/6 PASS.
`workspace:add-ssh` IPC 도 동작한다.

**미완성 경로**: 해당 Plan의 Known Gap M-2로 등재된 항목이다.

1. `workspace:add-ssh` (src/main/ipc/workspace.ts:239) — `root: '/'` 하드코딩 + "scanProjects SSH 는 v1.1 범위" 주석. SSH workspace 추가 후 프로젝트 목록이 비어있다.
2. `project:get-doc-count` (src/main/ipc/workspace.ts:306) — `localTransport.scanner.countDocs` 하드코딩.
3. `project:scan-docs` (src/main/ipc/workspace.ts:330) — `composeDocsFromFileStats(localTransport, ...)` 하드코딩. SSH workspace 의 프로젝트를 클릭해도 문서 스트리밍이 일어나지 않는다.
4. `fs:read-doc` (src/main/ipc/fs.ts:31) — `localTransport.fs` 하드코딩. payload 가 `{path}` 만 수용해 workspaceId 를 알 수 없다.
5. WorkspacePicker (src/renderer/components/WorkspacePicker.tsx) — `__add__` 선택이 로컬 dialog 만 열린다. SSH 등록 UI 없음.
6. Settings (src/renderer/components/Settings.tsx) — Experimental 섹션 없음. `experimentalFeatures.sshTransport` 토글 노출 불가.

**이미 준비된 자산 (재작업 금지)**:
- `src/main/transport/resolve.ts` — `getActiveTransport(workspaceId)` 헬퍼 완성. pool 경유 SSH transport 반환.
- `src/main/ipc/workspace.ts` — `composeDocsFromFileStats(transport, ...)` 헬퍼 transport-agnostic 완성.
- `src/main/services/scanner.ts` — `parseFrontmatter(fsDriver, absPath, opts?)` FsDriver 파라미터 완성.
- `src/main/transport/ssh/scanner.ts` — `SshScannerDriver` — `scanDocs`·`countDocs`·`detectWorkspaceMode` 완성.
- `src/main/services/store.ts` — `isSshTransportEnabled()` 완성.
- `src/preload/types.ts` — `window.api.workspace.addSsh(...)` 타입 계약 완성.
- `src/renderer/state/store.ts` — `transportStatuses` slice 완성.

**제약 재확인** (Design Contract DC-1~DC-7 전부 준수):
- DC-1 readonly — SSH write 경로 없음.
- DC-2 hybrid pool — pool.ts 이미 구현. 재설계 금지.
- DC-3 3-state — connected/connecting/offline 어휘 고정.
- DC-4 host trust bypass 0 — hostVerifier 우회 금지, TOFU 모달 필수.
- DC-5 perf budget — 로컬 hot path p95 회귀 ≤3%.
- DC-6 phasing — feature flag 뒤에서만 SSH 경로 노출.
- DC-7 verification — Docker sshd 통합 테스트로 검증.

---

## Problem

### P-1: scanProjects SSH 미구현
`services/scanner.ts:scanProjects` 는 `fs.promises.readdir`·`fs.promises.access`·`fs.promises.stat`
를 직접 호출한다. SSH workspace 에는 적용 불가. `workspace:add-ssh` 에서 `root: '/'`로 하드코딩
된 채 project scan 이 로컬 경로로 fallthrough 된다.

### P-2: IPC 3개 localTransport 하드코딩
`project:get-doc-count`·`project:scan-docs`·`fs:read-doc` 가
모두 `localTransport` 또는 `localTransport.scanner/fs` 를 하드코딩. SSH workspace 의 projectId 로
호출 시 로컬 FS 접근 시도 → NOT_FOUND 또는 잘못된 결과.

### P-3: fs:read-doc workspaceId 미수신
`fs:read-doc` payload 계약이 `{path: string}` 만 수용. path 에서 workspaceId 를 역매핑하려면
storedWorkspaces 순회 + `path.startsWith(ws.root)` 조회가 필요하다. 로컬 workspace root 는
OS 절대경로, SSH root 는 POSIX 절대경로라 두 가지 비교 로직이 필요하다.

### P-4: WorkspacePicker SSH 등록 UI 없음
UI 에서 SSH workspace 를 추가할 방법이 없다. 현재는 DevTools Console 에서
`window.api.workspace.addSsh({...})` 를 직접 호출해야 한다.

### P-5: Settings Experimental 섹션 없음
`experimentalFeatures.sshTransport` 를 토글할 UI 가 없다. `MARKWAND_SSH=1` env 로만
가능하다. 일반 사용자 테스트 경로 부재.

---

## Solution

### 아키텍처 (기존 재사용)

설계서 §2.1 4계층 모델 그대로. 변경은 IPC 핸들러의 transport 분기 + UI 1개 컴포넌트 2개 섹션 추가뿐.
신규 추상화 없음. resolve.ts `getActiveTransport` 가 이미 모든 분기를 담당한다.

```
WorkspacePicker (+ SSH 폼) → workspace:add-ssh IPC (기존) → SshTransport → pool
                          ↓
                workspace:scan → scanProjectsSsh (FS0 신규 함수, SSH workspace 전용)
                          ↓
           project:scan-docs → composeDocsFromFileStats(getActiveTransport(wsId)) [배선만]
           project:get-doc-count → getActiveTransport(wsId).scanner.countDocs [배선만]
           fs:read-doc → resolveTransportForPath(path) → transport.fs [배선만]
```

### 핵심 설계 결정

**D-1. fs:read-doc 역매핑 방안**: path prefix 역매핑 (방안 B)

| 기준 | 방안 A — payload 계약 변경 | 방안 B — path prefix 역매핑 (채택) |
|------|--------------------------|--------------------------------|
| renderer 변경 범위 | 모든 `fs.readDoc(path)` 호출부 수정 필요 | IPC 핸들러 내부만 수정 |
| 안전성 | workspaceId 명시 전달 — 역매핑 오판 없음 | 경로 prefix 충돌 가능성(이론적) |
| preload 계약 | 시그니처 bump | 불변 |

**채택 근거**: `fs.readDoc` 호출부가 renderer 다수 지점에 분산돼 있고, `workspace:add` 중복 등록 방지 로직이 이미 workspace root 중첩을 차단해 prefix 충돌 가능성 0.

**D-2. scanProjects SSH 방안**: 별도 함수 (방안 B)

| 기준 | 방안 A — scanner transport-aware 확장 | 방안 B — scanProjectsSsh 별도 (채택) |
|------|----|----|
| 로컬 회귀 위험 | scanProjects 내부 변경 → 회귀 표면 | 기존 불변 → 회귀 0 |
| 중복 코드 | 없음 | ~30 LOC (makeProjectFromSftp 추출로 최소화) |

**채택 근거**: 기존 `scanProjects` 는 로컬에서 안정 동작 중이며 로컬 회귀 위험 0 이 중복 절약보다 우선.

### 변경 지점 (파일:라인)

| 파일 | 현재 상태 | 변경 내용 |
|------|-----------|-----------|
| `src/main/ipc/workspace.ts` (getOrScanProjects) | `scanProjects(wsId, root, mode)` 직접 호출 | SSH wsId 분기 → `scanProjectsSsh(wsId, root, mode, transport)` |
| `src/main/ipc/workspace.ts` (project:get-doc-count) | `localTransport.scanner.countDocs(...)` | `(await getActiveTransport(wsId)).scanner.countDocs(...)` |
| `src/main/ipc/workspace.ts` (project:scan-docs) | `composeDocsFromFileStats(localTransport, ...)` | `composeDocsFromFileStats(await getActiveTransport(wsId), ...)` |
| `src/main/ipc/fs.ts` (fs:read-doc) | `localTransport.fs` + `assertInWorkspace(path, roots)` | `resolveTransportForPath` 헬퍼 경유. `assertInWorkspace` 에 `posix: transport.kind === 'ssh'` |
| `src/main/ipc/workspace.ts` (신규 함수) | 없음 | `scanProjectsSsh(wsId, root, mode, transport)` |
| `src/main/ipc/fs.ts` (신규 헬퍼) | 없음 | `resolveTransportForPath(docPath, workspaces)` → `{transport, ws}` |
| `src/renderer/components/WorkspacePicker.tsx` | `__add__` → 로컬 dialog | `experimentalSsh` prop + `__add_ssh__` 옵션 조건부 |
| `src/renderer/components/SshWorkspaceAddModal.tsx` (신규) | 없음 | host/port/user/auth/root 폼 → `window.api.workspace.addSsh(...)` |
| `src/renderer/components/Settings.tsx` | Experimental 섹션 부재 | `sshTransport` Checkbox + 재시작 안내 |
| `src/main/security/validators.ts` | `parseWorkspaceAddSshInput` (name/host/port/user/auth) | `root: z.string().min(1).max(512)` + depth 2 가드 추가 |
| `src/preload/types.ts` | `addSsh(input)` 타입 — root 필드 없음 | `root: string` 추가 |

---

## Sprints

### FS0: scanProjects SSH (0.5d)

**목표**: SSH workspace 추가 후 depth 2 프로젝트 목록 탐지. `workspace:add-ssh` 의 `root: '/'`
하드코딩 해소.

#### 체크리스트

- [ ] `parseWorkspaceAddSshInput` 에 `root` 필드 추가 (validators.ts)
- [ ] `root` depth 2 이상 검증 (`/` 단독 차단 — RF-2 완화)
- [ ] `window.api.workspace.addSsh` 타입 계약에 `root` 필드 추가 (preload/types.ts)
- [ ] `scanProjectsSsh(wsId, root, mode, transport)` 함수 신규 작성 (ipc/workspace.ts 하단)
  - `SshScannerDriver.detectWorkspaceMode(root)` 로 mode 결정
  - SFTP readdir 을 사용해 프로젝트 마커 탐지 (depth 2)
  - Project 객체는 기존 타입과 동일, `docCount: -1` sentinel 유지
- [ ] `getOrScanProjects` 에 `workspaceId.startsWith('ssh:')` 분기 추가
- [ ] `workspace:add-ssh` 핸들러 `root: '/'` → `input.root` 로 교체
- [ ] 단위 테스트: mock SshScannerDriver 로 `scanProjectsSsh` 2건 (container/single 각 1건)
- [ ] `pnpm typecheck` PASS

#### Done Criteria

Docker sshd fixture 에서 SSH workspace 추가 시 `workspace:scan` 이 `Project[]` (≥1건) 반환.

---

### FS1: IPC 3개 transport 분기 (1d)

**목표**: `project:get-doc-count`·`project:scan-docs`·`fs:read-doc` 가 SSH workspace 에 대해
`getActiveTransport` 경유로 동작.

#### 체크리스트

- [ ] `project:get-doc-count` — `ws.id` 변수 추가 후 `getActiveTransport(ws.id)` 분기
- [ ] `project:scan-docs` — 동일 방식으로 `getActiveTransport(ws.id)` 분기
- [ ] `fs:read-doc` — `resolveTransportForPath` 헬퍼 작성
  - workspaces 순회하며 `docPath.startsWith(ws.root + sep)` 체크
  - transport.type 에 따라 `localTransport` 또는 `getActiveTransport(ws.id)` 반환
  - 매칭 없으면 `null` → `PATH_OUT_OF_WORKSPACE` 에러
- [ ] `assertInWorkspace` 호출부에 `posix: transport.kind === 'ssh'` 전달
- [ ] 단위 테스트: `resolveTransportForPath` 3건 (로컬 매칭/SSH 매칭/범위 밖)
- [ ] 단위 테스트: SSH workspace ID 전달 시 `getActiveTransport` 호출 확인 1건
- [ ] `pnpm typecheck` PASS
- [ ] `pnpm test` PASS (로컬 회귀 0)

#### Done Criteria

Docker sshd fixture → `project:scan-docs` 가 SSH 경유 Doc[] 반환. `fs:read-doc` 가 SSH `.md` content 반환.

---

### FS2: UI (WorkspacePicker + Settings) (0.5d)

**목표**: UI 에서 SSH workspace 추가 + Experimental flag 토글 가능.

#### 체크리스트

- [ ] `WorkspacePickerProps` 에 `experimentalSsh?: boolean` + `onAddSsh?: () => void` 추가
- [ ] flag on 시 `__add_ssh__` 옵션 조건부 렌더 (flag off 시 DOM 제거 — disabled 아님)
- [ ] `SshWorkspaceAddModal.tsx` 신규 — 폼 필드(name/host/port/user/auth/root)
  - `auth`: radio (agent/key-file), key-file 선택 시 경로 picker
  - `root`: 기본 `~` prefill, 편집 가능
  - 제출 시 `window.api.workspace.addSsh(...)` 호출 (loading 상태 유지 중 TOFU 자동 트리거)
  - 취소 + ESC 닫힘
  - 에러 처리: `SSH_TRANSPORT_DISABLED` → Settings 안내 메시지
- [ ] Settings Experimental 섹션 — `sshTransport` Checkbox + 재시작 안내
- [ ] 호출부(App.tsx) `experimentalSsh` prop 전달 + `onAddSsh` 핸들러
- [ ] flag off DOM 검증: `__add_ssh__` 옵션 부재
- [ ] `pnpm typecheck` PASS

#### Done Criteria

`MARKWAND_SSH=1 pnpm dev` 에서 WorkspacePicker SSH 옵션 표시. Settings 에서 sshTransport 토글 가능.

---

### FS3: e2e smoke + Evaluator (0.5d)

**목표**: Docker sshd 기동 → UI 워크스페이스 추가 → 프로젝트 스캔 → 문서 렌더 전 경로 동작 확인.

#### 체크리스트

- [ ] `scripts/test-integration-ssh.ts` 에 IPC 경로 검증 케이스 3건 추가
  - **T-ipc-scan-001**: `scanProjectsSsh` → `Project[] ≥1` 반환
  - **T-ipc-docs-001**: `composeDocsFromFileStats(sshTransport, ...)` → `Doc[] ≥1`
  - **T-ipc-read-001**: `SshFsDriver.readFile(note-1.md)` → content 비어있지 않음
- [ ] `pnpm test:integration-ssh` 9건 PASS (기존 6 + 신규 3)
- [ ] 수동 e2e 골든 패스
  - `docker compose -f tests/fixtures/ssh/docker-compose.yml up -d`
  - `MARKWAND_SSH=1 pnpm dev`
  - Settings → Experimental → sshTransport ON → 재시작
  - WorkspacePicker → SSH Remote → 127.0.0.1:2222 / markwand / key-file / root: /config/workspace
  - TOFU 모달 → Trust
  - sidebar 프로젝트 목록 ≥1 확인
  - proj-a → doc 목록 확인
  - note-1.md → MarkdownViewer 렌더 확인
- [ ] `pnpm typecheck` / `pnpm test` 전체 PASS
- [ ] `pnpm run bench:transport` p95 회귀 ≤3% (DC-5)

#### Done Criteria

수동 골든 패스 완료 + 통합 테스트 9건 PASS.

---

## Scope Guard

**범위 안 (필수)**:
- scanProjects SSH (FS0)
- IPC 3개 transport 분기 (FS1)
- WorkspacePicker SSH 옵션 + SshWorkspaceAddModal (FS2)
- Settings Experimental 섹션 (FS2)
- e2e smoke 3건 (FS3)

**범위 밖 — v1.0 후속**:
- `drift:verify` SSH 경로 분기 (문서 보기 목표에 불필요)
- `composer:estimate-tokens` SSH 경로
- `SshPoller` → `fs:change` IPC 배선 (읽기 목표엔 실시간 동기화 불필요)
- axe-core `SshWorkspaceAddModal` a11y 자동화 테스트
- `.github/workflows/integration-ssh.yml` CI 활성화
- ProxyJump 1-hop UI 폼 (backend 완성, UI 미노출)
- watcher manual 모드 UI

---

## Risk Map

| ID | 영역 | 위험 | 심각도 | 완화 방안 |
|----|------|------|--------|-----------|
| **RF-1** | 보안 | `resolveTransportForPath` 역매핑이 workspace root 경계 오판 | High | `assertInWorkspace` 는 역매핑과 별도 필수 호출. 단위 테스트 3건 포함. |
| **RF-2** | 보안 | SSH root 가 `/` 이면 전체 POSIX 경로 허용 | High | `parseWorkspaceAddSshInput` 에 root depth ≥2 검증. `/` 단독 차단. |
| **RF-3** | 성능 | `scanProjectsSsh` SFTP 왕복 depth 2 — RTT 50ms에서 200~500ms | Medium | 로컬 hot path 영향 없음(DC-5 bench 로 확인). 원격 scanProjects 는 docCount sentinel -1 로 청크 스트리밍 UX 유지. |
| **RF-4** | 기능 | `inflightScans` 캐시 로컬/SSH 혼재 | Medium | wsId 가 `ssh:<hex>` vs UUID 로 분리 — 캐시 키 충돌 0. 확인 테스트 1건. |
| **RF-5** | UX | TOFU 모달이 `SshWorkspaceAddModal` 닫힘 이후 타이밍 이슈 | Medium | Modal submit 핸들러가 `await addSsh()` 중 loading 상태 유지. |
| **RF-6** | 로컬 회귀 | IPC 분기 추가 시 로컬 경로가 `getActiveTransport` 경유 오버헤드 | Low | `getActiveTransport` 는 non-SSH 즉시 `localTransport` 반환 (오버헤드 0). DC-5 bench 확인. |

---

## DoD

1. `pnpm typecheck` — 0 error
2. `pnpm test` — 전체 PASS
3. `pnpm test:integration-ssh` — 9건 PASS
4. `pnpm run bench:transport` — 로컬 hot path p95 회귀 ≤3%
5. flag off 시 `__add_ssh__` DOM 부재 확인
6. 수동 e2e 골든 패스 완료
7. `resolveTransportForPath` 단위 테스트 3건 PASS
8. `scanProjectsSsh` 단위 테스트 2건 PASS
9. DC-1~DC-7 전 항목 준수 (특히 DC-4 bypass 0)

---

## Verification

| VH ID | 설명 | Sprint |
|-------|------|--------|
| VH-FS0-scan | Docker sshd → `workspace:scan` SSH → Project ≥1 | FS0 |
| VH-FS0-typecheck | `pnpm typecheck` | FS0 |
| VH-FS1-docs | `project:scan-docs` SSH → Doc[] ≥1 | FS1 |
| VH-FS1-read | `fs:read-doc` SSH → content 비어있지 않음 | FS1 |
| VH-FS1-local-no-regression | `pnpm test` 로컬 회귀 0 | FS1 |
| VH-FS1-assertInWorkspace | `posix: true` SSH traversal 차단 | FS1 |
| VH-FS2-flag-off | flag off 시 `__add_ssh__` DOM 부재 | FS2 |
| VH-FS2-settings-toggle | Settings 토글 → `prefs.set` 호출 확인 | FS2 |
| VH-FS3-integration | `pnpm test:integration-ssh` 9건 | FS3 |
| VH-FS3-e2e-golden | 수동 골든 패스 (TOFU → 스캔 → 렌더) | FS3 |
| VH-DC5-bench | `pnpm run bench:transport` p95 ≤3% | FS3 |

---

## self_verify

- **confident**:
  - `getActiveTransport` 배선 — resolve.ts 완성, 호출부 교체만. 로컬 분기 즉시 반환으로 오버헤드 0.
  - `composeDocsFromFileStats` transport-agnostic 완성 — `Transport` 파라미터 수용, SSH 투입 시 재사용 가능.
  - 방안 B(path prefix 역매핑) 채택 — `workspace:add` 중복 등록 방지로 root 중첩 이미 차단.
  - `scanProjectsSsh` 별도 함수 — 기존 `scanProjects` 로컬 회귀 0 달성이 중복 30 LOC 절약보다 우선.

- **uncertain**:
  - `SshWorkspaceAddModal` TOFU 타이밍 — createSshTransport 내부 IPC 호출 시 modal loading z-index 충돌 가능. 실측 필요.
  - `scanProjectsSsh` SSH root depth 2 탐색 성능 — 실 원격(RTT 150ms+)에서 초 단위 지연 가능. DC-5 bench 는 로컬 기준이라 포착 못함.

- **not_tested**:
  - WorkspacePicker prop 경로 (App.tsx → WorkspacePicker) — FS2 착수 전 App.tsx 구조 파악 필요.
  - `resolveTransportForPath` SSH root `/` 엣지케이스 — 기존 저장 엔트리가 `root: '/'`이면 모든 경로 매칭 위험. FS0 의 depth ≥2 검증 + 역매핑 내부 root 길이 최소값 가드 병행 검토.
