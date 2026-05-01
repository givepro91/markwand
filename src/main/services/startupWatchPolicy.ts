export interface StartupWatchPolicyEnv {
  MARKWAND_ENABLE_STARTUP_WATCH?: string
}

export function shouldStartStartupWatcher(env: StartupWatchPolicyEnv): boolean {
  const value = env.MARKWAND_ENABLE_STARTUP_WATCH?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}
