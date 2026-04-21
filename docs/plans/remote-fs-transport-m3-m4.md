---
slug: remote-fs-transport-m3-m4
sprint: M3 SSH Transport PoC + M4 원격 watcher 폴링
created: 2026-04-21
status: refined (Critic → Refiner 1 iteration 완료, 사용자 승인 대기)
design_ref: docs/designs/remote-fs-transport.md (§2.2, §3.1, §3.3, §4.1~4.5, §5, §6)
prior_plan_ref: docs/plans/remote-fs-transport-m1-m2.md (approved 2026-04-21)
target_version: v1.0 (feature flag behind `experimentalFeatures.sshTransport`, 초기 개발자 옵션만)
> Mode: deep
> Iterations: 1
---

# Remote FS Transport — M3·M4 스프린트 Plan

## Context

**배경**: v0.9 M1(LocalTransport) + M2(hash 보조) + Bench harness 완료(origin/main = 686bf43 + 후속 08c4138). 다음 단계는 v1.0 로드맵의 **M3 SSH Transport PoC + M4 원격 watcher 폴링**. Design Contract DC-6 phasing에 따라 v0.3 피드백 사이클을 거친 후 feature flag 뒤에서 진입한다.

**입력 문서**:
- 설계서: `docs/designs/remote-fs-transport.md` §2.2(Transport interface), §3.1(원격 watcher), §3.3(app:// 원격 확장 — 이 Plan 스코프 밖), §4.1~4.5(보안 모델), §5(성능), §6(로드맵)
- Prior Plan: `docs/plans/remote-fs-transport-m1-m2.md` (M1·M2 결과)
- UX Audit 산출: Design Contract DC-1~DC-7 (`/nova:ux-audit` 5-jury 만장일치)
- Explorer 3 리포트 (이 세션): (A) 현 Transport 계층 매핑, (B) ssh2 생태계·Electron ABI·Docker fixture, (C) watcher·TOFU·feature flag·a11y

**재확인 불필요 결정** (Design Contract):
- **DC-1** write 금지 (v1.0 내내, v1.1에서 sidecar 재평가)
- **DC-2** hybrid 동시성 (로컬 N + 원격 active 1 + warm 1)
- **DC-3** `useTransportStatus` 단일 훅 + aria-live + 포커스 복원 + 색외 2차 표식
- **DC-4** hostKey bypass 0 + 키 내용 저장 금지
- **DC-5** 로컬 hot path p95 회귀 ≤ 3% (merge gate, M1 fixture baseline 유지)
- **DC-6** M3+는 feature flag 뒤 dogfood
- **DC-7** Docker sshd + a11y 전용 테스트
- 상태 어휘 3종 고정: `connected` / `connecting` / `offline`
- workspaceId = sha1(`user@host:port`) 16자 hex (local workspace와 분리된 네임스페이스)
- ProxyJump 1급 지원 (단, 1-hop만 — multi-hop은 v1.1)
- keepalive 기본 on, key-file 또는 ssh-agent 대등

**제약**:
- **Scope Guard**: v0.9 LocalTransport **외부 인터페이스**(`FsDriver`·`ScannerDriver` 타입 계약) 변경 금지. 로컬 사용자 회귀 0.
- **Scope Guard 예외** (Critic C-1 승인): S0.2의 `parseFrontmatter` 시그니처 변경은 `services/scanner.ts` 내부 리팩터로, Transport 인터페이스 외부 계약이 아니다. Prior Plan의 "LocalTransport 계약 변경 금지"는 Transport interface 타입 stability를 뜻하며, scanner 서비스 내부 리팩터는 별도 범주로 처리.
- **Non-goal** (v1.0 배제 명시):
  - Multi-hop ProxyJump (2+ chain) — v1.1
  - Password 인증 — ssh-agent + privateKey만
  - Remote file watch / inotify (server-side agent) — 폴링만
  - Windows 원격 호스트 — macOS sshd만
  - 원격 파일 쓰기 (DC-1) — readonly
  - 원격 이미지 streaming (`app://remote-<wsid>/...`) — M5로 분리, 이 Plan 밖
  - "Open in Claude over SSH" (ExecDriver) — M6로 분리

## Problem

### M3: 원격 FS 접근 불가 (ssh2·SFTP·TOFU·ssh_config·reconnect 일체 부재)
현재 LocalTransport만 존재. workspaceId에 `{ type: 'ssh', host, port, user }`를 수용할 schema는 lazy 마이그레이션 경로가 없다. SSH 연결·인증·호스트키 검증·재연결·feature flag UI 전부 신규.

### M4: 원격 파일 변경 감지 메커니즘 부재
로컬 watcher(chokidar)는 v0.3.2 현재 **비활성 상태**(src/main/index.ts:93-96). 원격 watcher는 inotify 불가 → 폴링만 유효. Design §3.1에서 기본 30초 + 동적 조정 2구간 결정됨. `AbortController` 취소 + 지수 backoff + 상태 전이(connecting→connected→offline) 구현 필요.

### RM-7 (M1 carry-over): `project:scan-docs` transport 미경유
v0.9 M1에서 RM-7로 기록됨. `src/main/services/scanner.ts:266-318`의 `scanDocs` async generator가 `fs.promises.stat`(L288) + `parseFrontmatter`의 `fs.promises.open`(L47)을 직접 호출 → transport 우회. M3 진입 전 선결하지 않으면 SSH scanner 구현 계약이 "FileStat만 반환 vs Doc 반환"으로 불안정해진다.

**RM-7 타이밍 결정** (이 Plan의 핵심 결정 중 하나):

| 옵션 | 근거 | 평가 |
|---|---|---|
| **A. M3 선행** (S0에서 RM-7 리팩터 선결) | SSH 구현 계약(FileStat)이 명확해짐. M3 코드 작성 전에 scanner 경계 안정화. M4 watcher의 rescan 경로도 동일 계약 재사용. | **선택** |
| B. M4 합류 (M3 + M4 한 번에 수렴) | Doc composition 경계 결정을 watcher 재도입과 동시에 한 번에. | 탈락 — M3 SSH 개발 중 scanner 인터페이스가 churn 2회 (FileStat 먼저 → 리팩터 후 Doc IPC composition) |

→ **S0 Prerequisite 스프린트에 RM-7 선결 포함**.

## Solution

### S0 — Prerequisite (0.5d): U1 ABI 검증 + RM-7 해소

#### S0.1 U1 ssh2 ABI Verification Hook
- 신규 파일: `scripts/verify-ssh2-abi.ts` (독립 실행, 의존성 최소)
- 절차 (macOS arm64 + x64 양쪽):
  ```bash
  pnpm add -D ssh2@1.17.0 @types/ssh2@1.15.5  # workspace root
  # package.json "build" 에 buildDependenciesFromSource: false 추가
  # package.json "build.asarUnpack" 에 ssh2 native .node 경로 명시
  pnpm install --no-optional  # cpu-features 스킵
  pnpm exec electron-builder install-app-deps  # Electron 33 ABI rebuild
  pnpm tsx scripts/verify-ssh2-abi.ts  # new Client() instantiation + basic connect
  ```
- 기록: `docs/investigations/ssh2-abi-2026-04-22.md` — macOS arm64/x64 결과 + 에러 (있을 시)
- **DoD**: (a) install 성공, (b) `new Client()` 인스턴스화 성공, (c) Docker sshd 연결 1회 성공
- **실패 fallback**: `ssh2-electron-no-cpu-features` 패키지로 대체 후 동일 검증

#### S0.2 RM-7 해소 — `project:scan-docs` Doc composition IPC 레이어로 끌어올림

**원칙**: `ScannerDriver.scanDocs(FileStat)` 계약 유지 (transport-agnostic). Doc composition(frontmatter 파싱 + chunk 분할)은 IPC 핸들러 레이어로 이동.

| File:Line | 현재 | S0.2 후 |
|-----------|------|---------|
| `src/main/services/scanner.ts:45-74 parseFrontmatter` | `fs.promises.open` → `fd.read(4KB)` → matter() | 함수 시그니처 변경: `parseFrontmatter(fs: FsDriver, absPath: string, opts?: { maxBytes: number })`. 내부 `fs.promises.open` 제거 → `fs.readFile(absPath, { maxBytes: opts?.maxBytes ?? HEADER_READ_BYTES })` (4KB 상한, 기본 `HEADER_READ_BYTES = 4096`). **주의**: transport 계약에 `open/read` 추가 금지 — readFile 전체 로드가 4KB 파일에선 비용 무시 가능. |
| `src/main/services/scanner.ts:266-318 scanDocs` | Doc generator, fs.promises.stat 직접 | **삭제 후 이동**: Doc composition 로직을 `src/main/ipc/workspace.ts:219-247 project:scan-docs` 핸들러에 이식. 내부는 `for await (const fileStat of localTransport.scanner.scanDocs(...))` + Doc composition + chunk 분할. |
| `src/main/ipc/workspace.ts:240-241` | `for await (const chunk of scanDocs(projectId, projectRoot)) { event.sender.send('project:docs-chunk', chunk) }` | 헬퍼 함수 `composeDocsFromFileStats(transport, projectId, root)` AsyncGenerator — FileStat → Doc (mtime/size/frontmatter) → chunk 분할. IPC 채널 이름 불변(`project:docs-chunk`). |

**이식 로직** (ipc/workspace.ts 내부 헬퍼):
```ts
async function* composeDocsFromFileStats(
  transport: Transport,
  projectId: string,
  root: string,
  chunkSize = 50,
): AsyncGenerator<Doc[]> {
  let chunk: Doc[] = []
  for await (const stat of transport.scanner.scanDocs(root, [VIEWABLE_GLOB], IGNORE)) {
    const doc: Doc = {
      path: stat.path,
      projectId,
      name: path.basename(stat.path),
      mtime: stat.mtimeMs,
    }
    if (stat.size !== undefined) doc.size = stat.size
    if (classifyAsset(stat.path) === 'md') {
      const fm = await parseFrontmatter(transport.fs, stat.path, { maxBytes: HEADER_READ_BYTES })  // 4KB 상한
      if (fm !== undefined) doc.frontmatter = fm
    }
    chunk.push(doc)
    if (chunk.length >= chunkSize) { yield chunk; chunk = [] }
  }
  if (chunk.length > 0) yield chunk
}
```

**이득**:
- SSH scanner도 FileStat만 반환 → 동일 composeDocsFromFileStats 재사용
- M4 rescan 경로(SshPoller)도 동일 헬퍼 재사용 가능
- transport → renderer Doc 타입 의존 순환 제거

**회귀 방어**:
- 기존 `useDocs`/`InboxView` 스트리밍 로직 변경 0
- `project:docs-chunk` IPC 페이로드 shape 불변
- 단위 테스트: scanner 단독 테스트 2건 + IPC composeDocsFromFileStats 헬퍼 테스트 3건

**DoD S0**: typecheck PASS + vitest 전체 PASS + drift-smoke 21/21 PASS + bench-transport p95 회귀 ≤3% (DC-5) + U1 검증 기록 + Docker sshd 1회 연결 성공

---

### S1 — SshTransport 기본 PoC (2d)

#### S1.1 의존성 추가 + 빌드 설정

| 패키지 | 버전 | 역할 |
|---|---|---|
| `ssh2` | 1.17.0 | SFTP subsystem + Client (공식, mscdex) |
| `@types/ssh2` | 1.15.5 | DefinitelyTyped |
| `ssh-config` | 5.1.0 | ~/.ssh/config 파싱 (TS 네이티브, cyjake/dotnil) |

**package.json 변경**:
```json
{
  "build": {
    "buildDependenciesFromSource": false,
    "asarUnpack": [
      "**/node_modules/ssh2/**/*.node",
      "**/node_modules/cpu-features/**/*.node"
    ],
    "mac": {
      "hardenedRuntime": true,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    }
  }
}
```

**신규 파일**: `build/entitlements.mac.plist` (macOS notarization)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
  <key>com.apple.security.network.client</key><true/>
</dict>
</plist>
```

#### S1.2 신규 파일 — SshTransport 계층 (6개)

| 파일 | 역할 |
|------|------|
| `src/main/transport/ssh/client.ts` | `SshClient` 래퍼 — connect/dispose/onReady/onClose/onError. hostVerifier 콜백 후크. keepaliveInterval 30000 + keepaliveCountMax 3. |
| `src/main/transport/ssh/util/promisifiedSftp.ts` | `promisifySftp(sftp)` 헬퍼 — `readFile`/`stat`/`readdir`/`open` Promise 래핑 (~30 LOC). `createReadStream`은 Node stream 그대로 노출. |
| `src/main/transport/ssh/fs.ts` | `SshFsDriver implements FsDriver`. `stat`/`readFile({maxBytes:2MB})`/`readStream`/`access`. `FileStat.path`는 POSIX 정규화. `isSymlink: false` 고정 (DC-1, Design §3.6). |
| `src/main/transport/ssh/scanner.ts` | `SshScannerDriver implements ScannerDriver`. `countDocs`/`scanDocs`/`detectWorkspaceMode`. SFTP readdir 재귀(`readdir`+`stat` per-entry) + glob 필터(fast-glob 대체로 micromatch 수동 적용). |
| `src/main/transport/ssh/index.ts` | `createSshTransport({host, port, user, auth, hostVerifier})` factory. `{id: sha1(user@host:port).slice(0,16), kind:'ssh', fs, scanner, watcher:undefined, exec:undefined, dispose}`. |
| `src/main/transport/ssh/types.ts` | SSH-specific 타입 (ConnectOptions, AuthConfig, HostKeyInfo, SshError 코드 enum: `SSH_CONNECT_TIMEOUT` / `SSH_HOST_KEY_MISMATCH` / `SSH_AUTH_FAILED` / `SSH_PERMISSION_DENIED`). |

**`scanDocs` SFTP 구현 핵심**:
```ts
async function* scanDocs(root: string, patterns: string[], ignore: string[]) {
  const ignoreMatchers = ignore.map((p) => micromatch.matcher(p, { dot: true }))
  const patternMatchers = patterns.map((p) => micromatch.matcher(p, { dot: true }))

  async function* walk(dir: string): AsyncGenerator<FileStat> {
    const entries = await sftp.readdir(dir)  // promisified
    for (const e of entries) {
      const full = posix.join(dir, e.filename)
      if (ignoreMatchers.some((m) => m(full))) continue

      const isDir = (e.attrs.mode & 0o040000) !== 0  // stat() 재호출 회피 — SFTP readdir이 attrs 포함
      if (isDir) {
        yield* walk(full)
      } else if (patternMatchers.some((m) => m(full))) {
        // SFTP v3 SPEC상 attrs.mtime 선택적 필드 — 일부 구현(embedded/NAS)에서 0 반환.
        // 0이면 무효 마커 -1 설정 → SshPoller.diff에서 size 변경만으로 change 판정 폴백.
        const mtimeMs = e.attrs.mtime > 0 ? e.attrs.mtime * 1000 : -1
        yield {
          path: full,
          size: e.attrs.size,
          mtimeMs,
          isDirectory: false,
          isSymlink: false,
        }
      }
    }
  }
  yield* walk(root)
}
```

**이득**: SFTP readdir은 `longname.attrs` 포함 → 디렉토리당 stat 재호출 불필요. RTT 50ms 기준 10k 엔트리 ≈ 10 level × readdir ≈ 500ms (설계 §5.1 추정과 일치).

**단위 테스트 (S1)**:
- `src/main/transport/ssh/fs.test.ts` — stat/readFile(maxBytes)/readStream/access (mock SFTP)
- `src/main/transport/ssh/scanner.test.ts` — scanDocs FileStat 반환 + ignore 필터 + micromatch 패턴
- `src/main/transport/ssh/client.test.ts` — connect/dispose/hostVerifier 콜백 플로우

**DoD S1**:
- typecheck PASS
- SshTransport 단위 테스트 PASS (mock 기반)
- Docker sshd fixture에서 연결 1회 + readFile 1건 + scanDocs 10 entries PASS
- U1 ABI 검증 재확인 (S0 기록 유효)

---

### S2 — TOFU + ssh_config + keepalive + reconnect + 상태 머신 (1.5d)

#### S2.1 TOFU (Trust On First Use) UI

**main process**:
- `src/main/transport/ssh/hostKeyDb.ts` — electron-store slice `sshKnownHosts: Record<workspaceId, {sha256, algorithm, firstSeenAt}>`. 읽기는 `~/.ssh/known_hosts` 참조 전용 (v1.1에서 병기 옵션).
- hostVerifier 콜백 → 미등록 host → renderer에 `ssh:host-key-prompt` IPC 전송 → 사용자 응답 대기(Promise) → 결과에 따라 callback(true|false).
- **DC-4 bypass 0 구현 레벨 방어** (Critic M-3):
  - **Timeout**: 대기 Promise에 20s 타임아웃 (`readyTimeout`과 동일). 경과 시 자동 `callback(false)` + 모달 닫힘 + "Host key prompt timed out" 토스트.
  - **Nonce**: IPC payload에 `nonce: randomUUID()` 포함 → main의 pending callback Map<nonce, callback>에 등록 → `ssh:respond-host-key` IPC도 nonce를 함께 받아 정확한 callback으로 라우팅. 다중 동시 hostVerifier 호출 시 race 방지.
  - **사용자 취소**: renderer 창 닫힘·Escape·Ctrl+C 시 자동 `callback(false)` (모달 dismiss → nonce resolve with `reject`).

**renderer**:
- `src/renderer/components/SshHostKeyPrompt.tsx` — HTML modal (role="alertdialog") with:
  - 주 표시: SHA256:base64 (현대 OpenSSH 표준)
  - Fold-out 1: Visual randomart (ASCII)
  - Fold-out 2: MD5 legacy hex
  - Button: **[Don't trust]** (기본 focus — destructive default 방어) / [Show details] / **[Trust]**
  - focus trap + Escape → Don't trust
- `src/renderer/hooks/useSshHostKeyPrompt.ts` — IPC listener + 응답 dispatch

**host key 변경 UI** (DC-4 bypass 0):
- `src/renderer/components/SshHostKeyChanged.tsx` — role="alertdialog". **"Expected vs Received"** 명시. 단일 액션 `[Remove & re-trust]` (electron-store 해당 entry 삭제 → 일반 TOFU 플로우 재진입). bypass 버튼 없음.

#### S2.2 ssh_config 파싱

**신규**: `src/main/transport/ssh/config.ts`
- `ssh-config` 라이브러리로 `~/.ssh/config` 파싱
- 허용 11키 (§Design Contract + Explorer C §3.1): HostName, Port, User, IdentityFile, IdentitiesOnly, ProxyJump, ServerAliveInterval, ServerAliveCountMax, UserKnownHostsFile, StrictHostKeyChecking, Host pattern(`*` glob 일부)
- 거부 3키: **ProxyCommand** (RCE), **Include** (재귀), **Match** (exec token RCE) — 파싱 스킵 + 경고 로그
- 파일 권한 `fs.stat(configPath).mode`: `0o077 & mode !== 0` 이면 경고만 (OpenSSH 관례). 없으면 Manual entry mode.
- `StrictHostKeyChecking: no`는 **무시**(DC-4, 항상 검증).

**WorkspacePicker 확장**:
- `ssh://` 입력 시 `~/.ssh/config` 파싱 결과를 `<select>` 드롭다운으로 노출. 선택 시 HostName/Port/User/IdentityFile 자동 채움 + **편집 가능**.
- Manual entry 모드 fallback.

#### S2.3 ProxyJump 1-hop 수동 체인

`src/main/transport/ssh/client.ts` 내부:
```ts
async function connectWithProxyJump(target, jump) {
  const hop = new Client()
  await new Promise((res, rej) => hop.on('ready', res).on('error', rej).connect(jumpConfig))
  const sock = await new Promise((res, rej) =>
    hop.forwardOut('127.0.0.1', 0, target.host, target.port, (err, s) => err ? rej(err) : res(s))
  )
  const final = new Client()
  await new Promise((res, rej) =>
    final.on('ready', res).on('error', rej).connect({ sock, ...target })
  )
  return { client: final, hop, dispose: async () => { await final.end(); await hop.end() } }  // 역순
}
```

**제약**: 2+ hop은 v1.1 (설계서 Non-goal 명시). 2-hop 요청 시 "ProxyJump chain too deep — v1.0 supports single hop only" 에러.

#### S2.4 Keepalive + Reconnect + 상태 머신

**Client 옵션**:
```ts
new Client().connect({
  host, port, username,
  readyTimeout: 20000,         // ssh2 기본 유지
  keepaliveInterval: 30000,    // 30s
  keepaliveCountMax: 3,        // 3회 실패 = 90s 무응답 → disconnect
  hostVerifier: (hashedKey, callback) => { ... },
  agent: process.env.SSH_AUTH_SOCK,  // ssh-agent 기본
  privateKey: options.auth.kind === 'key-file' ? fs.readFileSync(path) : undefined,
})
```

**Reconnect backoff**:
```ts
// src/main/transport/ssh/reconnect.ts
const BACKOFF = { base: 1000, cap: 60_000, maxAttempts: 6 }
async function exponentialBackoff(attempt: number): Promise<void> {
  const delay = Math.min(BACKOFF.base * 2 ** (attempt - 1), BACKOFF.cap)
  const jitter = Math.random() * 200
  await sleep(delay + jitter)
}
// 1s → 2s → 4s → 8s → 16s → 32s → (cap 60s 전 6회 초과 → offline)
```

**상태 머신 (DC-3)**:
```
idle → connecting → connected
                 ↓ keepalive fail
                 connecting (backoff)
                 ↓ 6회 exhausted
                 offline
```

**useTransportStatus (renderer)**:
- `src/renderer/state/store.ts` 에 slice 추가: `transportStatus: 'connected'|'connecting'|'offline'`, `transportLabel: string`
- `src/renderer/hooks/useTransportStatus.ts` — 유일한 consumer (직접 store 접근 금지)
- main → renderer `transport:status` IPC 채널로 상태 전파

#### S2.5 TransportBadge + a11y (DC-3)

`src/renderer/components/TransportBadge.tsx`:
```tsx
const MAP = {
  connected: { icon: '✓', label: 'Connected', bgVar: '--ok-bg' },
  connecting: { icon: '⏳', label: 'Connecting', bgVar: '--warn-bg' },
  offline: { icon: '⚠', label: 'Offline', bgVar: '--danger-bg' },
}
<span role="status" aria-live="polite" aria-atomic="true" aria-relevant="additions text">
  <span aria-hidden="true">{MAP[status].icon}</span>
  <span>{MAP[status].label}</span>
  {status === 'connected' && <span> to {host}</span>}
</span>
```

**aria-live debounce**: backoff tick 6회가 SR 노이즈 유발 → debounce 1000ms, `connecting → connected` 전환만 즉시 발화.

**focus 복원**:
- `useTransportStatus` 내부 `focusBeforeFallbackRef` — connecting 진입 시 `document.activeElement` 저장, connected 전환 시 `.focus({ preventScroll: true })` (DOM에 여전히 존재할 때만).

**CSS 토큰** (WCAG 1.4.11 ≥3:1):
- `--ok-bg`: light `#e6f7ee` / dark `#153622`
- `--warn-bg`: light `#fff3cc` / dark `#3b2e0a`
- `--danger-bg`: light `#fdd7d7` / dark `#3d1515`
- 기존 `--image-checker-a/b` 패턴과 동일 contrast test 스크립트 재사용

**DoD S2**:
- TOFU 모달 스냅샷 테스트 PASS (4필드 노출 + destructive default 방어)
- host key 변경 → 연결 중단 테스트 (Docker sshd 재생성 후 재연결 시도)
- keepalive/reconnect 단위 테스트 (mock + 타이머 모킹)
- axe-core TransportBadge 위반 0건
- CSS 대비 ≥3:1 검증 스크립트 PASS

---

### S3 — Feature Flag + Workspace 등록 UX (1d)

#### S3.1 Feature Flag

**electron-store 확장** (`src/main/services/store.ts`):
```ts
experimentalFeatures: {
  type: 'object',
  properties: {
    sshTransport: { type: 'boolean', default: false }
  },
  default: { sshTransport: false }
}
```

**ALLOWED_PREFS_KEYS 추가** (`src/main/security/validators.ts`):
```ts
'experimentalFeatures.sshTransport'
```

**env override**: `MARKWAND_SSH=1` → store 값 override (개발자 편의)

**진입점**: `src/renderer/components/Settings.tsx` → 신규 섹션 **Experimental** → Checkbox "Enable SSH transport (alpha)" + "Alpha — may break between versions" 경고 텍스트.

**UI 숨김 전략**: flag off 일 때 **DOM 완전 제거** (disabled 아님).
- `WorkspacePicker` 의 `<select>` option "Remote workspace (SSH)" 조건부 렌더 (`experimentalSsh && <option>`)
- `ALLOWED_PREFS_KEYS` 화이트리스트 우회 방어 (prefs 검증)

#### S3.2 Workspace Schema 확장

**preload/types.ts**:
```ts
export type WorkspaceTransport =
  | { type: 'local' }
  | { type: 'ssh'; host: string; port: number; user: string; auth: AuthConfig; hostKeyFingerprint: string }

export type AuthConfig =
  | { kind: 'agent' }
  | { kind: 'key-file'; path: string }
```

**services/store.ts schema**: `transport.type enum: ['local', 'ssh']` 확장 + ssh 하위 필드 schema.

**workspace:add IPC** (ipc/workspace.ts): transport.type 분기 처리. SSH 타입 시 TOFU 플로우 진입.

**workspaceId**: SSH는 `sha1(${user}@${host}:${port}).slice(0, 16)` (로컬은 기존 randomUUID 유지).

#### S3.3 Transport Pool + DC-2 Hybrid 동시성

**신규**: `src/main/transport/pool.ts`
- `transportPool`: Map<workspaceId, Transport>
- 로컬 transport: 싱글톤 `localTransport` (기존)
- SSH transport: 최대 **active 1 + warm 1** (DC-2)
  - active: 현재 활성 워크스페이스
  - warm: 최근 활성 워크스페이스 (LRU)
- `getTransport(workspaceId)`: 필요 시 SSH connect + promote active
- 전환 시: 기존 active → warm, 새 active → connect if warm, else new

**Lifecycle 관리** (Critic M-1 반영):
- **Warm slot eviction**: 세 번째 SSH workspace로 전환 시 기존 warm을 await `dispose()` 완료 후 슬롯 교체. 실패 시 에러 전파(silent drop 금지).
- **Warm offline 감지**: warm 상태 Transport의 `useTransportStatus`가 `offline` 전이하면 pool이 해당 슬롯을 즉시 evict + `dispose()`. 다음 전환 시 재연결 시도.
- **Idle cleanup**: warm slot에서 30분 무사용(liveness touch 기반) 시 자동 evict + dispose. 이 threshold는 Settings에서 v1.1에 노출.
- **Dispose 순서**: Transport.dispose() 내부는 `sshClient.end()` + pending SFTP channel drain + socket close까지 await. pool.evict()는 dispose 완료를 await하여 호출자에게 lifecycle 완료 보장.

**전환 트리거**: 워크스페이스 전환 UI (사이드바) → `transport:switch-active` IPC.

#### S3.4 IPC 핸들러 transport 분기

**변경 지점**:
- `workspace:add` — transport.type 분기, SSH 시 TOFU 플로우
- `workspace:scan` / `workspace:refresh` / `project:get-doc-count` / `project:scan-docs` / `fs:read-doc` / `drift:verify` / `composer:estimate-tokens` — `transportPool.get(workspaceId).xxx`
- **assertInWorkspace**: transport.kind === 'ssh' 시 `{posix: true}` 전달

**preload**: `window.api.ssh.*` 네임스페이스 추가 — `connect`/`disconnect`/`respondHostKey`/`reconnect`

**DoD S3**:
- Feature flag off: WorkspacePicker에 ssh 옵션 0 (DOM grep)
- Feature flag on + SSH workspace 등록 → TOFU → 연결 → scan → viewer PASS (수동)
- assertInWorkspace posix 옵션 동작 테스트 (traversal 차단 4건)
- transport 전환 시 warm → active LRU 단위 테스트

---

### S4 — M4 원격 watcher (폴링) + 통합 테스트 (1.5d)

#### S4.1 SshPoller 구현

**신규**: `src/main/transport/ssh/watcher.ts`

```ts
export class SshPoller implements WatcherDriver {
  private ac = new AbortController()
  private snapshot: Map<string, { mtimeMs: number; size: number }> = new Map()
  private failures = 0

  watch(roots: string[], opts: WatchOptions): WatchHandle {
    this.loop(roots, opts)
    return {
      on: (event, cb) => this.emitter.on(event, cb),
      close: async () => { this.ac.abort() },
    }
  }

  private async loop(roots: string[], opts: WatchOptions) {
    const pollIntervalMs = opts.pollIntervalMs ?? this.suggestInterval(this.snapshot.size)
    while (!this.ac.signal.aborted) {
      try {
        const next = await this.fullScan(roots)  // AbortSignal 전파
        if (this.snapshot.size > 0) this.diff(this.snapshot, next)  // 초기 scan은 diff skip (all-add 폭증 방지)
        this.snapshot = next
        this.failures = 0
        await this.sleepWithSignal(pollIntervalMs)
      } catch (e) {
        if (e.name === 'AbortError') return
        this.failures++
        if (this.failures > 6) { this.emitter.emit('error', e); return }  // → offline
        const delay = Math.min(1000 * 2 ** (this.failures - 1), 60_000) + Math.random() * 200
        await this.sleepWithSignal(delay)
      }
    }
  }

  private suggestInterval(size: number): number {
    return size >= 10_000 ? 60_000 : 30_000  // 2구간
  }

  private diff(prev: Snapshot, next: Snapshot) {
    for (const [path, stat] of next) {
      const old = prev.get(path)
      if (!old) this.emit('add', stat)
      else {
        // mtime=-1(무효) 폴백 — size 변경만으로 change 판정 (SFTP attrs.mtime 0 반환 구현 대응, M-2)
        const mtimeChanged = old.mtimeMs !== -1 && stat.mtimeMs !== -1 && old.mtimeMs !== stat.mtimeMs
        const sizeChanged = old.size !== stat.size
        if (mtimeChanged || sizeChanged) this.emit('change', stat)
      }
    }
    for (const path of prev.keys()) if (!next.has(path)) this.emit('unlink', path)
  }
}
```

**주요 특성**:
- **AbortController 전파**: `fullScan` 내부 SFTP readdir 재귀에서 `if (signal.aborted) throw new AbortError()` chunk boundary 수동 체크
- **동적 2구간**: <10k → 30s / ≥10k → 60s (S4에선 초기 scan 후 size 결정)
- **Debounce**: chokidar `awaitWriteFinish` 2000ms 관례 준수 — 이벤트 발화 전 2000ms stabilityThreshold (같은 path에서 2초 내 재변경 시 합치기)
- **Backoff on error**: 연속 stat 실패 → exp backoff 1s~60s cap, 7회 초과 시 `error` emit → `offline` 전이

#### S4.2 workspace:refresh 재사용 (Manual mode)

- 사용자 설정: `{30s, 60s, 'manual'}` (기본 auto = 2구간 동적)
- `'manual'` 선택 시: watcher 비활성, 기존 `workspace:refresh` IPC로 사용자 명시 트리거 재사용

#### S4.3 Docker sshd 통합 테스트 (R11)

**신규 파일**:
- `tests/fixtures/ssh/docker-compose.yml` (linuxserver/openssh-server)
- `tests/fixtures/ssh/keys/id_ed25519{,.pub}` (test-only keypair — README에 "통합 테스트 전용, 프로덕션 금지" 명시)
- `tests/fixtures/ssh/remote-workspace/` (5 projects × 10 md 고정 트리)
- `tests/integration/ssh.test.ts` (vitest)

**최소 6건 테스트**:
1. **T-conn-001**: 정상 연결 (TOFU 최초) — hostVerifier 호출 + trust → ready
2. **T-hostkey-001**: hostKey 변경 감지 — sshd 재생성 후 재연결 → `SSH_HOST_KEY_MISMATCH` 에러
3. **T-fs-read-001**: readFile 성공 + `FILE_TOO_LARGE` — 1KB OK, 3MB → 에러
4. **T-scanner-001**: readdir + scanDocs — 5 projects × 10 md = 50 entries, FileStat shape 정확
5. **T-reconnect-001**: 연결 끊김 후 reconnect — `docker stop sshd` → backoff → `docker start` → connected 복구
6. **T-permission-001**: permission denied — `chmod 000` 파일 → `SSH_PERMISSION_DENIED`

**실행 방식**:
- 로컬: `docker compose -f tests/fixtures/ssh/docker-compose.yml up -d` + `SSH_HOST=127.0.0.1 SSH_PORT=2222 pnpm test:integration-ssh`
- CI: GitHub Actions `services.sshd` 블록 (해당 workflow 파일 생성 — `.github/workflows/integration-ssh.yml`, 단 CI 활성화는 **S5 이후 선택적**)

**M3·M4 스코프에서 Stretch (v1.1 후보)**: ProxyJump 테스트, agent forwarding, Windows sshd.

**DoD S4**:
- 6건 통합 테스트 PASS (로컬 Docker 환경)
- SshPoller 단위 테스트 PASS (mock SFTP + 타이머 mock)
- manual mode 토글 → watcher 비활성 확인
- `fs:change` IPC 페이로드 로컬·원격 동일 shape 검증

---

## Sprint Contract

### S0 — Prerequisite (0.5d)
- [ ] `scripts/verify-ssh2-abi.ts` 작성
- [ ] ssh2 + @types/ssh2 + ssh-config 설치 (pnpm --no-optional)
- [ ] package.json build.buildDependenciesFromSource:false + asarUnpack
- [ ] `build/entitlements.mac.plist` 신규
- [ ] U1 검증 + `docs/investigations/ssh2-abi-<YYYY-MM-DD>.md` 기록 (날짜는 실행일)
- [ ] **SFTP attrs.mtime 실측** (Critic M-2): Docker sshd fixture에서 readdir 시 `attrs.mtime > 0` 확인. fallback 패키지 고려 시 동일 실측 반복.
- [ ] RM-7 해소: `services/scanner.ts`의 Doc generator 로직을 IPC 핸들러 헬퍼 `composeDocsFromFileStats`로 이식 + `parseFrontmatter(fs, path, opts?)` 시그니처 변경
- [ ] 단위 테스트: composeDocsFromFileStats 3건, parseFrontmatter 2건
- **DoD**: typecheck + vitest 전체 PASS + drift-smoke 21/21 + bench-transport ≤3% + U1 기록 + Docker sshd 연결 1회 성공 (Node runtime) + attrs.mtime 실측 결과 기록
- **DoD scope-down** (S0 Evaluator C-1 반영): **Electron 33 context 에서 ssh2 `new Client()` 인스턴스화 실측은 S1.1 로 이연**. S0 는 Node runtime(`pnpm tsx`) 에서만 검증. S1.1 에서 `pnpm dev` 시 main process 모듈 로드 경로에 dynamic import 1회 포함 — 실패 시 `ssh2-electron-no-cpu-features` fallback 에스컬레이트.
- **의도적 시맨틱 변경** (S0 Evaluator M-1): `LocalScannerDriver.scanDocs` 가 `fs.stat` 실패 시 **Doc 미생성** (silent skip). 기존 `services/scanner.scanDocs` 의 `mtime=Date.now()` 가짜 Doc 생성 패턴을 중단. 다음 scan 에서 파일 회복 시 정상 수집. SSH Transport 에도 동일 원칙 적용.

### S1 — SshTransport 기본 PoC (2d)
- [ ] `src/main/transport/ssh/{client,fs,scanner,index,types}.ts` + `util/promisifiedSftp.ts` 신규 (6 파일)
- [ ] **S1.1 Electron ABI 실측** (S0 Evaluator C-1 이연): `pnpm dev` 기동 후 main process 에서 `new Client()` 1회 dynamic import + 인스턴스화. 결과를 `docs/investigations/ssh2-abi-*.md` 에 "Electron 33 실측" 섹션으로 추가.
- [ ] **SshFsDriver.readStream 서버측 범위 최적화** (S0 Evaluator M-2): `parseFrontmatter` 호출 시 transport 가 SSH 인 경우 `sftp.createReadStream(path, { start: 0, end: maxBytes - 1 })` 로 구현. 로컬 64KB 첫 청크 낭비 패턴이 SSH 로 전파되지 않도록 차단. 단위 테스트: `sftp.createReadStream` mock 에서 end 옵션 전달 확인 1건.
- [ ] 단위 테스트 3 파일 (fs.test.ts, scanner.test.ts, client.test.ts)
- [ ] Docker sshd smoke: 연결 + readFile + scanDocs 10 entries PASS
- **DoD**: typecheck + SshTransport unit tests + Docker smoke + **Electron 33 ABI 실측 PASS** + readStream 범위 요청 단위 테스트 PASS

### S2 — TOFU + ssh_config + keepalive + 상태 머신 (**2.5d**, Critic M-5 반영)
- [ ] `src/main/transport/ssh/{hostKeyDb,config,reconnect}.ts` + `src/renderer/components/{SshHostKeyPrompt,SshHostKeyChanged,TransportBadge}.tsx`
- [ ] `src/renderer/hooks/{useTransportStatus,useSshHostKeyPrompt}.ts`
- [ ] store slice `transportStatus` + IPC `transport:status` 채널
- [ ] `ssh-config` 파싱 + 허용 11키/거부 3키(파싱 스킵 시 **해당 Host 블록 전체를 드롭다운에서 제외** + 경고 토스트 "Unsupported config directive", Critic m-2) + 권한 검증
- [ ] ProxyJump 1-hop 수동 체인 (client.ts 내부, dispose 역순 `final.end() → hop.end()`)
- [ ] hostVerifier race/timeout 방어: nonce IPC + 20s 타임아웃 → callback(false), 다중 동시 호출 라우팅 (Critic M-3)
- [ ] **HostKeyInfo.algorithm 확보** (S1 Evaluator m-3): ssh2 'handshake' 이벤트에서 hostKeyAlgorithm 추출 → TOFU 모달 4필드 중 Algorithm 실제 값 표시. `buildHostKeyInfo` 의 'unknown' 고정 제거.
- [ ] axe-core test + CSS 대비 test + **aria-live debounce 타이머 mock 테스트** (Critic m-3): `vi.useFakeTimers()` + 1000ms debounce + backoff 6 tick 시 SR 노이즈 0건 검증
- **DoD**: TOFU 모달 스냅샷(4필드 + destructive default) + hostkey 변경 감지 integration + keepalive/reconnect unit + hostVerifier race/timeout 2건 + algorithm 'unknown' 이 아닌 실제 값 노출 + axe 0 위반 + CSS ≥3:1 + aria-live debounce 타이머 테스트 1건

### S3 — Feature Flag + Workspace UX (1d)
- [ ] electron-store `experimentalFeatures.sshTransport` + ALLOWED_PREFS_KEYS
- [ ] MARKWAND_SSH=1 env override (main process)
- [ ] `src/renderer/components/Settings.tsx` — Experimental 섹션
- [ ] WorkspacePicker 조건부 렌더 (DOM 제거)
- [ ] workspace schema ssh 타입 + lazy 마이그레이션
- [ ] `src/main/transport/pool.ts` (DC-2 active 1 + warm 1) + **warm eviction + dispose()** (Critic M-1)
- [ ] 7개 IPC 핸들러 transport 분기 (workspace:add + 6개 경유)
- [ ] assertInWorkspace `{posix: true}` 활성화 — **transport.kind==='ssh' 시에만 전달** (Critic m-5 Windows 로컬 경로 회귀 방어)
- [ ] `validators.ts` `parseScanInput` workspaceId 검증 UUID → `UuidInput | SshWorkspaceIdInput`(16자 hex) union 확장 (Critic M-4)
- **DoD**: flag off DOM grep 0건 / flag on SSH 워크스페이스 등록 → 수동 골든 패스 PASS / assertInWorkspace traversal 4건 / Windows 로컬 경로에 posix:true 적용 금지 불변 테스트 1건 / warm slot eviction → dispose() 호출 단위 테스트 1건

### S4 — M4 원격 watcher 폴링 + 통합 테스트 (1.5d)
- [ ] `src/main/transport/ssh/watcher.ts` SshPoller (mtime=-1 폴백 포함, Critic M-2)
- [ ] `tests/fixtures/ssh/` — docker-compose + **ephemeral keypair 생성 스크립트** (git 체크인 0, CI/로컬 생성, Critic m-1) + remote-workspace fixture
- [ ] `tests/integration/ssh.test.ts` — 6 케이스. **T-reconnect-001은 `vi.useFakeTimers()`로 backoff sleep 가속** (Critic m-4). Docker stop/start 자체는 실시간, sleep 구간만 mock.
- [ ] manual mode UI (Settings)
- [ ] `package.json` scripts: `test:integration-ssh` + `tests/fixtures/ssh/gen-keypair.sh` (ed25519 임시 키 생성, fixture 디렉토리에 출력 — .gitignore 등록)
- **DoD**: 6건 통합 테스트 PASS (reconnect 테스트 ≤30s timeout 내 완료) + SshPoller unit + manual mode 토글 확인 + fs:change shape 동일 + attrs.mtime=0 폴백 단위 테스트 1건

**총 추정**: **7.5일** (Critic M-5 반영, S2 +1d). 2026-04-22 → 2026-05-02, 중간 인터럽트 완충 1일 포함 시 2026-05-05.

## Risk Map

| ID | 영역 | 위험 | 심각도 | 대응 |
|----|------|------|--------|------|
| **RM-M3-1** | U1 ssh2 ABI | Electron 33 재빌드 실패 / cpu-features 호환성 | **High** | S0 VH-U1 검증 + buildDependenciesFromSource:false + --no-optional. 실패 시 `ssh2-electron-no-cpu-features` fallback + fallback 패키지 SFTP 완전성 재검증(U-M3-7). |
| **RM-M3-2** | 보안 | TOFU bypass 허용 시 MITM | **High** | DC-4 강제. bypass 0. 연결 중단 + "Remove & re-trust" 명시 경로만. 통합 테스트 T-hostkey-001로 회귀 감지. |
| **RM-M3-3** | 보안 | `ssh_config` ProxyCommand/Match 파싱 시 RCE | **High** | ssh-config 파서가 Include·Match·ProxyCommand 만나면 **파싱 스킵 + 경고 로그**. WorkspacePicker에서 해당 Host 블록은 "Unsupported config" 토스트. |
| **RM-M3-4** | 성능 | 폴링 watcher가 대형 워크스페이스(10k+)에서 IO 폭발 | Medium | 동적 2구간(30s/60s) + manual 모드 옵션. SFTP readdir attrs 재활용으로 stat 재호출 회피. 연속 실패 backoff. |
| **RM-M3-5** | 신뢰성 | ProxyJump 1-hop dispose 역순 누수 | Medium | client.ts 내부에서 `final.end() → hop.end()` 역순 강제. unit 테스트 2건. |
| **RM-M3-6** | macOS 번들 | entitlements.mac.plist 누락으로 notarization 실패 | Medium | S1에서 plist 생성 + dist:mac 시 `electron-builder notarize` 로그 확인. |
| **RM-M3-7** | 번들 사이즈 | ssh2 eager import → flag off 사용자도 ssh2 로드 | Medium | flag off일 때 **dynamic import** 보장 (`const { createSshTransport } = await import('./transport/ssh')`). 번들 grep verification hook. |
| **RM-M3-8** | UX | 원격 "열기"가 수 초 지연으로 "먹통" | Medium | Skeleton + "Connecting to host..." aria-live + ETA 표시. `useTransportStatus` 훅 연계. |
| **RM-M3-9** | 테스트 | Docker sshd CI 설정 복잡도 | Medium | S4에서 로컬 docker-compose만 필수. GH Actions workflow는 작성하되 활성화는 **사용자 승인 후** 선택. |
| **RM-M3-10** | 호환 | macOS SSH agent (1Password/system) 다양성 | Low | `SSH_AUTH_SOCK` 환경변수 경로만 사용. Keychain 직접 접근 금지. |
| **RM-M3-11** | 성능 회귀 | SSH transport pool / lazy import가 로컬 경로에 오버헤드 | **High** | DC-5 gate. bench-transport.ts p95 회귀 ≤3% 확인 (로컬 baseline 유지). |

## Unknowns

- **U-M3-1** — macOS entitlements plist 4 키 조합이 notarization에 충분한가. 실제 `pnpm dist:mac` + 공증 → 설치 테스트 필요 (S4 이후 별도 세션).
- **U-M3-2** — Docker sshd 컨테이너 재생성 시 host key 자동 교체 여부. linuxserver 이미지 volume 설정에 따라 다름 — T-hostkey-001 작성 시 확인.
- **U-M3-3** — 폴링 30초가 실 사용 워크스페이스(1k~10k md)에서 UX 체감 허용 범위인가. S4 이후 dogfood 피드백 대기.
- ~~**U-M3-4**~~ → **해소 (Critic m-1 반영)**: test keypair는 git 체크인 대신 `tests/fixtures/ssh/gen-keypair.sh` 로 로컬/CI에서 ephemeral 생성. `.gitignore`에 `tests/fixtures/ssh/keys/` 추가. GitHub secret scanning 회피 불필요.
- **U-M3-5** — Active Design §3.3 app:// 원격 확장(M5)은 이 Plan 스코프 밖. M3·M4 완료 후 별도 Plan 작성 시 TransportBadge + useTransportStatus 재사용 여부 확인.
- **U-M3-6** (신규, Critic M-2) — SFTP v3 `attrs.mtime` 필드가 실 구현체(linuxserver/openssh-server + 사용자 원격)에서 신뢰할 수 있는가. S0.1에서 실측. 0 반환 시 size 기반 change 폴백이 **실사용 false-negative 허용 범위** 인지 dogfood 대기.
- **U-M3-7** (신규, Critic 종합 평가) — `ssh2-electron-no-cpu-features` fallback 패키지의 SFTP 완전성(readdir attrs 필드·createReadStream back-pressure·hostVerifier API 호환성)이 ssh2 공식과 동일한가. S0.1 fallback 시나리오에서 별도 실측 필요.

## Verification Hooks

1. **VH-U1-ssh2-abi** (S0): `scripts/verify-ssh2-abi.ts` 실행 — macOS arm64/x64 양쪽. 결과 `docs/investigations/ssh2-abi-2026-04-22.md`. 실패 시 fallback 판단.
2. **VH-typecheck**: `pnpm typecheck` — 0 error (매 S 완료 시)
3. **VH-unit**: `pnpm test` — 전체 PASS (S1~S4 신규 테스트 포함)
4. **VH-drift-smoke**: `pnpm tsx scripts/drift-smoke.ts` — 21/21 PASS 유지 (로컬 회귀 0)
5. **VH-bench-DC5**: `pnpm run bench:transport` — fixture baseline 대비 p95 회귀 ≤ 3% (DC-5)
6. **VH-ssh-integration**: `pnpm test:integration-ssh` — 6건 PASS (Docker sshd 필요)
7. **VH-a11y**: axe-core TransportBadge + SshHostKeyPrompt — WCAG 1.4.11/4.1.3/2.1.2 위반 0건
8. **VH-flag-off-bundle**: flag off 번들에서 `ssh2` runtime import가 **dynamic import** 확인 (grep 또는 electron-vite manifest 분석). eager import 발견 시 실패.
9. **VH-tofu-snapshot**: SshHostKeyPrompt 스냅샷 테스트 — 4필드 노출 + destructive default(Don't trust) 확인
10. **VH-manual-mode**: SSH watcher manual 모드 토글 후 자동 폴링 중단 확인
11. **VH-contrast**: CSS 대비 스크립트 (v0.3.1 이미지 체스보드 재사용) — `--ok/warn/danger-bg` 토큰 ≥3:1
12. **VH-e2e-golden**: `pnpm dev` + feature flag on + SSH workspace 등록 → TOFU → scan → viewer 골든 패스 (수동 검증)
13. **VH-independent-evaluator**: `/nova:review` 또는 nova:evaluator 독립 서브에이전트 Critical 0 / Major ≤ 3 (반영 또는 Known Gap 이관)

## Rollback 경로

- **S0 단독 rollback**: `scripts/verify-ssh2-abi.ts` 삭제 + package.json 의존성 제거 + scanner.ts Doc generator 복원 (git revert 1~2 커밋). **`build.buildDependenciesFromSource`·`build.asarUnpack`·`build/entitlements.mac.plist`는 ssh2 의존성 제거와 함께 반드시 동시 revert** (Critic M-4) — 보안 권한이 잔존하면 notarization 측면에서 불필요한 cs.disable-library-validation 상태 방치.
- **S1 rollback**: `src/main/transport/ssh/` 제거 + ssh2/@types/ssh2/ssh-config 의존성 revert + package.json build 섹션 원복 (Critic M-4).
- **S2 rollback**: TOFU 컴포넌트 + hostKeyDb 제거 → useTransportStatus 훅은 유지(로컬에도 의미 있음). S3·S4는 S2 의존이라 동시 rollback.
- **S3 rollback**: feature flag off 고정 + WorkspacePicker ssh 옵션 제거. transport pool은 싱글톤 localTransport fallback. **기존 사용자의 electron-store에 SSH workspace 엔트리가 남은 경우 lazy 마이그레이션으로 무시(읽기 전용, 표시 안 함)** — 스키마 호환성 보장.
- **S4 rollback**: SshPoller 제거 + manual 모드 강제.
- **독립 커밋 원칙**: 각 S는 최소 1~3개 논리 커밋으로 분리 — 선택적 rollback 보장.
- **Feature flag 덕분에 user-facing rollback 비용은 "flag off 디폴트 유지"로 0**.

## Known Risk 연계 결정

| Known Risk / Gap | M3·M4 연계 | 결정 |
|-----------------|-----------|------|
| `preload onDocsChunk/onChange raw event 노출` (Medium) | S0·S3 IPC 핸들러 리팩터 범위 | **M3 스코프 외** — 별도 PR (data-only wrapper) |
| `drift mtime 정밀도 / git checkout` (v0.3 Low) | 로컬 문제, 원격 SFTP 1초 정밀도로 증폭 | **M3 스코프 외** — M2 판정 재설계 별도 Plan (U-M2-1 이후) |
| `FsChangeEvent mtime 누락` (v0.4 Low) | M4 watcher 재도입 | **S4에서 mtime 포함** (SshPoller는 snapshot의 mtimeMs 직접 전파) |
| `⌘K 검색 backend 미구현` (v0.3 High) | 독립 이슈 | 병행 가능, M3·M4와 무관 |
| `drift 코드 파일 변경 자동 감지` (v0.3 Medium) | 독립 이슈 | 병행 가능 |
| `readDocs GC` (v0.2 Hard) | 독립 이슈 | 병행 가능 |
| `RM-7 project:scan-docs 미위임` (M1 Medium) | **S0.2에서 해소** | ✅ 이 Plan에서 처리 |

## Refs

- Design: `docs/designs/remote-fs-transport.md` (§2.2, §3.1, §3.3, §4.1~4.5, §5, §6)
- Prior Plan: `docs/plans/remote-fs-transport-m1-m2.md` (v0.9 M1·M2 완료)
- Prior Plan: `docs/plans/image-viewer-mvp.md` (v0.3 완료)
- UX Audit: 2026-04-21 `/nova:ux-audit` 5 jury 산출 DC-1~DC-7
- Explorer 리포트 (이 deepplan 세션):
  - (A) Transport 계층 현상태 매핑 — IPC 위임 실태 + RM-7 정밀 분석
  - (B) ssh2 + Electron ABI + Docker fixture — 추천 라이브러리·번들링·VSCode Remote-SSH 참조 아키텍처
  - (C) 원격 watcher + TOFU + feature flag + a11y — 폴링 2구간·bypass 0·a11y WCAG 1.4.11 토큰
- External:
  - [ssh2 NPM v1.17.0](https://github.com/mscdex/ssh2) + [@types/ssh2 1.15.5](https://www.npmjs.com/package/@types/ssh2)
  - [ssh-config cyjake/dotnil v5.1.0](https://github.com/cyjake/ssh-config)
  - [linuxserver/openssh-server](https://github.com/linuxserver/docker-openssh-server)
  - [Electron — Native Node Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
  - [ssh_config(5) OpenBSD](https://man.openbsd.org/ssh_config)
  - [WCAG 2.1 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)
- Orchestration ID: (할당 예정 — /nova:auto 실행 시)

---

> **사용자 결정 필요** (Critic 반영 후 승인):
> 1. S4의 CI 통합(GitHub Actions `services.sshd`) workflow 파일을 S4에서 함께 생성할지, 아니면 dogfood 피드백 후 별도로 할지
> 2. ~~test-only keypair git 체크인 여부~~ → **해소**: ephemeral keypair 생성 스크립트로 확정 (Critic m-1)
> 3. `macOS dist:mac` 공증 테스트를 S4에 포함할지, 별도 릴리스 세션으로 분리할지 (U-M3-1)
> 4. S2를 2.5d 단일 스프린트로 유지할지 (현재 선택), 아니면 S2a(TOFU+상태머신 1.5d) / S2b(ssh_config+ProxyJump 1d)로 분할할지 (Critic M-5 대안)
>
> **Critic 리뷰 결과**: CONDITIONAL PASS (Critical 1 + Major 5 + Minor 5). 전 항목 반영 완료. 구조 재작성 불필요.
