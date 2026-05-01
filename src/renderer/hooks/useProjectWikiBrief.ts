import { useEffect, useMemo, useState } from 'react'
import type { Doc } from '../../preload/types'
import type { ProjectWikiSummary } from '../lib/projectWiki'
import {
  buildProjectWikiBrief,
  extractProjectWikiEvidence,
  type ProjectWikiEvidence,
  type ProjectWikiBrief,
} from '../lib/projectWikiBrief'

interface WikiBriefState {
  brief: ProjectWikiBrief | null
  loading: boolean
}

interface WikiEvidenceState {
  signature: string
  evidence: ProjectWikiEvidence[]
}

function pickBriefDocs(summary: ProjectWikiSummary, docsByPath: Map<string, Doc>): Doc[] {
  const paths = new Set<string>()
  const docs: Doc[] = []
  for (const item of [...summary.onboardingPath, ...summary.decisionLog]) {
    if (paths.has(item.path)) continue
    const doc = docsByPath.get(item.path)
    if (!doc) continue
    paths.add(item.path)
    docs.push(doc)
    if (docs.length >= 8) break
  }
  return docs
}

export function useProjectWikiBrief(
  projectName: string,
  summary: ProjectWikiSummary,
  docsByPath: Map<string, Doc>
): WikiBriefState {
  const docs = useMemo(() => pickBriefDocs(summary, docsByPath), [summary, docsByPath])
  const signature = docs.map((doc) => `${doc.path}:${doc.mtime}`).join('\n')
  const summarySignal = [
    summary.markdownDocs,
    summary.recentDocs,
    summary.risks.missingRefs,
    summary.risks.staleRefs,
  ].join(':')
  const [evidenceState, setEvidenceState] = useState<WikiEvidenceState>({ signature: '', evidence: [] })
  const [loading, setLoading] = useState(false)
  const brief = useMemo(() => {
    if (docs.length === 0 || evidenceState.signature !== signature || evidenceState.evidence.length === 0) return null
    return buildProjectWikiBrief(projectName, summary, evidenceState.evidence)
    // summarySignal keeps the brief's activity/risk sentences fresh without rereading doc bodies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName, signature, summarySignal, evidenceState])

  useEffect(() => {
    if (docs.length === 0) {
      setEvidenceState({ signature: '', evidence: [] })
      setLoading(false)
      return
    }

    let cancelled = false
    setEvidenceState((current) => (current.signature === signature ? current : { signature, evidence: [] }))
    setLoading(true)

    void Promise.all(
      docs.map(async (doc) => {
        const result = await window.api.fs.readDoc(doc.path)
        return extractProjectWikiEvidence(doc, result.content ?? '')
      })
    )
      .then((evidence) => {
        if (cancelled) return
        setEvidenceState({ signature, evidence })
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setEvidenceState({ signature, evidence: [] })
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // signature captures the stable doc path/mtime list without making every render refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return { brief, loading }
}
