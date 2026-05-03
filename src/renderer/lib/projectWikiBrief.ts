import type { Doc } from '../../preload/types'
import type { ProjectWikiSummary, WikiDocRole, WikiSuggestedTask, WikiSuggestedTaskIntent } from './projectWiki'
import { formatProjectWikiGitContext, type ProjectWikiGitContext } from './projectWikiGit'

export interface ProjectWikiEvidence {
  path: string
  name: string
  title: string
  excerpt: string
}

export interface ProjectWikiBrief {
  headline: string
  overview: string[]
  evidence: ProjectWikiEvidence[]
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content
  const end = content.indexOf('\n---', 3)
  return end >= 0 ? content.slice(end + 4) : content
}

function cleanLine(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isUsableParagraph(line: string): boolean {
  if (!line.trim()) return false
  if (/^```/.test(line.trim())) return false
  if (/^!\[/.test(line.trim())) return false
  if (/^\|/.test(line.trim())) return false
  if (/^[-*]\s+\[[ x]\]/i.test(line.trim())) return false
  return cleanLine(line).length >= 24
}

export function extractProjectWikiEvidence(doc: Doc, content: string): ProjectWikiEvidence {
  const body = stripFrontmatter(content)
  const lines = body.split('\n')
  const h1 = lines.find((line) => /^#\s+/.test(line.trim()))
  const title = h1 ? cleanLine(h1) : doc.name.replace(/\.md$/i, '')
  const paragraph = lines.find((line) => isUsableParagraph(line))
  const excerpt = paragraph ? cleanLine(paragraph).slice(0, 260) : ''
  return {
    path: doc.path,
    name: doc.name,
    title,
    excerpt,
  }
}

export function buildProjectWikiBrief(
  projectName: string,
  summary: ProjectWikiSummary,
  evidence: ProjectWikiEvidence[]
): ProjectWikiBrief {
  const primary = evidence.find((item) => item.excerpt) ?? evidence[0]
  const headline = primary?.title || `${projectName} Wiki`
  const overview: string[] = []

  if (primary?.excerpt) {
    overview.push(primary.excerpt)
  }

  if (summary.recentDocs > 0) {
    overview.push(`${summary.recentDocs} documents changed in the last 7 days, so this project is currently active.`)
  }

  const issueCount = summary.risks.missingRefs + summary.risks.staleRefs
  if (issueCount > 0) {
    overview.push(`${issueCount} reference issues need review before treating the docs as fully trustworthy.`)
  } else if (summary.markdownDocs > 0) {
    overview.push('No broken or stale references are currently visible in the loaded drift reports.')
  }

  return {
    headline,
    overview,
    evidence: evidence.filter((item) => item.excerpt || item.title).slice(0, 5),
  }
}

const taskTitles: Record<WikiSuggestedTaskIntent, string> = {
  repairReferences: 'Repair risky document references',
  refreshStaleDocs: 'Review freshness-sensitive documents',
  completeMetadata: 'Normalize document metadata',
  buildOnboardingBrief: 'Create an onboarding brief',
  extractDecisionTimeline: 'Extract the decision timeline',
}

const taskPrompts: Record<WikiSuggestedTaskIntent, string> = {
  repairReferences:
    'Review the listed documents, identify broken or stale references, and propose exact edits that restore trust in the project docs.',
  refreshStaleDocs:
    'Read the listed freshness-sensitive documents, decide whether each should be updated, archived, or preserved as historical context, and explain why.',
  completeMetadata:
    'Inspect the listed documents and propose consistent frontmatter source/status metadata so the wiki can classify them reliably.',
  buildOnboardingBrief:
    'Use the listed starting documents to write a concise onboarding brief for a new human or AI collaborator.',
  extractDecisionTimeline:
    'Read the listed decision-oriented documents and extract a chronological decision timeline with unresolved questions.',
}

const taskCompletionCriteria: Record<WikiSuggestedTaskIntent, string[]> = {
  repairReferences: [
    'List each broken or stale reference with the affected document.',
    'Propose exact edits or replacement references where possible.',
    'Call out references that need human confirmation.',
  ],
  refreshStaleDocs: [
    'Identify which documents are active guides versus historical records.',
    'Recommend update, archive, preserve, or confirm for each document.',
    'Separate verified facts from assumptions.',
  ],
  completeMetadata: [
    'Suggest source/status frontmatter for each listed document.',
    'Explain any ambiguous classification choices.',
    'Keep metadata values consistent across similar documents.',
  ],
  buildOnboardingBrief: [
    'Summarize project purpose, current direction, and key entry points.',
    'Create a reading order for a new human or AI collaborator.',
    'Highlight risks or missing context before implementation work starts.',
  ],
  extractDecisionTimeline: [
    'Order decisions chronologically from the listed documents.',
    'Capture rationale, status, and unresolved questions.',
    'Flag contradictions or stale decisions that need review.',
  ],
}

const roleTitles: Record<WikiDocRole, string> = {
  currentGuide: 'Current guides',
  operational: 'Operational docs',
  reference: 'Reference docs',
  decisionRecord: 'Decision records',
  workLog: 'Work logs',
  tooling: 'Tooling docs',
  archive: 'Past records',
  ideaDraft: 'Idea drafts',
}

const roleGuidance: Record<WikiDocRole, string> = {
  currentGuide: 'Treat these as the active map. Verify freshness before handing work to AI.',
  operational: 'Treat these as high-risk execution docs. Confirm before deploy, migration, or incident work.',
  reference: 'Use these for structure and API context, but verify if related code changed recently.',
  decisionRecord: 'Preserve these as rationale. Do not rewrite just because later code changed.',
  workLog: 'Read these as historical project flow. They usually do not need forced updates.',
  tooling: 'Use these as automation or agent configuration context, not as first-read project truth.',
  archive: 'Keep these low priority unless someone explicitly needs the archived context.',
  ideaDraft: 'Treat these as proposals or early thinking, not current implementation truth.',
}

export function formatProjectWikiTaskPrompt(
  projectName: string,
  summary: ProjectWikiSummary,
  task: WikiSuggestedTask
): string {
  const issueCount = summary.risks.missingRefs + summary.risks.staleRefs
  const lines = [
    `# AI Task: ${taskTitles[task.intent]}`,
    '',
    `Project: ${projectName}`,
    `Priority: ${task.priority}`,
    `Trust score: ${summary.trust.score}/100 (${summary.trust.level})`,
    `Reference issues: ${issueCount} (${summary.risks.missingRefs} broken, ${summary.risks.staleRefs} stale)`,
    `Unread docs: ${summary.unreadDocs}`,
    '',
    '## Goal',
    taskPrompts[task.intent],
    '',
  ]

  if (summary.trust.signals.length > 0) {
    lines.push('## Why This Task Now')
    for (const signal of summary.trust.signals.slice(0, 4)) {
      const impact = signal.impact > 0 ? `+${signal.impact}` : String(signal.impact)
      lines.push(`- ${signal.key}: ${signal.count} (${impact} pts)`)
    }
    lines.push('')
  }

  if (task.docs.length > 0) {
    lines.push('## Input Documents')
    for (const doc of task.docs) {
      lines.push(`- ${doc.name}: ${doc.path}`)
    }
    lines.push('')
  }

  lines.push('## Completion Criteria')
  for (const item of taskCompletionCriteria[task.intent]) {
    lines.push(`- ${item}`)
  }

  lines.push(
    '',
    '## Output Format',
    '- Findings',
    '- Recommended edits or actions',
    '- Open questions',
    '- Confidence and evidence notes'
  )

  return lines.join('\n')
}

function formatSuggestedTask(task: WikiSuggestedTask): string[] {
  const lines = [
    `- [${task.priority}] ${taskTitles[task.intent]}`,
    `  - Prompt: ${taskPrompts[task.intent]}`,
  ]

  for (const doc of task.docs) {
    lines.push(`  - Doc: ${doc.name}: ${doc.path}`)
  }

  return lines
}

const pulseFocusText: Record<ProjectWikiSummary['pulse']['focus'], string> = {
  repairReferences: 'Repair broken or stale document references before relying on summaries.',
  refreshStaleDocs: 'Review only documents that are used as current guidance; preserve old plans as records.',
  completeMetadata: 'Normalize document source/status metadata so the wiki can classify docs reliably.',
  buildOnboardingBrief: 'Turn the first reading path into a short onboarding brief.',
  extractDecisionTimeline: 'Extract decisions, rationale, and unresolved questions from planning/design docs.',
  readFirst: 'Start from the suggested reading path; no major blocker is visible.',
}

const taskSituationText: Record<WikiSuggestedTaskIntent, string> = {
  repairReferences: 'Repair broken or stale document references before relying on summaries.',
  refreshStaleDocs: 'Review only freshness-sensitive current guides and operational docs.',
  completeMetadata: 'Clarify document source/status metadata before trusting automated classification.',
  buildOnboardingBrief: 'Turn the first reading path into a short onboarding brief.',
  extractDecisionTimeline: 'Extract decisions, rationale, and unresolved questions from planning/design docs.',
}

function formatDocLine(doc: { name: string; path: string }): string {
  return `- ${doc.name}: ${doc.path}`
}

export function formatProjectWikiHandoffBrief(
  projectName: string,
  summary: ProjectWikiSummary,
  brief: ProjectWikiBrief | null,
  gitContext?: ProjectWikiGitContext | null
): string {
  const issueCount = summary.risks.missingRefs + summary.risks.staleRefs
  const recommendedTask = summary.suggestedTasks[0]
  const markwandReading = recommendedTask ? taskSituationText[recommendedTask.intent] : pulseFocusText[summary.pulse.focus]
  const lines: string[] = [
    `# AI Handoff: ${projectName}`,
    '',
    '> Paste this into Claude, Codex, Cursor, or another AI tool as project context before asking it to act.',
    '',
    '## What I Need From You',
    recommendedTask
      ? `- Primary task: ${taskTitles[recommendedTask.intent]} (${recommendedTask.priority}).`
      : '- Primary task: understand the project, identify the safest next action, and avoid acting on stale assumptions.',
    recommendedTask
      ? `- Task instruction: ${taskPrompts[recommendedTask.intent]}`
      : '- Task instruction: explain the current direction, flag risky or outdated docs, then propose one concrete next step.',
    '- Output format: findings, recommended actions, open questions, and confidence/evidence notes.',
    '',
    '## Current Situation',
    `- Project: ${projectName}`,
    `- Markwand reading: ${markwandReading}`,
    `- Trust score: ${summary.trust.score}/100 (${summary.trust.level})`,
    `- Reference issues: ${issueCount} (${summary.risks.missingRefs} broken, ${summary.risks.staleRefs} stale)`,
    `- Activity: ${summary.recentDocs} docs changed in the last 7 days; ${summary.unreadDocs} unread docs.`,
    '',
    '## Guardrails',
    '- Do not treat old plans, work logs, or archived notes as docs that must be updated automatically.',
    '- Current guides and operational docs are the highest-risk docs to verify before implementation, deploy, migration, or incident work.',
    '- Separate verified facts from assumptions. Ask for confirmation when a reference is broken, ambiguous, or missing from the loaded docs.',
    '- Keep actions small and evidence-linked; do not rewrite broad documentation unless the task explicitly asks for it.',
    '',
    '## Project Snapshot',
    `- Markdown docs: ${summary.markdownDocs}`,
    `- Image/docs assets: ${summary.imageDocs}`,
    `- Relationship graph: ${summary.relationships.checkedDocs} checked docs, ${summary.relationships.totalRefs} references.`,
    '',
  ]

  if (summary.onboardingPath.length > 0 || summary.risks.docsWithRisk.length > 0) {
    lines.push('## Open These First')
    for (const item of summary.risks.docsWithRisk.slice(0, 3)) {
      const action = item.action ? `, action ${item.action}` : ''
      lines.push(`- Check issue doc: ${item.name}: ${item.path} (${item.missing} broken, ${item.stale} stale${action})`)
    }
    for (const item of summary.onboardingPath.slice(0, 5)) {
      lines.push(`- Read start doc: ${item.name}: ${item.path}`)
    }
    lines.push('')
  }

  if (summary.trust.signals.length > 0) {
    lines.push('## Trust Signals')
    for (const signal of summary.trust.signals.slice(0, 6)) {
      const impact = signal.impact > 0 ? `+${signal.impact}` : String(signal.impact)
      lines.push(`- ${signal.key}: ${signal.count} (${impact} pts)`)
    }
    lines.push('')
  }

  const gitLines = formatProjectWikiGitContext(gitContext)
  if (gitLines.length > 0) {
    lines.push('## Recent Git Context')
    lines.push(...gitLines)
    lines.push('')
  }

  if (brief) {
    lines.push('## Project Brief', brief.headline)
    for (const item of brief.overview.slice(0, 4)) {
      lines.push(`- ${item}`)
    }
    lines.push('')

    if (brief.evidence.length > 0) {
      lines.push('## Evidence Docs')
      for (const item of brief.evidence) {
        lines.push(formatDocLine({ name: item.title || item.name, path: item.path }))
        if (item.excerpt) lines.push(`  - ${item.excerpt}`)
      }
      lines.push('')
    }
  }

  if (summary.roleGroups?.length) {
    lines.push('## Document Roles')
    for (const group of summary.roleGroups) {
      lines.push(`- ${roleTitles[group.role]}: ${group.count} docs`)
      lines.push(`  - Guidance: ${roleGuidance[group.role]}`)
      for (const item of group.docs.slice(0, 2)) {
        lines.push(`  - ${item.name}: ${item.path}`)
      }
    }
    lines.push('')
  }

  if (summary.clusters.length > 0) {
    lines.push('## Knowledge Map')
    for (const cluster of summary.clusters) {
      lines.push(`- ${cluster.key}: ${cluster.count} docs`)
      for (const item of cluster.docs.slice(0, 3)) {
        lines.push(`  - ${item.name}: ${item.path}`)
      }
    }
    lines.push('')
  }

  if (summary.docDebt.length > 0) {
    lines.push('## Doc Debt Radar')
    for (const item of summary.docDebt.slice(0, 8)) {
      const rolePart = item.role ? `, role ${item.role}` : ''
      lines.push(`- ${item.name}: score ${item.score}${rolePart}, action ${item.action}, ${item.ageDays}d old (${item.reasons.join(', ')})`)
      lines.push(`  - ${item.path}`)
    }
    lines.push('')
  }

  if (summary.relationships.checkedDocs > 0) {
    lines.push(
      '## Link Graph',
      `- Checked docs: ${summary.relationships.checkedDocs}`,
      `- References: ${summary.relationships.totalRefs} (${summary.relationships.okRefs} ok, ${summary.relationships.missingRefs} broken, ${summary.relationships.staleRefs} stale)`
    )
    for (const hub of summary.relationships.hubs.slice(0, 5)) {
      lines.push(`- Hub: ${hub.name}: ${hub.inbound} inbound, ${hub.outbound} outbound, ${hub.riskRefs} risky (${hub.path})`)
    }
    for (const link of summary.relationships.riskyLinks.slice(0, 5)) {
      lines.push(`- Risk link: ${link.sourceName} -> ${link.targetName} (${link.status}, line ${link.line}, ${link.raw})`)
    }
    lines.push('')
  }

  if (summary.suggestedTasks.length > 0) {
    lines.push('## Additional AI Task Suggestions')
    for (const task of summary.suggestedTasks.slice(0, 4)) {
      lines.push(...formatSuggestedTask(task))
    }
    lines.push('')
  }

  if (summary.risks.docsWithRisk.length > 0) {
    lines.push('## Risk Board')
    for (const item of summary.risks.docsWithRisk.slice(0, 8)) {
      const action = item.action ? `, action ${item.action}` : ''
      lines.push(`- ${item.name}: ${item.missing} broken, ${item.stale} stale refs${action} (${item.path})`)
    }
    lines.push('')
  }

  lines.push(
    '## If You Only Do One Thing',
    recommendedTask
      ? taskPrompts[recommendedTask.intent]
      : 'Use this context to explain the current project direction, identify risky or outdated docs, and propose the next concrete action.'
  )

  return lines.join('\n').trimEnd()
}

export function formatProjectWikiOnboardingBrief(
  projectName: string,
  summary: ProjectWikiSummary,
  brief: ProjectWikiBrief | null
): string {
  const issueCount = summary.risks.missingRefs + summary.risks.staleRefs
  const lines: string[] = [
    `# Onboarding Brief: ${projectName}`,
    '',
    '## What This Project Is',
  ]

  if (brief?.overview.length) {
    for (const item of brief.overview.slice(0, 3)) {
      lines.push(`- ${item}`)
    }
  } else {
    lines.push(`- ${projectName} has ${summary.markdownDocs} markdown documents available for project context.`)
  }

  lines.push(
    '',
    '## Read This First'
  )

  if (summary.onboardingPath.length > 0) {
    for (const [index, item] of summary.onboardingPath.entries()) {
      lines.push(`${index + 1}. ${item.name} - ${item.path}`)
    }
  } else {
    lines.push('1. No clear starting document was detected yet. Start from the most recent overview or README-style document.')
  }

  lines.push(
    '',
    '## Check Before Acting',
    `- Trust score: ${summary.trust.score}/100 (${summary.trust.level})`,
    `- Reference status: ${summary.risks.missingRefs} broken links, ${summary.risks.staleRefs} stale refs to review`,
    `- Unread docs: ${summary.unreadDocs}`,
    `- Recent activity: ${summary.recentDocs} docs changed in the last 7 days`
  )

  if (summary.docDebt.length > 0) {
    lines.push('', '## Documents That May Need Cleanup')
    for (const item of summary.docDebt.slice(0, 3)) {
      const rolePart = item.role ? `, role ${item.role}` : ''
      lines.push(`- ${item.name}: score ${item.score}${rolePart}, reasons ${item.reasons.join(', ')} (${item.path})`)
    }
  }

  if (summary.roleGroups?.length) {
    lines.push('', '## How to Read Older Docs')
    for (const group of summary.roleGroups.filter((item) => ['workLog', 'decisionRecord', 'tooling', 'archive', 'ideaDraft'].includes(item.role)).slice(0, 3)) {
      lines.push(`- ${roleTitles[group.role]}: ${roleGuidance[group.role]}`)
    }
  }

  if (summary.suggestedTasks.length > 0) {
    lines.push('', '## Suggested First Actions')
    for (const task of summary.suggestedTasks.slice(0, 3)) {
      lines.push(`- ${taskTitles[task.intent]} (${task.priority})`)
    }
  } else if (issueCount === 0) {
    lines.push('', '## Suggested First Action', '- Follow the reading order and capture any missing assumptions before changing code.')
  }

  if (brief?.evidence.length) {
    lines.push('', '## Evidence Used')
    for (const item of brief.evidence.slice(0, 5)) {
      lines.push(`- ${item.title || item.name}: ${item.path}`)
    }
  }

  return lines.join('\n').trimEnd()
}
