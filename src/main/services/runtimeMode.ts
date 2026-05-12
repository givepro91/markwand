export interface RuntimeModeEnv {
  ELECTRON_RENDERER_URL?: string
  MD_VIEWER_DEBUG?: string
  MARKWAND_DEV_WRAPPER_PID?: string
}

export function getDevRendererUrl(isPackaged: boolean, env: RuntimeModeEnv): string | undefined {
  if (isPackaged) return undefined
  const url = env.ELECTRON_RENDERER_URL?.trim()
  return url ? url : undefined
}

export function shouldAutoOpenDevTools(isPackaged: boolean, env: RuntimeModeEnv): boolean {
  if (isPackaged) return false
  return env.MD_VIEWER_DEBUG === '1' || env.MD_VIEWER_DEBUG === 'true'
}

export function getDevWrapperPid(isPackaged: boolean, env: RuntimeModeEnv): number | null {
  if (isPackaged) return null
  const raw = env.MARKWAND_DEV_WRAPPER_PID?.trim()
  if (!raw) return null
  const pid = Number(raw)
  if (!Number.isInteger(pid) || pid <= 0) return null
  return pid
}
