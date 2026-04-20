# Drift Verifier IPC 정합성 — 적대적 코드 리뷰

- **Date**: 2026-04-21
- **Reviewer**: Nova Frontend Agent (adversarial)
- **Scope**: `src/lib/drift/`, `src/main/ipc/`, `src/main/services/`, `src/preload/`, `src/renderer/hooks/useDocs.ts`
- **Commits**: Reference Extractor (7b1a4c3), Reviewer IPC (e23d73c)

---

## 총평

Reference Extractor 파서 자체의 구현 품질(정규식, 경계값 처리, 테스트 커버리지)은 양호하다.
단, **IPC 레이어와의 연결이 전혀 없어 사실상 미통합 dead-code** 상태이며,
기존 IPC 레이어에는 리뷰어가 이미 지적한 soft-block 2건이 미해결 상태다.

---

## 1. Worker/Background Task 분리 — 메인 스레드 블록 여부

### 판정: **SOFT-BLOCK**

**발견:**
- `extractReferences(md, projectRoot)` 는 순수 동기 함수 (line 71, extractor.ts)
- `md.split('\n')` + regex 루프 — 입력 크기에 선형 비례 (O(n))
- Worker Thread 또는 `setImmediate` 분산 없음

**실제 위험 경로:**
```
[renderer] window.api → [preload] ipcRenderer.invoke → [main] ipcMain.handle
→ extractReferences(content, root)  ← 메인 스레드에서 동기 실행
```

현재는 IPC 핸들러가 존재하지 않아 직접 위험은 없다.
그러나 `project:scan-docs`처럼 IPC 핸들러에서 `fs:read-doc` → `extractReferences` 를 연결하면
메인 스레드가 대용량 파일 처리 중 블록된다.

**완화 조건:**
- `scanDocs()` 는 `async function*` 제너레이터로 50-doc 청크를 `yield` — ✅ 청크 단위 이벤트 루프 양보
- `parseFrontmatter()` 는 4096 바이트만 읽음 — ✅ 제한됨
- `makeProjectId()` 는 path string (짧은 문자열) 해시 — ✅ 무시 가능한 비용

**개선 제안:**
향후 `drift:extract` IPC 핸들러 생성 시:
```typescript
// 안: 동기 블록
ipcMain.handle('drift:extract', async (_e, { path, projectRoot }) => {
  const content = await fs.promises.readFile(path, 'utf-8')  // 파일 크기 무제한
  return extractReferences(content, projectRoot)               // 메인 스레드 블록
})

// 권장: 파일 크기 게이트 + setImmediate 양보 or Worker Thread
ipcMain.handle('drift:extract', async (_e, raw: unknown) => {
  const { path: docPath, projectRoot } = parseDriftExtractInput(raw)
  const stat = await fs.promises.stat(docPath)
  if (stat.size > MAX_DRIFT_FILE_BYTES) throw new Error('FILE_TOO_LARGE')
  const content = await fs.promises.readFile(docPath, 'utf-8')
  return extractReferences(content, projectRoot)
})
```

---

## 2. EventEmitter 메모리 누수 — Listener 정리

### 판정: **SOFT-BLOCK (미해결 known issue)**

**발견 1 — 기존 soft-block 미해결 (`preload/index.ts:18,26`):**
```typescript
onDocsChunk: (cb: (event: Electron.IpcRendererEvent, data: unknown) => void) => {
  ipcRenderer.on('project:docs-chunk', cb)
  return () => ipcRenderer.off('project:docs-chunk', cb)
}
onChange: (cb: (event: Electron.IpcRendererEvent, data: unknown) => void) => {
  ipcRenderer.on('fs:change', cb)
  return () => ipcRenderer.off('fs:change', cb)
}
```

콜백에 `Electron.IpcRendererEvent` 가 raw 노출됨. `sender` (WebContents 참조) 가 renderer 코드에 흘러들어 CSP/security policy 위반 가능.
Reviewer e23d73c 에서 soft-block으로 지적됐으나 수정 없음.

**발견 2 — useDocs.ts 이중 cleanup 경합 (`useDocs.ts:18-45`):**
```typescript
const unsub = window.api.project.onDocsChunk(...)
window.api.project.scanDocs(pid)
  .then(...)
  .finally(() => unsub())  // ①: 스캔 완료 후 정리
return unsub               // ②: effect cleanup (컴포넌트 언마운트 시)
```

`scanDocs` 완료 전 언마운트 시:
1. effect cleanup → `unsub()` 호출 → listener off
2. `.finally(() => unsub())` → `ipcRenderer.off` 다시 호출 (이미 없는 listener)

`ipcRenderer.off` 에 없는 listener 전달은 no-op — 크래시 없음.
하지만 **의도한 1회 호출이 아닌 2회 호출**이며, 스캔 완료 후 unsub이 `null` 이면 NPE 가능성은 없으나 코드 의도가 불명확.

**발견 3 — onChange listener 재등록 빈도 (`useDocs.ts:48-60`):**
```typescript
useEffect(() => {
  const unsubscribe = window.api.fs.onChange(...)
  return unsubscribe
}, [updateDoc, removeDoc])
```

`updateDoc` / `removeDoc` 가 Zustand selector로 안정적 참조이면 문제없음.
그러나 `useAppStore((s) => s.updateDoc)` 선택자가 매 렌더마다 새 함수를 반환하면:
- 렌더링마다 새 listener 등록 + 이전 listener cleanup
- 짧은 시간 동안 2개 listener 공존 → 동일 이벤트 2회 처리

**개선 제안:**
```typescript
// preload — raw event 대신 data-only 래퍼
onDocsChunk: (cb: (data: Doc[]) => void) => {
  const wrapper = (_event: Electron.IpcRendererEvent, data: Doc[]) => cb(data)
  ipcRenderer.on('project:docs-chunk', wrapper)
  return () => ipcRenderer.off('project:docs-chunk', wrapper)
}
```

---

## 3. Map 캐시 무한 증가 방지

### 판정: **INFO (현행 안전, 설계 주의 필요)**

**`projectsCache: Map<string, Project[]>` (workspace.ts:21)**

현재 bounded 조건:
- 키: workspaceId (UUID) — 사용자가 수동으로 추가한 워크스페이스 수
- 실사용에서 수십 개 이하 — 무한 증가 위험 없음

**잠재적 설계 문제:**
```typescript
ipcMain.handle('workspace:remove', async (_event, raw: unknown) => {
  ...
  invalidateProjectsCache()  // ← 전체 무효화 (주석: "stale 위험")
})
```

주석이 "단일 id 무효화 시 stale 위험"이라고 설명하나, 이는 부정확하다.
워크스페이스 B를 제거해도 워크스페이스 A의 projects 캐시는 여전히 유효하다.
두 워크스페이스의 프로젝트 스캔 결과는 독립적이다.
**전체 캐시 무효화는 불필요한 재스캔을 유발** — 워크스페이스가 많을수록 영향 증가.

**`debounceTimers: Map<string, ReturnType<typeof setTimeout>>` (watcher.ts:10)**

키: `"${type}:${filePath}"` — 파일 변경 시 생성, 150ms 후 자동 제거.
`stopWatcher()` 에서 전체 clear — 안전.

동시 파일 변경 수 × 3(add/change/unlink) 만큼만 존재 — bounded.

**개선 제안:**
```typescript
// workspace:remove — 단일 id만 무효화로 충분
ipcMain.handle('workspace:remove', async (_event, raw: unknown) => {
  const { id } = parseWorkspaceRemoveInput(raw)
  ...
  invalidateProjectsCache(id)  // 전체 아님
})
```

---

## 4. 해시 계산 스트리밍 처리 (대용량 파일 대비)

### 판정: **HARD-BLOCK (기존 known issue 재확인)**

**`makeProjectId()` (scanner.ts:95-97) — 안전:**
```typescript
function makeProjectId(root: string): string {
  return createHash('sha1').update(root).digest('hex').slice(0, 16)
}
```
path string (짧은 문자열) 해시 — 스트리밍 불필요, 비용 무시 가능.

**`fs:read-doc` IPC 핸들러 (ipc/fs.ts:20) — Hard-block 미해결:**
```typescript
const raw_content = await fs.promises.readFile(docPath, 'utf-8')
```
stat 없이 전체 파일 읽기. Known Risk 항목으로 등재되어 있으나 미수정.
500MB `.md` 파일 → 힙 소진, 프로세스 크래시.

**`extractReferences()` 메모리 배증 문제:**
```typescript
const lines = md.split('\n')  // 원본 string + split array = 2× 메모리
```
1MB 파일 → 2MB, 10MB 파일 → 20MB 추가 힙 사용.
알고리즘 자체는 line-by-line이므로 스트리밍 리팩터링 가능:

```typescript
// 현재: 전체 string split
const lines = md.split('\n')

// 개선: Node.js readline 스트리밍 (미래 IPC 통합 시)
import readline from 'readline'
const rl = readline.createInterface({ input: fs.createReadStream(path) })
for await (const line of rl) { /* process line */ }
```

state machine (`inCodeBlock`, `nextIsHint`) 이 순차 라인 처리 기반이므로 스트리밍 전환 시 로직 변경 불필요.

---

## 5. Reference Extractor(7b1a4c3) 산출물 데이터 계약 정합성

### 판정: **HARD-BLOCK (미통합 + 계약 gap)**

**문제 1: IPC 통합 없음 — Dead Code**

`src/lib/drift/extractor.ts` 는 어떤 IPC 핸들러에서도 호출되지 않는다:
```
grep -r "extractReferences" src/main/  → 결과 없음
grep -r "drift:" src/main/            → 결과 없음
```

Reference Extractor는 테스트만 통과하는 isolated library다.
앱 내에서 실제로 reference를 추출하거나 drift를 검증하는 경로가 없다.

**문제 2: `resolvedPath` 존재 검증 없음**

```typescript
export interface Reference {
  resolvedPath: string  // 절대 경로이나 존재 여부 미검증
}
```

`@/nonexistent/file.ts` → `resolvedPath: '/project/nonexistent/file.ts'` 생성.
파일이 존재하지 않아도 Reference 객체가 정상 반환됨.
Drift Verifier의 핵심 목적("파일이 실제로 존재하는가")이 extractor 레벨에서 미충족.

미래 소비자(IPC 핸들러, renderer)가 이를 모르고 `resolvedPath`를 신뢰하면 false positive 발생.

권장: 계약에 `exists?: boolean` 필드 추가 또는 별도 `verifyReferences(refs)` 함수 분리.

**문제 3: `raw` 필드 kind별 비일관성**

| kind | raw 예시 | 의미 |
|------|----------|------|
| `at` | `"@/src/lib/foo.ts"` | match 문자열 |
| `inline` | `` "`src/lib/foo.ts`" `` | 백틱 포함 match |
| `hint` | `"// src/lib/foo.ts"` | **전체 comment 라인** |

`hint` 만 comment prefix 포함. 소비자가 `raw` 로 원문 재탐색 시 kind별 파싱 분기 필요.
이 비일관성이 의도적이라면 JSDoc으로 명시 필요.

**문제 4: `projectRoot` 외부 주입 의존성**

```typescript
export function extractReferences(md: string, projectRoot: string): Reference[]
```

IPC 핸들러에서 호출 시, `projectRoot` 를 어떻게 조달하는지 정의되지 않음.
`project:scan-docs` 처럼 `projectId` → workspace lookup → `project.root` 흐름이 필요하나 미구현.

---

## 6. Reviewer IPC(e23d73c) 이벤트 채널 충돌 여부

### 판정: **PASS (충돌 없음, 미해결 soft-block 2건 재확인)**

**현재 등록된 IPC 채널:**
```
invoke: workspace:list/add/remove/scan/refresh
        project:get-doc-count/scan-docs
        fs:read-doc
        claude:check/open
        composer:estimate-tokens
        prefs:get/set  theme:set
        shell:open-external/reveal
push:   project:docs-chunk  fs:change
```

Reviewer commit(e23d73c) 은 새 채널을 추가하지 않았다. 채널 충돌 없음.

미래 `drift:*` 채널 도입 시에도 기존 namespace와 충돌하지 않는다.

**미해결 soft-block (Reviewer 지적, 미수정):**

| # | 위치 | 문제 | 심각도 |
|---|------|------|--------|
| S1 | `preload/index.ts:18` | `onDocsChunk` callback에 raw `IpcRendererEvent` 노출 | Soft-block |
| S2 | `preload/index.ts:26` | `onChange` callback에 raw `IpcRendererEvent` 노출 | Soft-block |
| S3 | `ipc/prefs.ts` | `prefs:set` 비원자적 — concurrent reset 시 race | Soft-block |

이 3건은 e23d73c 에서 지적됐으나 코드 변경 없이 Known Issue로만 기록됨.

---

## 종합 판정

| # | 포인트 | 판정 | 우선순위 |
|---|--------|------|----------|
| 1 | Worker/main thread | SOFT-BLOCK | 미래 IPC 통합 시 주의 |
| 2 | EventEmitter memory | SOFT-BLOCK | 리뷰어 지적 미해결 |
| 3 | Map 캐시 성장 | INFO | `workspace:remove` 과잉 무효화 수정 권장 |
| 4 | 해시/파일 스트리밍 | HARD-BLOCK | `fs:read-doc` stat-first 미해결 |
| 5 | 데이터 계약 정합성 | HARD-BLOCK | extractor IPC 미통합 + resolvedPath 존재 미검증 |
| 6 | 채널 충돌 | PASS | 충돌 없음 |

**Overall: CONDITIONAL PASS**
- Hard-block 2건(`fs:read-doc` 크기 무제한, extractor IPC 미통합)은 v0.2 릴리스 전 해소 필요
- Soft-block 3건(preload raw event 노출, prefs 비원자)은 v0.2 이후 처리 가능

---

## 즉시 적용 가능한 개선 제안 (우선순위순)

### [H1] fs:read-doc 파일 크기 상한 (ipc/fs.ts)
```typescript
const MAX_READ_BYTES = 2 * 1024 * 1024 // 2MB
ipcMain.handle('fs:read-doc', async (_event, raw: unknown) => {
  const { path: docPath } = parseReadDocInput(raw)
  const store = await getStore()
  assertInWorkspace(docPath, store.get('workspaces').map((w) => w.root))
  const stat = await fs.promises.stat(docPath)
  if (stat.size > MAX_READ_BYTES) throw new Error('FILE_TOO_LARGE')
  const raw_content = await fs.promises.readFile(docPath, 'utf-8')
  ...
})
```

### [H2] extractor IPC 연결 + resolvedPath 존재 검증
`src/main/ipc/drift.ts` 신규 생성:
```typescript
import { ipcMain } from 'electron'
import fs from 'fs'
import { extractReferences } from '../../lib/drift/extractor'
import type { Reference } from '../../lib/drift/types'

export interface VerifiedReference extends Reference {
  exists: boolean
}

export function registerDriftHandlers(): void {
  ipcMain.handle('drift:extract', async (_e, { docPath, projectRoot }) => {
    const stat = await fs.promises.stat(docPath)
    if (stat.size > 2 * 1024 * 1024) throw new Error('FILE_TOO_LARGE')
    const content = await fs.promises.readFile(docPath, 'utf-8')
    const refs = extractReferences(content, projectRoot)
    const verified: VerifiedReference[] = await Promise.all(
      refs.map(async (r) => {
        let exists = false
        try { await fs.promises.access(r.resolvedPath); exists = true } catch {}
        return { ...r, exists }
      })
    )
    return verified
  })
}
```

### [S1-S2] preload raw event 래핑 (preload/index.ts)
```typescript
onDocsChunk: (cb: (data: Doc[]) => void) => {
  const w = (_e: Electron.IpcRendererEvent, data: Doc[]) => cb(data)
  ipcRenderer.on('project:docs-chunk', w)
  return () => ipcRenderer.off('project:docs-chunk', w)
},
onChange: (cb: (data: FsChangeEvent) => void) => {
  const w = (_e: Electron.IpcRendererEvent, data: FsChangeEvent) => cb(data)
  ipcRenderer.on('fs:change', w)
  return () => ipcRenderer.off('fs:change', w)
},
```

### [I1] workspace:remove 단일 id 무효화 (ipc/workspace.ts:155)
```typescript
invalidateProjectsCache(id)  // id 한정, 전체 아님
```
