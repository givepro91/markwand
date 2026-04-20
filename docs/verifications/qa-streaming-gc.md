# QA Report: 스트리밍 + GC 통합 검증

**Date**: 2026-04-21  
**Verdict**: FAIL  
**Tests Added**: 10 (src/renderer/state/store.test.ts)  
**Method**: 코드 정적 분석 + Vitest 단위 테스트 (62 tests all pass)

---

## Issues Found

### [Critical] T3: readDocs GC 미구현
**Severity**: Major — 데이터 무제한 증가  
**Evidence**: `src/renderer/state/store.ts:138-139`, `src/renderer/App.tsx:68-84`, `src/renderer/components/Settings.tsx`  
**Finding**: GC/expiry 로직이 코드베이스 어디에도 없음. `setReadDocs`/`markDocRead`/앱 시작 시 stale 항목 prune 코드 0줄.

시나리오 재현:
```
readDocs = { '/proj/doc.md': <7개월 전 타임스탬프> }
→ 앱 재시작
→ App.tsx가 prefs.get('readDocs') 로드
→ 7개월 전 항목 그대로 유지 ✗
```

**기대 동작**: 앱 시작 시 90일(또는 설정값) 이상 된 항목 자동 prune  
**Verdict**: FAIL

---

### [Minor] T4: store.markDocRead에 trackReadDocs 가드 없음
**Severity**: Minor — 설계 취약점 (현재 진입점은 InboxView만이므로 즉각 버그는 아님)  
**Evidence**: `src/renderer/state/store.ts:138-139` vs `src/renderer/views/InboxView.tsx:149-152`

```ts
// store.ts — trackReadDocs 확인 없음
markDocRead: (path) =>
  set((state) => ({ readDocs: { ...state.readDocs, [path]: Date.now() } }))

// InboxView.tsx — 게이트 있음 (PASS)
if (trackReadDocs) {
  markDocRead(doc.path)
  await window.api.prefs.set('readDocs', updated)
}
```

InboxView의 `if (trackReadDocs)` 게이트가 prefs 저장을 막아 **T4의 "prefs 미저장" 기준은 충족**.  
단, `store.markDocRead`를 직접 호출하는 코드가 추가되면 trackReadDocs=false일 때도 in-memory 오염 발생.

**Verdict**: CONDITIONAL PASS (현재 진입점 기준) / 설계상 Minor 버그

---

### [Medium] T2: InboxView projects 의존성 레이스 — 잠재적 중복 스캔
**Severity**: Medium — 재현 조건 필요  
**Evidence**: `src/renderer/views/InboxView.tsx:64-132` effect deps `[workspaceId, projects]`

`projects` 배열이 새 참조로 교체되면 스캔 진행 중에도 effect 재실행:
1. 기존 스캔 `cancelled=true`, unsub 호출 ✓
2. **그러나** 메인 프로세스의 기존 `project:scan-docs` IPC 호출은 계속 실행
3. 새 unsub 리스너가 활성화된 상태에서 기존 스캔의 `project:docs-chunk` 수신
4. `projectMap.get(doc.projectId)` 필터로 걸러지나, 중복 docs 누적 가능

useDocs.ts의 경우 `projectId` 필터로 이 문제 없음 (PASS).

**Verdict**: CONDITIONAL PASS (useDocs) / POTENTIAL FAIL (InboxView, 재현 필요)

---

### [Blocked] T1: 성능 실측 — GUI 환경 필요
**Severity**: N/A (BLOCKED)  
**Target**: 첫 카드 렌더 <200ms, 전체 로드 <2s, IPC 중복 없음

**코드 분석 기반 추정**:
- 첫 카드: 50-doc 첫 청크 수신 후 렌더 → IPC 27ms (이전 QA) + React render ~10ms → **~37ms 추정** ✓
- 전체 로드 (971 docs, 20 청크): 기존 headless 측정 27ms × 20 = ~540ms + GUI init 920ms → 경계선
- IPC 중복: InboxView effect의 projects 의존성으로 projects 변경 시 중복 스캔 가능 (위 T2 참조)
- **InboxView 청크마다 setAllDocs 호출** → 20회 re-render, batching 없음 → 잠재적 jank

**측정 방법 (수동)**:
```
1. pnpm dev 실행
2. DevTools → Performance → Record
3. 워크스페이스 ~/develop 선택
4. 첫 카드 렌더 타임 확인
5. project:docs-chunk IPC 이벤트 중복 여부 확인
```

**Verdict**: BLOCKED (GUI 실행 필요)

---

## Summary

| Test | Verdict | Severity | Action Required |
|------|---------|----------|-----------------|
| T1: 성능 (첫 카드/전체 로드/IPC 중복) | BLOCKED | — | 수동 GUI 실측 필요 |
| T2: projectId 전환 레이스 | CONDITIONAL PASS | Medium | InboxView projects dep 최적화 권장 |
| T3: readDocs GC (7개월 stale 주입) | **FAIL** | **Major** | 90일 prune 구현 필요 |
| T4: trackReadDocs OFF → prefs 미저장 | CONDITIONAL PASS | Minor | store.markDocRead에 가드 추가 권장 |

---

## Reproduction Steps for T3 (Developer)

```bash
# 1. electron-store 파일 직접 수정
# macOS: ~/Library/Application Support/Markwand/md-viewer.json
cat > /tmp/inject-stale.js << 'EOF'
const fs = require('fs')
const path = require('path')
const storeFile = path.join(
  process.env.HOME,
  'Library/Application Support/Markwand/md-viewer.json'
)
const data = JSON.parse(fs.readFileSync(storeFile, 'utf8'))
const sevenMonthsAgo = Date.now() - 7 * 30 * 24 * 60 * 60 * 1000
data.readDocs = {
  ...data.readDocs,
  '/fake/stale/doc.md': sevenMonthsAgo,
}
fs.writeFileSync(storeFile, JSON.stringify(data, null, 2))
console.log('Stale entry injected:', new Date(sevenMonthsAgo).toISOString())
EOF
node /tmp/inject-stale.js

# 2. 앱 재시작
pnpm dev

# 3. DevTools → Application → Storage → 또는 콘솔에서:
#    window.api.prefs.get('readDocs').then(console.log)
# 기대: stale 항목 없음 (GC됨)
# 실제: stale 항목 그대로 유지 → FAIL
```

## Fix Suggestion for T3 (Dev Reference)

`src/renderer/App.tsx` 의 prefs 로드 effect에 추가:
```ts
const GC_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000 // 90일
const pruned = Object.fromEntries(
  Object.entries(readDocsStored).filter(([, ts]) => Date.now() - ts < GC_THRESHOLD_MS)
)
if (Object.keys(pruned).length < Object.keys(readDocsStored).length) {
  await window.api.prefs.set('readDocs', pruned)
}
useAppStore.setState({ readDocs: pruned })
```
