import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export interface Heading {
  level: number
  text: string
  id: string
}

/**
 * GitHub-style slug 생성 (소문자, 공백→하이픈, 구두점 제거).
 * 한글/CJK 등 유니코드 문자는 보존한다 (\w는 ASCII만 매칭 → 한글이 모두 제거되어
 * `## 한글만` 같은 heading의 slug가 빈 문자열이 되고 querySelector('#')가 DOM Exception을 던지는 버그를 방지).
 * 빈 결과의 경우 최종 폴백으로 'heading'을 반환 (dedup 카운터가 이어서 숫자 suffix 부여).
 */
export function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
  return s || 'heading'
}

/**
 * 마크다운 문자열에서 헤딩 추출.
 * 코드블록(```...```) 내부의 # 은 무시한다.
 */
export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = []
  const lines = content.split('\n')
  let inCodeBlock = false

  for (const line of lines) {
    // 코드블록 경계 감지 (``` 또는 ~~~)
    if (/^(```|~~~)/.test(line)) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const match = /^(#{1,6})\s+(.+)$/.exec(line)
    if (match) {
      const level = match[1].length
      const rawText = match[2].trim()
      // 인라인 마크다운 제거 (**, *, `, [text](url) → text)
      const text = rawText
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .trim()
      headings.push({ level, text, id: slugify(text) })
    }
  }

  return headings
}

interface TableOfContentsProps {
  headings: Heading[]
  /** 커스텀 스크롤 핸들러. 미전달 시 document.getElementById fallback 사용. */
  onHeadingClick?: (id: string) => void
}

export function TableOfContents({ headings, onHeadingClick }: TableOfContentsProps) {
  const { t } = useTranslation()
  // id 중복 처리: 같은 slug가 여러 번 등장하면 -1, -2 suffix 추가
  const items = useMemo(() => {
    const counts = new Map<string, number>()
    return headings.map((h) => {
      const base = h.id
      const count = counts.get(base) ?? 0
      counts.set(base, count + 1)
      const id = count === 0 ? base : `${base}-${count}`
      return { ...h, id }
    })
  }, [headings])

  if (items.length === 0) return null

  const handleClick = (id: string) => {
    if (onHeadingClick) {
      onHeadingClick(id)
    } else {
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  return (
    <nav aria-label={t('toc.aria')} style={{ width: '100%' }}>
      <div
        style={{
          fontSize: 'var(--fs-xs)',
          fontWeight: 'var(--fw-semibold)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 'var(--sp-2)',
          paddingBottom: 'var(--sp-2)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {t('toc.title')}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {items.map((h, idx) => (
          <li key={`${h.id}-${idx}`}>
            <button
              onClick={() => handleClick(h.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: `2px 0 2px ${(h.level - 1) * 10}px`,
                fontSize: h.level === 1 ? 'var(--fs-sm)' : 'var(--fs-xs)',
                fontWeight: h.level <= 2 ? 'var(--fw-medium)' : 'var(--fw-normal)',
                color: h.level === 1 ? 'var(--text)' : 'var(--text-muted)',
                lineHeight: 'var(--lh-normal)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                borderRadius: 'var(--r-sm)',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--accent)'
                e.currentTarget.style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = h.level === 1 ? 'var(--text)' : 'var(--text-muted)'
                e.currentTarget.style.background = 'transparent'
              }}
              title={h.text}
            >
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
