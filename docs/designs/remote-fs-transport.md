---
slug: remote-fs-transport-design
sprint: TBD (구현 스프린트 없음 — 이 문서는 설계만)
created: 2026-04-21
status: draft
plan_ref: none (implementation plan은 v1.0 단계에서 별도 작성)
target_version: v1.0
---

# Remote FS Transport — SSH/SFTP 원격 워크스페이스 설계서

> **이 문서의 목적**
> Markwand를 로컬 전용에서 **SSH/SFTP 원격 워크스페이스까지 지원**하도록 재설계하기 위한 **아키텍처 설계서**다. 구현 계획(`Plan`)이나 스프린트 분할은 포함하지 않는다. v1.0 구현 시작 전 `docs/plans/remote-fs-transport-mvp.md`를 별도 작성한다.
>
> **이 설계서가 답해야 할 질문**
> 1. 로컬/원격 FS를 한 인터페이스 뒤로 추상화할 때 최소 표면은 무엇인가?
> 2. 원격 파일 변경 감지(chokidar 대체)를 어떻게 할 것인가?
> 3. `app://` 프로토콜로 원격 이미지를 어떻게 스트리밍할 것인가?
> 4. Drift 검증(mtime 기반)을 원격에서 어떻게 신뢰할 수 있는가?
> 5. "Open in Claude"가 원격 워크스페이스에서 무엇을 의미하는가?
> 6. 기존 로컬 코드를 깨지 않고 **점진적으로** 도입하는 경로는 무엇인가?

---

## 1. Context

### 1.1 문제

Markwand v0.2까지는 `~/develop/*` 같은 **로컬 디스크 경로**를 워크스페이스로 등록해야 사용 가능하다. 실제 개발 현장은 다르다:

- AI 산출물 중 상당 부분은 **원격 개발 서버**(jump host, EC2, dev container)에 존재한다.
- 사용자는 VSCode Remote-SSH로 편집하지만, 그 산출물을 큐레이션할 도구가 없다.
- 팀 공유 워크스페이스(회사 NAS·shared dev box)를 Markwand로 열 수 없다.

SSH 지원은 Markwand를 **"내 랩톱 안 문서만"에서 "내가 작업하는 모든 위치의 AI 산출물"로** 확장하는 결정적 기능이다. 대신 기술적 복잡도는 **v0.x 작업의 5~10배**.

### 1.2 조사 결과 요약 (Explorer 리포트)

현재 로컬 FS 가정이 박힌 지점 난이도 매트릭스:

| 영역 | 난이도 | 핵심 이슈 |
|------|-------|----------|
| `fs.promises.*` 호출 (10+곳) | **HIGH** | scanner/ipc/drift 전반 |
| `chokidar` watch (realtime) | **HIGH** | FSEvents/inotify 이벤트 모델 → 원격에선 존재 안 함 |
| Drift mtime 정밀도 | **HIGH** | SFTP 1초 단위, 로컬 FAT32 동일 문제가 네트워크로 증폭 |
| `fast-glob` scan | **MEDIUM** | stream API 교체 가능, symlink 정책 정리 필요 |
| `path` 모듈 (OS별 sep) | **MEDIUM** | 원격은 항상 POSIX — `path/posix` 경계 필요 |
| `app://` protocol | **MEDIUM** | `net.fetch(pathToFileURL)` → 원격 스트리밍 대체 |
| `claude:open` (터미널) | **MEDIUM** | SSH 세션으로 개념 재정의 필요 |
| electron-store schema | **LOW** | workspace 엔트리에 `transport` 필드 추가 |
| preload IPC 표면 | **LOW** | 채널명·계약 유지, 페이로드 호환만 |
| 테스트 하네스 | **MEDIUM** | Docker sshd 기반 integration layer 신설 |

### 1.3 비목표 (Non-Goals)

- 원격 파일 **편집**. Markwand는 read-only 정체성을 유지한다.
- **동시 편집/커서 동기화** (VSCode Live Share 수준).
- **Git 원격 브라우저** (GitHub/GitLab API 기반 탐색) — 이는 별도 transport 후보.
- **Windows 원격 호스트**. SSH 서버는 POSIX(Linux/macOS)만 v1.0에서 지원.
- **2FA·PAM OTP·hardware key 로그인**. 키 기반 또는 ssh-agent 위임만.

---

## 2. Architectural Overview

### 2.1 4계층 모델

```
┌────────────────────────────────────────────────────────────┐
│ UI Layer (Renderer)                                        │
│   WorkspacePicker, FileTree, MarkdownViewer, ImageViewer  │
│   — transport 무관, 동일 컴포넌트                            │
└────────────┬───────────────────────────────────────────────┘
             │ preload IPC (window.api.*) — 채널 계약 동일
┌────────────▼───────────────────────────────────────────────┐
│ IPC Layer (main/ipc)                                       │
│   workspace / fs / drift / claude / project                │
│   — 각 핸들러가 Transport 객체에 위임                        │
└────────────┬───────────────────────────────────────────────┘
             │
┌────────────▼───────────────────────────────────────────────┐
│ Transport Abstraction (NEW, src/main/transport/)           │
│   interface Transport { fs, scanner, watcher, exec }       │
│   — 본 설계의 핵심                                          │
└────────────┬──────────────────┬────────────────────────────┘
             │                  │
┌────────────▼─────────┐  ┌────▼──────────────────────────┐
│ LocalTransport       │  │ SshTransport                   │
│ fs.promises.*        │  │ ssh2 (NPM), SFTP subsystem     │
│ chokidar             │  │ + polling/inotify relay        │
│ fast-glob            │  │ + custom recursive walker      │
│ execa (claude CLI)   │  │ + ssh exec channel             │
└──────────────────────┘  └────────────────────────────────┘
```

**핵심 원칙:** IPC 핸들러와 UI는 **transport를 모른다**. workspace에 `transport` 태그가 붙고, IPC 핸들러가 해당 transport 인스턴스를 lookup해서 위임한다.

### 2.2 Transport 인터페이스 (초안)

```ts
// src/main/transport/types.ts (NEW)

export interface FileStat {
  path: string            // POSIX normalized
  size: number
  mtimeMs: number         // best-effort, 1초 정밀도 가정
  isDirectory: boolean
  isSymlink: boolean      // local only; sftp는 항상 false
}

export interface ReadOptions {
  maxBytes?: number       // 기본 2MB
  encoding?: 'utf8' | 'binary'
}

export interface FsDriver {
  stat(absPath: string): Promise<FileStat>
  readFile(absPath: string, opts?: ReadOptions): Promise<Buffer>
  readStream(absPath: string, opts?: ReadOptions): AsyncIterable<Uint8Array>  // for app:// streaming
  access(absPath: string): Promise<boolean>  // existence check w/o throw

  // rev. M1 (2026-04-21) — readFile의 기본 maxBytes는 2MB. 초과 시 FILE_TOO_LARGE 에러.
  // NOVA-STATE Known Risk "fs:read-doc 파일 크기 무제한"을 FsDriver 계약 수준에서 해소.
}

export interface ScannerDriver {
  countDocs(root: string, patterns: string[], ignore: string[]): Promise<number>
  scanDocs(root: string, patterns: string[], ignore: string[]): AsyncIterable<FileStat>
  // patterns/ignore는 POSIX glob, transport별 구현체가 해석

  // rev. M1 (2026-04-21) — workspace container/single 모드 감지. 루트 자체가 프로젝트 마커를
  // 포함하면 'single', 하위 디렉토리들이 각자 마커를 가지면 'container'.
  // 원격 transport는 root 하위 readdir로 구현하며, 로컬과 동일 계약.
  detectWorkspaceMode(root: string): Promise<'container' | 'single'>
}

export interface WatcherDriver {
  watch(roots: string[], opts: WatchOptions): WatchHandle
}

export interface WatchHandle {
  on(event: 'add'|'change'|'unlink', cb: (stat: FileStat) => void): void
  on(event: 'error', cb: (err: Error) => void): void
  close(): Promise<void>
}

export interface WatchOptions {
  ignored: (path: string) => boolean
  debounceMs: number      // 로컬 150, 원격 2000 등 transport별 기본값
  pollIntervalMs?: number // 원격 폴링 간격 (옵션)
}

export interface ExecDriver {
  // claude:open 등 명령 실행
  run(cmd: string, args: string[], opts: ExecOptions): Promise<ExecResult>
  // 로컬: execa. 원격: ssh2 exec channel.
}

export interface Transport {
  id: string                 // 'local' | 'ssh:<workspaceId>'
  kind: 'local' | 'ssh'
  fs: FsDriver
  scanner: ScannerDriver
  watcher: WatcherDriver
  exec: ExecDriver
  dispose(): Promise<void>   // 연결 종료
}
```

**설계 의도:**
- `FsDriver`가 **`readStream`을 별도 노출**한 이유 — app:// 프로토콜이 큰 이미지/바이너리를 Buffer 왕복 없이 직접 네트워크 스트림으로 흘리기 위해.
- `ScannerDriver`와 `WatcherDriver`를 `FsDriver`에서 분리한 이유 — SSH transport는 glob·watch를 **완전히 다른 메커니즘**(서버 측 스크립트 업로드)으로 구현 가능성 있음. 결합하면 교체 비용 상승.
- `ExecDriver`를 transport에 묶은 이유 — "Open in Claude"가 로컬이면 osascript, 원격이면 ssh exec. 사용자 입장에선 같은 동작이라 같은 추상에 속해야 함.

### 2.3 Workspace 모델 확장

```ts
// store.ts schema (EXTENDED)

workspaces: {
  id: string
  name: string
  root: string                    // local: 절대경로; ssh: 원격 POSIX 절대경로
  transport:                      // NEW
    | { type: 'local' }
    | {
        type: 'ssh'
        host: string              // 'myserver.example.com'
        port: number              // 기본 22
        username: string
        auth:                     // NEW
          | { kind: 'agent' }     // ssh-agent 위임 (권장)
          | { kind: 'key-file'; path: string }  // ~/.ssh/id_rsa
          // password는 v1.0 배제 — 키만 허용
        hostKeyFingerprint: string  // known_hosts 검증용, TOFU 최초 등록 후 고정
      }
  mode: 'container' | 'single'
  addedAt: number
  lastOpened: number | null
}
```

**보안 고정점:**
- SSH 패스워드 로그인 v1.0 금지. 다 ssh-agent 또는 키 파일.
- `hostKeyFingerprint`를 **사용자 onboarding 시 표시 후 저장**(TOFU). 이후 불일치 시 자동 연결 거부 + UI 에러.
- 키 파일 경로만 저장. **키 내용 자체는 절대 electron-store에 쓰지 않는다.**
- 패스워드나 키 패스프레이즈가 필요한 경우 **OS 키체인**(macOS Keychain via `node-keytar`) 위임. v1.0 범위는 ssh-agent 전제.

---

## 3. 핵심 설계 결정

### 3.1 원격 파일 변경 감지 (chokidar 대체)

**대안 비교:**

| 전략 | 장점 | 단점 | 결론 |
|------|------|------|------|
| **A. 클라이언트 폴링** (SFTP stat 주기적 실행) | 서버 측 수정 0, 어디서든 작동 | 레이턴시(기본 30s), 대형 워크스페이스에서 stat 폭발, mtime 1초 정밀도 | **v1.0 기본** |
| **B. SSH-tunneled `fswatch`/`inotifywait`** | 실시간, 로컬과 동등 UX | 원격에 `fswatch`/`inotify-tools` 설치 필요, 권한·OS 종속 | **v1.1 옵션** |
| **C. 서버 측 agent 프로세스** | 완전 통제, 부가 기능(해시 선계산) 가능 | 운영 복잡도, 사용자 부담 | **v2.0 이후** |

**v1.0 선택 — A (폴링) + 선택적 B:**

```ts
// SshWatcherDriver 의사코드
class SshPoller implements WatcherDriver {
  watch(roots, opts) {
    // 1. 초기 스냅샷: SftpScanner로 전체 트리 stat 수집 → (path, mtimeMs, size) Map
    // 2. setInterval(opts.pollIntervalMs ?? 30_000) — 다시 스캔 → diff
    //    - 새 path: add 이벤트
    //    - mtime/size 변경: change 이벤트
    //    - 사라진 path: unlink 이벤트
    // 3. debounceMs 내 중복 이벤트 억제
    // 4. "실시간" 체감 필요 시 옵션 B로 업그레이드 (설정)
  }
}
```

**폴링 간격 기본 30초의 근거:**
- Markwand는 write-once read-many 워크플로우 (AI가 새 md 생성 → 사용자 즉시 소비가 드묾).
- 5초 폴링은 서버 I/O·네트워크 부담 과다, 10k files 기준 왕복 ≥ 3s 관측.
- 30초는 UX 허용 가능 + 서버 부하 최소 balance.
- 설정에서 `{5, 10, 30, 60, 'manual'}` 선택 가능.

### 3.2 Drift 검증 재설계

로컬에서도 **Known Gap**으로 남아있는 mtime 정밀도 문제가 SFTP에선 더 심각해진다. v1.0 단계에서 **content hash 기반 판정으로 전환**이 필요하다.

```ts
// 현재 (mtime 기반)
status = docMtime > refMtime ? 'ok' : 'stale'

// v1.0 (hash 기반, transport 공통)
status = docHash === refHashAtLastCheck ? 'ok' : 'stale'
```

**트레이드오프:**
- 장점: mtime 오판 제거, git checkout·FAT32·SFTP 1초 정밀도 문제 해결.
- 단점: 파일 전체 읽기 필요 → SSH 대역폭 소비. 단, drift extractor는 **참조된 파일만** 검증하므로 대상은 수~수십 개 수준.
- 완화: hash 결과를 `(path, mtimeMs) → hash` 캐시. mtime 불변이면 hash skip.

**스코프 가드:** hash 전환은 transport 작업과 독립적이므로 **별도 마이그레이션 단계**로 빼낸다. v0.9에서 로컬에 먼저 도입 → v1.0 SSH 작업 시 자연스럽게 확장.

### 3.3 `app://` 프로토콜 — 원격 파일 스트리밍

**문제:** 현재 `app://` 핸들러는 `net.fetch(pathToFileURL(localPath))`로 로컬 파일만 fetch한다. 원격 이미지를 렌더러에 어떻게 전달하나?

**선택지:**

| 방식 | 레이턴시 | 보안 | 구현 복잡도 |
|------|---------|------|-----------|
| A. `app://remote-<wsid>/...` → SFTP readStream → `Response(stream)` | 중 (첫 byte 지연) | 워크스페이스 경로 가드 그대로 적용 | **중** |
| B. IPC로 base64 전체 전송 | 높음 (전체 로드 후) | OK | 낮음 |
| C. 로컬 임시 파일 캐시 | 낮음 (캐시 히트 시) | 캐시 청소 로직 필요 | 높음 |

**선택 — A (stream passthrough):**

```ts
// protocol.handle('app', request) 확장 의사코드
const url = new URL(request.url)
const host = url.host  // '' = local, 'remote-<wsid>' = remote
const ws = host ? resolveWorkspaceById(parseHostTag(host)) : localWorkspace
const transport = transportFor(ws)

// path 검증은 transport.fs가 POSIX 경로로 assertInWorkspace 수행
assertInWorkspace(decodedPath, [ws.root], { posix: transport.kind !== 'local' })

const stream = transport.fs.readStream(decodedPath, { maxBytes: MAX_APP_PROTOCOL_BYTES })
return new Response(toReadableStream(stream), {
  headers: { 'Content-Type': guessMime(decodedPath) }
})
```

**캐시:** v1.0은 캐싱 없음 (매 요청 재stream). v1.1에서 LRU 메모리 캐시 or SQLite blob 캐시 평가.

**상한:** `MAX_APP_PROTOCOL_BYTES = 50MB` 설정. 초과 시 `413 Payload Too Large`.

### 3.4 Claude CLI — 원격 "Open" 의미 재정의

**로컬:** osascript → Terminal 열고 → `cd <path> && claude`.

**원격에서 합리적 선택지:**

| 옵션 | 사용자 기대 | 구현 |
|------|-----------|------|
| **A. 로컬 터미널 + `ssh host -t "cd path && claude"`** | "내 랩톱 터미널에서 원격 claude 세션" | 기존 osascript에 ssh 래퍼만 추가 |
| B. 원격 서버에서 백그라운드 claude 실행 후 stdout relay | 앱 내 터미널 뷰 | 별도 터미널 UI 필요, 복잡 |
| C. 버튼 비활성화 + 안내 | "수동 SSH 접속 후 claude 실행하세요" | 가장 간단, UX 열위 |

**선택 — A (권장). C는 fallback.**

```ts
// SshExecDriver.run('claude', [], {cwd: remotePath}) 호출 시:
// 내부적으로 osascript로 로컬 Terminal 열고 아래를 실행:
//   ssh -t user@host "cd /remote/path && claude"
// -t 플래그는 TTY 강제 할당. claude는 interactive TTY 전제.
```

**전제:** 원격 host에 `claude` CLI가 `$PATH`에 있어야 함. 없으면 "원격 claude not found" 에러 (로컬과 동일 플로우).

### 3.5 Path 추상화

- 모든 transport 경계는 **POSIX 경로**를 쓴다 (`/foo/bar`).
- `LocalTransport`만 `path.sep` 변환을 담당 (Windows → POSIX 정규화).
- `validators.ts`의 `assertInWorkspace`를 `(path: string, roots: string[], opts: { posix: boolean })`로 확장.
- 기존 `path.resolve`/`path.normalize` 호출은 transport 안으로 이동.

### 3.6 Symlink 정책

- **Local**: 기존 `followSymbolicLinks: false` 유지 (fast-glob 옵션).
- **SSH**: SFTP는 symlink stat을 제공하나 v1.0에서는 **모두 일반 파일로 취급**. `FileStat.isSymlink`는 local에서만 true 가능.
- **Cross-transport 참조 금지**: drift extractor가 local→ssh 경로를 참조하는 md 문서는 "missing" 처리 (cross-workspace 참조는 v1.0 금지).

---

## 4. 보안 모델

### 4.1 Trust Boundaries

```
┌──────────────────────────────────────────┐
│ Markwand main process (trusted)          │
│  └ SshTransport 인스턴스                  │
│     └ ssh2 socket → known hostKey 검증    │ ← 이 경계가 깨지면 MITM
└─────────────┬────────────────────────────┘
              │
   ┌──────────▼──────────┐
   │ 원격 host (semi-trusted) │  ← 사용자가 신뢰하기로 **선언한 서버**
   │  /home/me/develop/...    │     서버 침해 시 → md 내용 노출·조작
   └──────────────────────┘
```

**가정:**
- 사용자는 원격 host를 "내 개발 환경"으로 신뢰한다. Markwand는 host 측 악성 동작을 감지하지 않는다.
- Markwand는 host에 **쓰기 동작을 하지 않는다** (readFile/stat만). 혹 v2.0에서 쓰기를 허용하면 write allowlist 별도 재설계.

### 4.2 Known-Hosts TOFU (Trust On First Use)

- 최초 연결 시 ssh2 hostkey callback에서 fingerprint를 사용자에게 표시: SHA256 hash + 설치 호스트명.
- 사용자가 "Trust"를 눌러야 electron-store에 저장 + 이후 연결 허용.
- 불일치 시 자동 거절 + "host key changed" 경고 (교체 절차 UI 제공).
- `~/.ssh/known_hosts` 파일과는 독립 저장 (Markwand 자체 저장소 사용 — 사용자의 ssh 설정과 분리).

### 4.3 Secret 취급

- 키 파일 경로만 저장, 키 내용 저장 금지.
- ssh-agent 위임이 기본 (사용자가 평소 쓰는 키 그대로).
- 패스프레이즈 필요 시 v1.0에서는 "ssh-agent를 먼저 올려주세요" 안내 (v1.1에서 OS 키체인 통합 평가).
- 로그에 host/username은 기록 가능, **파일 내용·경로는 로그 제외**.

### 4.4 Path Traversal — 원격

`../`·absolute path 공격을 로컬과 동일 `assertInWorkspace`로 방어. 단, 원격 root는 POSIX이므로 `opts.posix: true`로 `path/posix`를 사용. SFTP realpath를 사용자 입력 검증용으로 쓰지 않는다 (서버 응답 신뢰 최소화).

### 4.5 app:// 원격 확장 표면

`app://remote-<wsid>/...` URL을 렌더러가 조립 가능해진다. 두 가지 위험:
1. **Workspace id leak** — renderer 콘솔에 URL 노출. 완화: host에 workspace id만 넣고 연결 정보는 main에만 유지.
2. **Cross-workspace 요청** — renderer가 wsid를 바꿔 다른 ws 접근 시도. 완화: main이 현재 활성 ws의 transport 하나만 사용하도록 제한.

---

## 5. Performance & Caching

### 5.1 예상 병목

| 동작 | 로컬 latency | SSH latency (실측 추정) | 비율 |
|------|------------|---------------------|-----|
| `stat 1 file` | < 1ms | 5–30ms (RTT 종속) | 10x~30x |
| `readFile 100KB` | < 5ms | 30–80ms | 10x~20x |
| `readdir 1000 entries` | 10ms | 100–300ms | 10x |
| `scanDocs 1000 files (glob)` | 30ms | 3–8s (순차 readdir 재귀) | 100x |
| `watch event latency` | < 100ms (chokidar) | 30s (폴링 기본값) | 300x |

**결론:** Markwand의 첫 인상(initial scan + first viewer render)이 원격에서는 수 초~수십 초 단위. **진보 지표**와 **캐싱** 없으면 UX 붕괴.

### 5.2 캐싱 전략 (v1.0)

- **메모리 캐시** — `Map<path, FileStat>`. scanner 결과 전체를 세션 동안 유지. watcher 이벤트로 무효화.
- **디스크 캐시 (v1.0 배제, v1.1 후보)** — SQLite (`~/Library/Application Support/Markwand/cache/`) + mtime/hash 키.
- **Content cache (v1.0 배제)** — 보안 분석 선행. 원격 파일을 로컬에 보관하는 것은 별도 정책 필요.

### 5.3 진행 피드백

기존 `docs:chunk` 스트리밍 IPC가 이미 구현돼 있으므로 **원격 scanDocs도 동일 채널 재사용**. 사용자 체감은 "처음 연결 시 빈 트리 → 파일이 점진적으로 채워짐"으로 수용 가능.

---

## 6. 마이그레이션 로드맵 (개념적 — 스프린트 아님)

| 단계 | 목표 | 산출 | 의존성 |
|------|------|------|-------|
| **M1: Transport interface 도입** | 기존 로컬 코드를 `LocalTransport`로 감싸기. 외부 동작 변화 0. | `src/main/transport/types.ts`, `local/`, IPC 핸들러 위임 변환 | 없음 |
| **M2: Drift hash 전환** | mtime → content hash. 로컬 드리프트 신뢰도 상승. | `src/lib/drift/hash.ts`, `drift:verify` 내부 변경 | M1 |
| **M3: SSH Transport PoC** | ssh2 기반 `SshTransport` 최소 구현 (readFile/scan/stat). 워크스페이스 1개 연결. | `src/main/transport/ssh/`, Known-hosts TOFU UI | M1 |
| **M4: 원격 watcher (폴링)** | `SshPoller` 구현, 기본 30s. 설정에서 간격 선택. | `SshWatcherDriver` | M3 |
| **M5: app:// 원격 확장** | 원격 이미지 스트리밍. v0.3 ImageViewer가 로컬·원격 동일 동작. | `protocol.ts` host 분기, `readStream` passthrough | M3, M4 |
| **M6: claude:open over SSH** | osascript + `ssh -t` 결합. | `SshExecDriver` | M3 |
| **M7: Multi-transport workspace list** | 여러 워크스페이스(로컬+원격) 동시 유지. 전환 시 transport lifecycle 관리. | 워크스페이스 전환 UI, transport pool | M1~M6 |
| **M8 (v1.1 후보)**: SSH-tunneled fswatch, 디스크 캐시, 패스프레이즈 키체인 | — | — | — |

**점진적 도입 원칙:**
- M1~M2는 **로컬 사용자에게도 이득**(hash drift) → 전용 위험 없이 merge 가능.
- M3 이후는 feature flag 뒤에서 dogfood → 완성도 올라오면 flag 제거.
- **M1이 중단되면 롤백 가능해야 한다.** 기존 IPC 핸들러 시그니처를 깨지 말 것.

---

## 7. Risk Map

| ID | 영역 | 위험 | 영향 | 대응 |
|----|------|------|------|------|
| R1 | 아키텍처 | Transport 추상이 누수되어 UI 코드에 kind 분기 생김 | High | 인터페이스를 leaky하지 않게 유지. transport-specific UX(연결 상태 배지 등)는 **별도 hook(useTransportStatus)**로 격리 |
| R2 | 성능 | 원격 scanDocs가 수 분대 걸려 사용자 이탈 | High | 스트리밍 + "트리 점진 갱신" + 취소 버튼 + 프로그레스 표시 |
| R3 | 성능 | 폴링 watcher가 대형 워크스페이스에서 IO 폭발 | Medium | 기본 30s, workspace size 기반 동적 조정(>10k files → 60s) |
| R4 | 보안 | hostKey 변경 감지 실패 → MITM | High | electron-store 저장된 fingerprint와 실시간 검증 — 불일치 시 **연결 중단 필수**, 사용자 bypass 금지 |
| R5 | 보안 | 키 파일 경로 실수로 electron-store에 키 내용 쓰임 | High | 타입 시스템으로 막기. 파싱된 key material은 메모리만, 직렬화 금지 |
| R6 | 보안 | 원격 서버가 거대한 파일 반환으로 renderer 메모리 소진 | Medium | `MAX_APP_PROTOCOL_BYTES` + scanner 차원에서 size 컷오프 |
| R7 | 신뢰성 | SSH 연결 끊김 시 reconnect/backoff 미비로 앱 hang | Medium | 지수 backoff + 사용자에게 "오프라인" 상태 명시 + 캐시된 메타데이터로 degraded UX |
| R8 | 호환 | ssh2 NPM 네이티브 의존성과 electron-builder 충돌 | Medium | M3 초기에 빌드 검증 필수, `electron-builder install-app-deps` 시나리오 포함 |
| R9 | drift | hash 기반으로 전환 시 기존 저장된 mtime 상태와 호환성 | Low | M2에서 마이그레이션 shim — 최초 verify 시 자동 재계산 |
| R10 | UX | 원격 워크스페이스 "열기"가 수 초 지연으로 "먹통처럼 보임" | Medium | Skeleton + "Connecting to host..." + ETA 표시 |
| R11 | 테스트 | SSH 통합 테스트가 로컬 CI에서 실패 가능 | Medium | Docker sshd 컨테이너 fixture, unit test는 mock SFTP 기반 |
| R12 | 범위 | "ssh 된다"에 고무되어 쓰기·편집 요구 증가 | Medium | Non-goal 명시(§1.3). 쓰기 요청 시 별도 설계 사이클 |

---

## 8. Unknowns (설계 단계 후 실측·검증 필요)

- **U1** — ssh2 NPM과 최신 Electron(33+) ABI 호환성. 네이티브 빌드 필요 범위. **M3 PoC 1주차에 검증.**
- **U2** — 평균 RTT 50ms 환경에서 `scanDocs 10k files`의 벽시계 시간. 용인 가능한가?
- **U3** — `net.fetch` + custom ReadableStream이 Electron의 `protocol.handle` 응답으로 안정 동작하는가. 대안: `Response(Blob)`.
- **U4** — SSH-tunneled `fswatch` (M8)이 typical macOS/Ubuntu 원격에서 설치 허들 얼마나 되는지. v1.1 필수 vs optional 결정.
- **U5** — 멀티 transport 동시 활성 시 메모리 footprint (2~3 워크스페이스 연결 상태 유지 기준).
- **U6** — SFTP readdir의 대용량 디렉토리(10k+ entries) streaming 동작. 한 번에 로드 vs chunk API.

---

## 9. Open Questions (사용자 결정 필요)

### Q1. 시나리오 우선순위
> "SSH" 말씀하실 때 실제로 어떤 환경을 가장 많이 쓰시나요?
> - (a) 회사 dev server (항상 온라인, 키 인증)
> - (b) EC2/Lightsail 같은 클라우드 (가끔 정지)
> - (c) 다른 맥·홈서버 (LAN)

**답에 따라 M3 구현의 기본값(keepalive, reconnect 정책, 연결 안정성 가정)이 달라짐.**

### Q2. "원격 파일 쓰기" 의향
현재는 Non-Goal 선언했지만, 예컨대 "원격에서 drift 무시 표시"는 electron-store에 로컬 저장되어 동작한다. 미래에 **원격 메모·주석 저장** 요구가 생기면 쓰기 경계 재설계 필요.

### Q3. 여러 워크스페이스 UX
로컬 2개 + 원격 2개 동시 등록 시 사이드바에서 **동시에 온라인**이어야 하는지, **하나씩 활성화**인지.

### Q4. 이미지 확장 (v0.3) 완료 후 착수 시점
v0.3 완료 직후? 다른 사용자 피드백 수집 후? (권장: v0.3 + 1~2개 소규모 피드백 사이클 후)

---

## 10. Next Steps

이 설계서가 승인되면:
1. `docs/plans/remote-fs-transport-mvp.md` 작성 (M1~M6 구체 스프린트 분할).
2. M1(Transport interface 도입)만 먼저 별도 PR — 로컬 사용자 회귀 0 확인.
3. M3 SSH PoC는 **feature flag + 실험 워크스페이스 타입**으로 dogfood.
4. `/nova:deepplan`으로 M3 이후 Plan 문서 재작성 (Explorer×3로 ssh2 대안 조사).

---

## Refs

- 조사 리포트: 이 세션 Explorer 서브에이전트 (로컬 FS 가정 지점 10개 영역 매트릭스)
- Prior Design: `docs/designs/md-viewer-mvp.md` (v0.1 전체 아키텍처)
- 연계 Plan: `docs/plans/image-viewer-mvp.md` (v0.3, 먼저 완료)
- NOVA-STATE Known Gap: `Windows/Linux 빌드` — 원격 transport와 독립 이슈지만 path 추상화 기회에 해결 가능
- 외부 참조: VSCode Remote-SSH 아키텍처, Nova Code(JetBrains Projector), mosh (예측적 UI)
