import { useEffect, useRef } from 'react'
import { useAppStore } from '../state/store'
import type { Doc, Project } from '../../preload/types'

// 백그라운드 drift 검증 관리자.
// - docs 배열이 변할 때 새 문서 발견 시 debounce 후 verify 호출
// - fs:change 가 .md 파일에 발생하면 해당 문서 보고서 무효화 + 재검증
// - 동시성 제한(4개)으로 메인 프로세스 부하 억제
//
// 재검증 전략: doc mtime 변경 = AI가 문서 재생성. 대상 코드 파일 변경은 별도 감지 안 함 (v1 한계).

const VERIFY_DEBOUNCE_MS = 400
const MAX_CONCURRENT = 4

export function useDrift(docs: Doc[], projects: Project[]): void {
  const setDriftReport = useAppStore((s) => s.setDriftReport)
  const clearDriftReport = useAppStore((s) => s.clearDriftReport)
  const pruneDriftReports = useAppStore((s) => s.pruneDriftReports)

  // 현재 검증 중이거나 대기 중인 docPath — 중복 호출 방지.
  const inFlight = useRef<Set<string>>(new Set())
  // 문서별 debounce 타이머.
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // 활성 concurrency 카운터.
  const active = useRef(0)
  // 대기 큐.
  const queue = useRef<Array<() => Promise<void>>>([])

  function drain(): void {
    while (active.current < MAX_CONCURRENT && queue.current.length > 0) {
      const next = queue.current.shift()!
      active.current++
      void next().finally(() => {
        active.current--
        drain()
      })
    }
  }

  function scheduleVerify(doc: Doc): void {
    const project = projects.find((p) => p.id === doc.projectId)
    if (!project) return

    const existing = timers.current.get(doc.path)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      timers.current.delete(doc.path)
      if (inFlight.current.has(doc.path)) return
      inFlight.current.add(doc.path)

      queue.current.push(async () => {
        try {
          const report = await window.api.drift.verify(doc.path, project.root)
          setDriftReport(doc.path, report)
        } catch {
          // 파일 크기 초과/권한/삭제 등은 silent — UI는 보고서 없음으로 처리.
        } finally {
          inFlight.current.delete(doc.path)
        }
      })
      drain()
    }, VERIFY_DEBOUNCE_MS)

    timers.current.set(doc.path, timer)
  }

  // 문서 목록 변경: 새 문서/mtime 바뀐 문서 검증 스케줄, 사라진 문서 리포트 정리.
  useEffect(() => {
    const available = new Set<string>(docs.map((d) => d.path))
    pruneDriftReports(available)

    const reports = useAppStore.getState().driftReports
    for (const doc of docs) {
      const prev = reports[doc.path]
      // 처음 보는 문서이거나 mtime 변화 있으면 (재)검증
      if (!prev || prev.docMtime < doc.mtime) {
        scheduleVerify(doc)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, projects])

  // fs:change 구독 — .md 변경은 해당 doc만 재검증.
  useEffect(() => {
    const unsub = window.api.fs.onChange((data) => {
      if (!data.path.endsWith('.md')) return
      if (data.type === 'unlink') {
        clearDriftReport(data.path)
        return
      }
      const doc = useAppStore.getState().docs.find((d) => d.path === data.path)
      if (doc) scheduleVerify(doc)
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])

  // 언마운트: 타이머 정리.
  useEffect(() => {
    const snapshot = timers.current
    return () => {
      for (const t of snapshot.values()) clearTimeout(t)
      snapshot.clear()
    }
  }, [])
}
