import type { ProjectViewSession } from '../state/store'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeProjectViewSessions(raw: unknown): Record<string, ProjectViewSession> {
  if (!isRecord(raw)) return {}

  const sessions: Record<string, ProjectViewSession> = {}
  for (const [projectId, value] of Object.entries(raw)) {
    if (projectId.length === 0 || !isRecord(value)) continue

    const selectedDocPath =
      typeof value.selectedDocPath === 'string' && value.selectedDocPath.length > 0
        ? value.selectedDocPath
        : null
    const showWiki = typeof value.showWiki === 'boolean' ? value.showWiki : true
    const scrollTop =
      typeof value.scrollTop === 'number' && Number.isFinite(value.scrollTop)
        ? Math.max(0, value.scrollTop)
        : 0

    sessions[projectId] = { selectedDocPath, showWiki, scrollTop }
  }

  return sessions
}
