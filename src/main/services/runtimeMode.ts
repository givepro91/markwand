export interface RuntimeModeEnv {
  ELECTRON_RENDERER_URL?: string
  MD_VIEWER_DEBUG?: string
}

export function getDevRendererUrl(isPackaged: boolean, env: RuntimeModeEnv): string | undefined {
  if (isPackaged) return undefined
  const url = env.ELECTRON_RENDERER_URL?.trim()
  return url ? url : undefined
}

export function shouldAutoOpenDevTools(isPackaged: boolean, env: RuntimeModeEnv): boolean {
  if (isPackaged) return false
  return Boolean(getDevRendererUrl(isPackaged, env) || env.MD_VIEWER_DEBUG)
}
