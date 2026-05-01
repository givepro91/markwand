import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatProjectWikiHandoffBrief, type ProjectWikiBrief } from '../lib/projectWikiBrief'
import type { ProjectWikiSummary } from '../lib/projectWiki'
import { Button, toast } from './ui'

interface AiHandoffButtonProps {
  projectName: string
  summary: ProjectWikiSummary
  brief: ProjectWikiBrief | null
}

export function AiHandoffButton({ projectName, summary, brief }: AiHandoffButtonProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatProjectWikiHandoffBrief(projectName, summary, brief))
      setCopied(true)
      toast.success(t('aiHandoff.copySuccess'))
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      resetTimerRef.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
      toast.error(t('aiHandoff.copyError'))
    }
  }

  return (
    <Button
      variant="primary"
      size="sm"
      onClick={handleCopy}
      aria-label={t('aiHandoff.copyAria')}
      fullWidth
    >
      {copied ? t('aiHandoff.copied') : t('aiHandoff.copy')}
    </Button>
  )
}
