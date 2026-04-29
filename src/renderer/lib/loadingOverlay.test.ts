/**
 * 자가 검증 (CLAUDE.md "Self-QA First"): 새로고침 시 풀스크린 오버레이 깜빡임이
 * 다시 회귀하지 않도록 분기 표를 단위 테스트로 고정.
 */
import { describe, expect, it } from 'vitest'
import { shouldShowInitialOverlay } from './loadingOverlay'

describe('shouldShowInitialOverlay', () => {
  it('워크스페이스 미선택이면 항상 false', () => {
    expect(
      shouldShowInitialOverlay({
        activeWorkspaceId: null,
        projectsCount: 0,
        projectsLoading: true,
        isDocCounting: true,
      })
    ).toBe(false)
  })

  it('첫 진입(projectsCount=0) + projectsLoading=true → true', () => {
    expect(
      shouldShowInitialOverlay({
        activeWorkspaceId: 'local:/abs',
        projectsCount: 0,
        projectsLoading: true,
        isDocCounting: false,
      })
    ).toBe(true)
  })

  it('첫 진입(projectsCount=0) + isDocCounting=true → true (스캔은 끝났지만 docCount 진행 중)', () => {
    expect(
      shouldShowInitialOverlay({
        activeWorkspaceId: 'local:/abs',
        projectsCount: 0,
        projectsLoading: false,
        isDocCounting: true,
      })
    ).toBe(true)
  })

  it('명시 새로고침(이미 projects 가 있음) + projectsLoading=true → false (깜빡임 방지 핵심)', () => {
    expect(
      shouldShowInitialOverlay({
        activeWorkspaceId: 'local:/abs',
        projectsCount: 5,
        projectsLoading: true,
        isDocCounting: false,
      })
    ).toBe(false)
  })

  it('명시 새로고침 + isDocCounting 진행 중 → false (인라인 진행률만 노출)', () => {
    expect(
      shouldShowInitialOverlay({
        activeWorkspaceId: 'local:/abs',
        projectsCount: 5,
        projectsLoading: false,
        isDocCounting: true,
      })
    ).toBe(false)
  })

  it('idle (로딩 끝, 카운트 끝) → false', () => {
    expect(
      shouldShowInitialOverlay({
        activeWorkspaceId: 'local:/abs',
        projectsCount: 5,
        projectsLoading: false,
        isDocCounting: false,
      })
    ).toBe(false)
  })

  it('워크스페이스 전환 시 호출자가 setProjects([]) 했다고 가정 — 빈 상태에서는 첫 진입과 동일 처리', () => {
    // 호출자가 projects 를 비우면 projectsCount=0 으로 첫 진입 분기.
    // 이 헬퍼는 'projectsCount === 0' 사실만 보면 충분.
    expect(
      shouldShowInitialOverlay({
        activeWorkspaceId: 'local:/new-ws',
        projectsCount: 0,
        projectsLoading: true,
        isDocCounting: false,
      })
    ).toBe(true)
  })
})
