/**
 * App 메인 영역의 풀스크린 분석 오버레이 표시 여부 판정.
 *
 * 첫 진입과 워크스페이스 전환에서만 풀스크린 오버레이를 띄운다.
 * 명시 새로고침(이미 projects 데이터를 보고 있는 상태) 에는 띄우지 않는다.
 * - 새로고침 시 큰 모달이 깜빡이는 시각 노이즈 방지.
 * - 진행 신호는 Sidebar 새로고침 버튼 회전 + AllProjectsView 헤더 inline 진행률로 충분.
 *
 * 워크스페이스 전환 시 이전 ws 의 projects 가 잠깐 보이지 않도록 호출자가
 * setProjects([]) 로 비워야 이 헬퍼가 'projectsCount === 0' 분기로 진입한다.
 */
export interface OverlayState {
  activeWorkspaceId: string | null
  projectsCount: number
  projectsLoading: boolean
  isDocCounting: boolean
}

export function shouldShowInitialOverlay(state: OverlayState): boolean {
  if (!state.activeWorkspaceId) return false
  if (state.projectsCount > 0) return false
  return state.projectsLoading || state.isDocCounting
}
