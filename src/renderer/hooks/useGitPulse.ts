import { useEffect, useState } from 'react'
import type { GitPulseSummary } from '../../preload/types'

interface GitPulseState {
  summary: GitPulseSummary | null
  loading: boolean
}

export function useGitPulse(projectRoot: string): GitPulseState {
  const [summary, setSummary] = useState<GitPulseSummary | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSummary(null)

    void window.api.project.gitSummary(projectRoot)
      .then((next) => {
        if (cancelled) return
        setSummary(next)
      })
      .catch(() => {
        if (cancelled) return
        setSummary({ available: false, reason: 'error', cachedAt: Date.now() })
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [projectRoot])

  return { summary, loading }
}

