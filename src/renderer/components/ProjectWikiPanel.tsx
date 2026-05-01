import { useTranslation } from 'react-i18next'
import { useState, type ReactNode } from 'react'
import { Badge, Button, EmptyState, toast } from './ui'
import type { Doc } from '../../preload/types'
import {
  formatProjectWikiHandoffBrief,
  formatProjectWikiTaskPrompt,
  type ProjectWikiBrief,
} from '../lib/projectWikiBrief'
import type {
  ProjectWikiSummary,
  WikiDocCluster,
  WikiDocDebt,
  WikiDocLink,
  WikiLinkHub,
  WikiRiskDoc,
  WikiRiskLink,
  WikiSuggestedTask,
  WikiTrustSignal,
} from '../lib/projectWiki'

interface ProjectWikiPanelProps {
  projectName: string
  summary: ProjectWikiSummary
  brief: ProjectWikiBrief | null
  briefLoading: boolean
  docsByPath: Map<string, Doc>
  onOpenDoc: (doc: Doc) => void
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      style={{
        minWidth: 0,
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)',
        padding: 'var(--sp-3)',
        background: 'color-mix(in srgb, var(--bg-elev) 88%, transparent)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 'var(--fw-semibold)', color: 'var(--text)' }}>
        {value}
      </div>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: 'var(--sp-1)' }}>
        {label}
      </div>
    </div>
  )
}

function TrustMetric({ summary }: { summary: ProjectWikiSummary }) {
  const { t } = useTranslation()
  const variant = summary.trust.level === 'weak' ? 'danger' : summary.trust.level === 'strong' ? 'success' : 'default'

  return (
    <div
      style={{
        minWidth: 0,
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)',
        padding: 'var(--sp-3)',
        background: 'color-mix(in srgb, var(--bg-elev) 88%, transparent)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)' }}>
        <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 'var(--fw-semibold)', color: 'var(--text)' }}>
          {summary.trust.score}
        </div>
        <Badge variant={variant} size="sm">{t(`projectWiki.trustLevel.${summary.trust.level}`)}</Badge>
      </div>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
        {t('projectWiki.metrics.trust')}
      </div>
    </div>
  )
}

function TrustDiagnostics({ summary }: { summary: ProjectWikiSummary }) {
  const { t } = useTranslation()
  const variant = summary.trust.level === 'weak' ? 'danger' : summary.trust.level === 'strong' ? 'success' : 'default'
  const signalVariant = (signal: WikiTrustSignal) => {
    if (signal.tone === 'danger') return 'danger'
    if (signal.tone === 'positive') return 'success'
    return 'default'
  }

  return (
    <section
      id="project-wiki-trust"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)',
        scrollMarginTop: 'var(--sp-6)',
        padding: 'var(--sp-5)',
        background: 'linear-gradient(135deg, var(--surface-glass) 0%, var(--bg-elev) 100%)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)', color: 'var(--text)' }}>
            {t('projectWiki.trustTitle')}
          </h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-relaxed)' }}>
            {t(`projectWiki.trustSummary.${summary.trust.level}`)}
          </p>
        </div>
        <Badge variant={variant} size="md">
          {t('projectWiki.trustScore', { score: summary.trust.score })}
        </Badge>
      </div>

      {summary.trust.signals.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
          {summary.trust.signals.map((signal) => (
            <Badge key={signal.key} variant={signalVariant(signal)} size="sm">
              {t(`projectWiki.trustSignal.${signal.key}`, { count: signal.count })}{' '}
              {signal.impact > 0
                ? t('projectWiki.trustImpactBonus', { impact: signal.impact })
                : t('projectWiki.trustImpactPenalty', { impact: Math.abs(signal.impact) })}
            </Badge>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
          {t('projectWiki.trustSignalsEmpty')}
        </p>
      )}
    </section>
  )
}

function ProjectPulseCard({
  projectName,
  summary,
  docsByPath,
  onOpenDoc,
}: {
  projectName: string
  summary: ProjectWikiSummary
  docsByPath: Map<string, Doc>
  onOpenDoc: (doc: Doc) => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const pulse = summary.pulse
  const focusDoc = pulse.primaryDoc ? docsByPath.get(pulse.primaryDoc.path) : undefined
  const task = pulse.actionTaskId
    ? summary.suggestedTasks.find((item) => item.id === pulse.actionTaskId)
    : undefined
  const variant = pulse.tone === 'attention' ? 'danger' : pulse.tone === 'healthy' ? 'success' : 'default'

  const copyPrompt = async () => {
    if (!task) return
    try {
      await navigator.clipboard.writeText(formatProjectWikiTaskPrompt(projectName, summary, task))
      setCopied(true)
      toast.success(t('projectWiki.copyTaskPromptSuccess'))
      setTimeout(() => setCopied(false), 1200)
    } catch {
      toast.error(t('projectWiki.copyTaskPromptError'))
    }
  }

  return (
    <section
      id="project-wiki-pulse"
      style={{
        border: '1px solid color-mix(in srgb, var(--accent) 28%, var(--border))',
        borderRadius: 'var(--r-xl)',
        padding: 'var(--sp-5)',
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent) 0%, var(--bg-elev) 62%)',
        boxShadow: 'var(--shadow-md)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 'var(--sp-4)',
        alignItems: 'center',
        scrollMarginTop: 'var(--sp-6)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <Badge variant={variant} size="sm">{t(`projectWiki.pulse.tone.${pulse.tone}`)}</Badge>
          {pulse.reasons.map((reason) => (
            <Badge key={reason} variant="default" size="sm">
              {t(`projectWiki.pulse.reason.${reason}`)}
            </Badge>
          ))}
        </div>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 'var(--fs-xl)', fontWeight: 'var(--fw-bold)', letterSpacing: '-0.02em' }}>
            {t(`projectWiki.pulse.focus.${pulse.focus}.title`)}
          </h2>
          <p style={{ margin: 'var(--sp-2) 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-relaxed)' }}>
            {t(`projectWiki.pulse.focus.${pulse.focus}.desc`)}
          </p>
        </div>
        {pulse.primaryDoc && (
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
            {t('projectWiki.pulse.focusDoc', { doc: pulse.primaryDoc.name })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', alignItems: 'stretch' }}>
        {focusDoc && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onOpenDoc(focusDoc)}
            aria-label={t('projectWiki.pulse.openFocusDocAria', { doc: pulse.primaryDoc?.name })}
          >
            {t('projectWiki.pulse.openFocusDoc')}
          </Button>
        )}
        {task && (
          <Button
            variant="ghost"
            size="sm"
            onClick={copyPrompt}
            aria-label={t('projectWiki.pulse.copyPromptAria')}
          >
            {copied ? t('projectWiki.copyTaskPromptDone') : t('projectWiki.pulse.copyPrompt')}
          </Button>
        )}
      </div>
    </section>
  )
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', scrollMarginTop: 'var(--sp-6)' }}>
      <h2
        style={{
          margin: 0,
          fontSize: 'var(--fs-md)',
          fontWeight: 'var(--fw-semibold)',
          color: 'var(--text)',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

function DocList({
  items,
  docsByPath,
  empty,
  onOpenDoc,
  renderMeta,
}: {
  items: WikiDocLink[]
  docsByPath: Map<string, Doc>
  empty: string
  onOpenDoc: (doc: Doc) => void
  renderMeta?: (item: WikiDocLink) => ReactNode
}) {
  if (items.length === 0) {
    return <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{empty}</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
      {items.map((item) => {
        const doc = docsByPath.get(item.path)
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => doc && onOpenDoc(doc)}
            disabled={!doc}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              width: '100%',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              background: 'var(--bg)',
              color: 'var(--text)',
              padding: 'var(--sp-3)',
              textAlign: 'left',
              cursor: doc ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.name}
            </span>
            {renderMeta?.(item)}
          </button>
        )
      })}
    </div>
  )
}

function RiskList({
  items,
  docsByPath,
  empty,
  missingLabel,
  staleLabel,
  onOpenDoc,
}: {
  items: WikiRiskDoc[]
  docsByPath: Map<string, Doc>
  empty: string
  missingLabel: string
  staleLabel: string
  onOpenDoc: (doc: Doc) => void
}) {
  if (items.length === 0) {
    return <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{empty}</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
      {items.map((item) => {
        const doc = docsByPath.get(item.path)
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => doc && onOpenDoc(doc)}
            disabled={!doc}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              width: '100%',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              background: 'var(--bg)',
              color: 'var(--text)',
              padding: 'var(--sp-3)',
              textAlign: 'left',
              cursor: doc ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.name}
            </span>
            <span style={{ display: 'inline-flex', gap: 'var(--sp-1)', alignItems: 'center' }}>
              {item.missing > 0 && <Badge variant="danger" size="sm">{missingLabel} {item.missing}</Badge>}
              {item.stale > 0 && <Badge variant="default" size="sm">{staleLabel} {item.stale}</Badge>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function KnowledgeMap({
  clusters,
  docsByPath,
  onOpenDoc,
}: {
  clusters: WikiDocCluster[]
  docsByPath: Map<string, Doc>
  onOpenDoc: (doc: Doc) => void
}) {
  const { t } = useTranslation()

  if (clusters.length === 0) {
    return <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{t('projectWiki.knowledgeEmpty')}</p>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--sp-3)' }}>
      {clusters.map((cluster) => (
        <div
          key={cluster.key}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            background: 'var(--bg)',
            padding: 'var(--sp-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-2)',
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-2)', alignItems: 'center' }}>
            <strong style={{ color: 'var(--text)', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)' }}>
              {t(`projectWiki.cluster.${cluster.key}`)}
            </strong>
            <Badge variant="default" size="sm">{cluster.count}</Badge>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
            {cluster.docs.map((item) => {
              const doc = docsByPath.get(item.path)
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => doc && onOpenDoc(doc)}
                  disabled={!doc}
                  style={{
                    border: 0,
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    cursor: doc ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit',
                    fontSize: 'var(--fs-xs)',
                    padding: 0,
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.name}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function DocDebtRadar({
  items,
  docsByPath,
  onOpenDoc,
}: {
  items: WikiDocDebt[]
  docsByPath: Map<string, Doc>
  onOpenDoc: (doc: Doc) => void
}) {
  const { t } = useTranslation()

  if (items.length === 0) {
    return <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{t('projectWiki.docDebtEmpty')}</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
      {items.map((item) => {
        const doc = docsByPath.get(item.path)
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => doc && onOpenDoc(doc)}
            disabled={!doc}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              background: 'var(--bg)',
              color: 'var(--text)',
              padding: 'var(--sp-3)',
              fontFamily: 'inherit',
              textAlign: 'left',
              cursor: doc ? 'pointer' : 'not-allowed',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-2)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </span>
              <Badge variant={item.score >= 50 ? 'danger' : 'default'} size="sm">
                {t('projectWiki.docDebtScore', { score: item.score })}
              </Badge>
            </span>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)' }}>
              {item.reasons.map((reason) => (
                <Badge key={reason} variant={reason === 'risk' ? 'danger' : 'default'} size="sm">
                  {t(`projectWiki.docDebtReason.${reason}`)}
                </Badge>
              ))}
              {item.ageDays > 0 && <Badge variant="default" size="sm">{t('projectWiki.docDebtAge', { days: item.ageDays })}</Badge>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function RelationshipGraph({
  summary,
  docsByPath,
  onOpenDoc,
}: {
  summary: ProjectWikiSummary
  docsByPath: Map<string, Doc>
  onOpenDoc: (doc: Doc) => void
}) {
  const { t } = useTranslation()
  const graph = summary.relationships
  const openPath = (path: string) => {
    const doc = docsByPath.get(path)
    if (doc) onOpenDoc(doc)
  }
  const statusVariant = (status: WikiRiskLink['status']) => status === 'missing' ? 'danger' : 'default'

  if (graph.checkedDocs === 0) {
    return <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{t('projectWiki.linkGraphEmpty')}</p>
  }

  return (
    <section
      id="project-wiki-link-graph"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)',
        scrollMarginTop: 'var(--sp-6)',
        padding: 'var(--sp-5)',
        background:
          'radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 10%, transparent) 0, transparent 34%), linear-gradient(135deg, var(--bg-elev) 0%, var(--bg) 100%)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-4)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)', color: 'var(--text)' }}>
            {t('projectWiki.linkGraphTitle')}
          </h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-relaxed)' }}>
            {t('projectWiki.linkGraphSummary', {
              refs: graph.totalRefs,
              checked: graph.checkedDocs,
              risky: graph.missingRefs + graph.staleRefs,
            })}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', alignItems: 'flex-start' }}>
          <Badge variant="default" size="sm">{t('projectWiki.linkGraphChecked', { count: graph.checkedDocs })}</Badge>
          <Badge variant="success" size="sm">{t('projectWiki.linkGraphOk', { count: graph.okRefs })}</Badge>
          {(graph.missingRefs + graph.staleRefs) > 0 && (
            <Badge variant="danger" size="sm">{t('projectWiki.linkGraphRisk', { count: graph.missingRefs + graph.staleRefs })}</Badge>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', minWidth: 0 }}>
          <strong style={{ color: 'var(--text)', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)' }}>
            {t('projectWiki.linkGraphHubs')}
          </strong>
          {graph.hubs.length > 0 ? (
            graph.hubs.map((hub: WikiLinkHub) => (
              <button
                key={hub.path}
                type="button"
                onClick={() => openPath(hub.path)}
                disabled={!docsByPath.has(hub.path)}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  padding: 'var(--sp-3)',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  cursor: docsByPath.has(hub.path) ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--sp-2)',
                  minWidth: 0,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hub.name}</span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1)' }}>
                  <Badge variant="default" size="sm">{t('projectWiki.linkGraphInbound', { count: hub.inbound })}</Badge>
                  <Badge variant="default" size="sm">{t('projectWiki.linkGraphOutbound', { count: hub.outbound })}</Badge>
                  {hub.riskRefs > 0 && <Badge variant="danger" size="sm">{t('projectWiki.linkGraphRiskShort', { count: hub.riskRefs })}</Badge>}
                </span>
              </button>
            ))
          ) : (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{t('projectWiki.linkGraphHubsEmpty')}</p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', minWidth: 0 }}>
          <strong style={{ color: 'var(--text)', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)' }}>
            {t('projectWiki.linkGraphRiskLinks')}
          </strong>
          {graph.riskyLinks.length > 0 ? (
            graph.riskyLinks.map((link: WikiRiskLink) => (
              <button
                key={`${link.sourcePath}:${link.line}:${link.raw}`}
                type="button"
                onClick={() => openPath(link.sourcePath)}
                disabled={!docsByPath.has(link.sourcePath)}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  padding: 'var(--sp-3)',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  cursor: docsByPath.has(link.sourcePath) ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--sp-1)',
                  minWidth: 0,
                }}
              >
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-2)', alignItems: 'center' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {link.sourceName} → {link.targetName}
                  </span>
                  <Badge variant={statusVariant(link.status)} size="sm">{t(`projectWiki.linkGraphStatus.${link.status}`)}</Badge>
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t('projectWiki.linkGraphLine', { line: link.line })} · {link.raw}
                </span>
              </button>
            ))
          ) : (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{t('projectWiki.linkGraphRiskLinksEmpty')}</p>
          )}
        </div>
      </div>
    </section>
  )
}

function AiTaskSuggestions({
  projectName,
  summary,
  tasks,
  docsByPath,
  onOpenDoc,
}: {
  projectName: string
  summary: ProjectWikiSummary
  tasks: WikiSuggestedTask[]
  docsByPath: Map<string, Doc>
  onOpenDoc: (doc: Doc) => void
}) {
  const { t } = useTranslation()
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null)
  const priorityVariant = (priority: WikiSuggestedTask['priority']) => {
    if (priority === 'high') return 'danger'
    if (priority === 'low') return 'count'
    return 'default'
  }
  const handleCopyTask = async (task: WikiSuggestedTask) => {
    try {
      await navigator.clipboard.writeText(formatProjectWikiTaskPrompt(projectName, summary, task))
      setCopiedTaskId(task.id)
      toast.success(t('projectWiki.copyTaskPromptSuccess'))
    } catch {
      toast.error(t('projectWiki.copyTaskPromptError'))
    }
  }

  if (tasks.length === 0) {
    return <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>{t('projectWiki.aiTasksEmpty')}</p>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--sp-3)' }}>
      {tasks.map((task) => (
        <article
          key={task.id}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)',
            background:
              task.priority === 'high'
                ? 'linear-gradient(135deg, color-mix(in srgb, var(--color-danger-bg) 50%, var(--bg)) 0%, var(--bg) 72%)'
                : 'linear-gradient(135deg, var(--bg) 0%, var(--bg-elev) 100%)',
            padding: 'var(--sp-4)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-3)',
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', minWidth: 0 }}>
              <strong style={{ color: 'var(--text)', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)' }}>
                {t(`projectWiki.aiTask.${task.intent}.title`)}
              </strong>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', lineHeight: 'var(--lh-relaxed)' }}>
                {t(`projectWiki.aiTask.${task.intent}.desc`)}
              </span>
            </div>
            <Badge variant={priorityVariant(task.priority)} size="sm">
              {t(`projectWiki.aiTaskPriority.${task.priority}`)}
            </Badge>
          </div>

          {task.docs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
              {task.docs.map((item) => {
                const doc = docsByPath.get(item.path)
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => doc && onOpenDoc(doc)}
                    disabled={!doc}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '999px',
                      background: 'var(--bg-elev)',
                      color: 'var(--text-muted)',
                      padding: 'var(--sp-1) var(--sp-2)',
                      fontFamily: 'inherit',
                      fontSize: 'var(--fs-xs)',
                      cursor: doc ? 'pointer' : 'not-allowed',
                      maxWidth: '220px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.name}
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const firstDoc = task.docs.map((item) => docsByPath.get(item.path)).find(Boolean)
                if (firstDoc) onOpenDoc(firstDoc)
              }}
              disabled={!task.docs.some((item) => docsByPath.has(item.path))}
              aria-label={t('projectWiki.openTaskDocAria', { task: t(`projectWiki.aiTask.${task.intent}.title`) })}
            >
              {t('projectWiki.openTaskDoc')}
            </Button>
            <Button
              variant={task.priority === 'high' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => handleCopyTask(task)}
              aria-label={t('projectWiki.copyTaskPromptAria', { task: t(`projectWiki.aiTask.${task.intent}.title`) })}
            >
              {copiedTaskId === task.id ? t('projectWiki.copyTaskPromptDone') : t('projectWiki.copyTaskPrompt')}
            </Button>
          </div>
        </article>
      ))}
    </div>
  )
}

function ProjectBriefCard({
  projectName,
  summary,
  brief,
  loading,
  docsByPath,
  onOpenDoc,
}: {
  projectName: string
  summary: ProjectWikiSummary
  brief: ProjectWikiBrief | null
  loading: boolean
  docsByPath: Map<string, Doc>
  onOpenDoc: (doc: Doc) => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopyHandoff = async () => {
    try {
      await navigator.clipboard.writeText(formatProjectWikiHandoffBrief(projectName, summary, brief))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section
      id="project-wiki-brief"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)',
        scrollMarginTop: 'var(--sp-6)',
        padding: 'var(--sp-5)',
        background:
          'radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 12%, transparent) 0, transparent 34%), linear-gradient(135deg, var(--bg-elev) 0%, var(--bg) 100%)',
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--fs-lg)',
            fontWeight: 'var(--fw-semibold)',
            color: 'var(--text)',
          }}
        >
          {t('projectWiki.briefTitle')}
        </h2>
        <span style={{ display: 'inline-flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
          {loading && <Badge variant="default" size="sm">{t('projectWiki.briefLoading')}</Badge>}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyHandoff}
            aria-label={t('projectWiki.copyHandoffAria')}
          >
            {copied ? t('projectWiki.copyHandoffDone') : t('projectWiki.copyHandoff')}
          </Button>
        </span>
      </div>

      {brief ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <h3
              style={{
                margin: 0,
                fontSize: 'var(--fs-xl)',
                fontWeight: 'var(--fw-semibold)',
                color: 'var(--text)',
              }}
            >
              {brief.headline}
            </h3>
            {brief.overview.map((line) => (
              <p
                key={line}
                style={{
                  margin: 0,
                  color: 'var(--text-muted)',
                  fontSize: 'var(--fs-sm)',
                  lineHeight: 'var(--lh-relaxed)',
                }}
              >
                {line}
              </p>
            ))}
          </div>

          {brief.evidence.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 'var(--fw-semibold)' }}>
                {t('projectWiki.evidenceTitle')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
                {brief.evidence.map((item) => {
                  const doc = docsByPath.get(item.path)
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => doc && onOpenDoc(doc)}
                      disabled={!doc}
                      title={item.excerpt || item.title}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: '999px',
                        background: 'var(--bg)',
                        color: 'var(--text)',
                        padding: 'var(--sp-1) var(--sp-3)',
                        fontFamily: 'inherit',
                        fontSize: 'var(--fs-xs)',
                        cursor: doc ? 'pointer' : 'not-allowed',
                        maxWidth: '260px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title || item.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
          {loading ? t('projectWiki.briefLoading') : t('projectWiki.briefEmpty')}
        </p>
      )}
    </section>
  )
}

function WikiSectionNav() {
  const { t } = useTranslation()
  const sections = [
    { id: 'project-wiki-brief', label: t('projectWiki.navBrief') },
    { id: 'project-wiki-link-graph', label: t('projectWiki.navLinks') },
    { id: 'project-wiki-ai-tasks', label: t('projectWiki.navTasks') },
    { id: 'project-wiki-start', label: t('projectWiki.navStart') },
    { id: 'project-wiki-risks', label: t('projectWiki.navRisks') },
  ]

  const jumpToSection = (id: string) => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <nav
      aria-label={t('projectWiki.navAria')}
      style={{
        position: 'sticky',
        top: 'var(--sp-3)',
        zIndex: 'var(--z-sticky)',
        display: 'flex',
        gap: 'var(--sp-2)',
        flexWrap: 'wrap',
        padding: 'var(--sp-2)',
        border: '1px solid var(--border)',
        borderRadius: '999px',
        background: 'var(--surface-glass)',
        backdropFilter: 'blur(14px)',
        boxShadow: 'var(--shadow-sm)',
        width: 'fit-content',
        maxWidth: '100%',
      }}
    >
      {sections.map((section) => (
        <Button
          key={section.id}
          variant="ghost"
          size="sm"
          onClick={() => jumpToSection(section.id)}
        >
          {section.label}
        </Button>
      ))}
    </nav>
  )
}

export function ProjectWikiPanel({
  projectName,
  summary,
  brief,
  briefLoading,
  docsByPath,
  onOpenDoc,
}: ProjectWikiPanelProps) {
  const { t } = useTranslation()

  if (summary.totalDocs === 0) {
    return (
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          icon="📚"
          title={t('projectWiki.emptyTitle')}
          description={t('projectWiki.emptyDesc')}
        />
      </div>
    )
  }

  const primarySource = summary.sourceCounts[0]
  const primaryStatus = summary.statusCounts[0]

  return (
    <div
      style={{
        maxWidth: '980px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-6)',
      }}
    >
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-3)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)',
          padding: 'var(--sp-6)',
          background: 'var(--surface-wash), var(--bg-elev)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <Badge variant="default" size="sm">{t('projectWiki.badge')}</Badge>
          <Badge variant={summary.trust.level === 'weak' ? 'danger' : summary.trust.level === 'strong' ? 'success' : 'default'} size="sm">
            {t('projectWiki.trustBadge', { score: summary.trust.score })}
          </Badge>
          {primarySource && <Badge variant="marker" size="sm">{primarySource.source}</Badge>}
          {primaryStatus && <Badge variant="success" size="sm">{primaryStatus.status}</Badge>}
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 'var(--fs-2xl)',
            fontWeight: 'var(--fw-bold)',
            color: 'var(--text)',
            letterSpacing: '-0.02em',
          }}
        >
          {t('projectWiki.title', { name: projectName })}
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-md)', lineHeight: 'var(--lh-relaxed)' }}>
          {t('projectWiki.summary', {
            docs: summary.markdownDocs,
            recent: summary.recentDocs,
            missing: summary.risks.missingRefs,
            stale: summary.risks.staleRefs,
          })}
        </p>
      </header>

      <ProjectPulseCard
        projectName={projectName}
        summary={summary}
        docsByPath={docsByPath}
        onOpenDoc={onOpenDoc}
      />

      <WikiSectionNav />

      <ProjectBriefCard
        projectName={projectName}
        summary={summary}
        brief={brief}
        loading={briefLoading}
        docsByPath={docsByPath}
        onOpenDoc={onOpenDoc}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 'var(--sp-3)',
        }}
      >
        <TrustMetric summary={summary} />
        <Metric label={t('projectWiki.metrics.docs')} value={summary.markdownDocs} />
        <Metric label={t('projectWiki.metrics.recent')} value={summary.recentDocs} />
        <Metric label={t('projectWiki.metrics.unread')} value={summary.unreadDocs} />
        <Metric label={t('projectWiki.metrics.risks')} value={summary.risks.missingRefs + summary.risks.staleRefs} />
      </div>

      <TrustDiagnostics summary={summary} />

      <RelationshipGraph
        summary={summary}
        docsByPath={docsByPath}
        onOpenDoc={onOpenDoc}
      />

      <Section id="project-wiki-ai-tasks" title={t('projectWiki.aiTasksTitle')}>
        <AiTaskSuggestions
          projectName={projectName}
          summary={summary}
          tasks={summary.suggestedTasks}
          docsByPath={docsByPath}
          onOpenDoc={onOpenDoc}
        />
      </Section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'var(--sp-6)',
          alignItems: 'start',
        }}
      >
        <Section title={t('projectWiki.knowledgeTitle')}>
          <KnowledgeMap
            clusters={summary.clusters}
            docsByPath={docsByPath}
            onOpenDoc={onOpenDoc}
          />
        </Section>

        <Section id="project-wiki-start" title={t('projectWiki.onboardingTitle')}>
          <DocList
            items={summary.onboardingPath}
            docsByPath={docsByPath}
            empty={t('projectWiki.onboardingEmpty')}
            onOpenDoc={onOpenDoc}
            renderMeta={(item) => (
              <Badge variant={item.reason === 'entrypoint' ? 'success' : 'default'} size="sm">
                {t(`projectWiki.reason.${item.reason}`)}
              </Badge>
            )}
          />
        </Section>

        <Section id="project-wiki-risks" title={t('projectWiki.riskTitle')}>
          <RiskList
            items={summary.risks.docsWithRisk}
            docsByPath={docsByPath}
            empty={t('projectWiki.riskEmpty')}
            missingLabel={t('projectWiki.riskMissing')}
            staleLabel={t('projectWiki.riskStale')}
            onOpenDoc={onOpenDoc}
          />
          {(summary.risks.missingRefs > 0 || summary.risks.staleRefs > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const first = summary.risks.docsWithRisk[0]
                const doc = first ? docsByPath.get(first.path) : undefined
                if (doc) onOpenDoc(doc)
              }}
            >
              {t('projectWiki.openTopRisk')}
            </Button>
          )}
        </Section>

        <Section title={t('projectWiki.docDebtTitle')}>
          <DocDebtRadar
            items={summary.docDebt}
            docsByPath={docsByPath}
            onOpenDoc={onOpenDoc}
          />
        </Section>

        <Section title={t('projectWiki.decisionsTitle')}>
          <DocList
            items={summary.decisionLog}
            docsByPath={docsByPath}
            empty={t('projectWiki.decisionsEmpty')}
            onOpenDoc={onOpenDoc}
          />
        </Section>

        <Section title={t('projectWiki.facetsTitle')}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
            {summary.sourceCounts.map((item) => (
              <Badge key={`source:${item.source}`} variant="marker" size="sm">
                {item.source} {item.count}
              </Badge>
            ))}
            {summary.statusCounts.map((item) => (
              <Badge key={`status:${item.status}`} variant="default" size="sm">
                {item.status} {item.count}
              </Badge>
            ))}
            {summary.sourceCounts.length === 0 && summary.statusCounts.length === 0 && (
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
                {t('projectWiki.facetsEmpty')}
              </p>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}
