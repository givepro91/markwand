import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { rehypeSanitize, rehypeHighlight, remarkGfm, remarkBreaks, sanitizeSchema } from '../lib/markdown'
import 'highlight.js/styles/github.css'
import 'highlight.js/styles/github-dark.css'
import { renderMermaid, onMermaidThemeChange } from '../lib/mermaid'
import { slugify, extractHeadings } from './TableOfContents'
import type { Heading } from './TableOfContents'
// 브라우저 환경용 경량 path 유틸 (Node path 미사용)
const pathUtil = {
  dirname(p: string): string {
    const idx = p.lastIndexOf('/')
    return idx >= 0 ? p.slice(0, idx) : '.'
  },
  join(...parts: string[]): string {
    const joined = parts.join('/')
    const segments = joined.split('/')
    const result: string[] = []
    for (const seg of segments) {
      if (seg === '..') result.pop()
      else if (seg !== '.') result.push(seg)
    }
    return result.join('/')
  },
}

interface MarkdownViewerProps {
  content: string
  basePath: string
  onDocNavigate: (absPath: string) => void
  onHeadings?: (headings: Heading[]) => void
  /** FS9-B — 현재 문서가 속한 workspace id. SSH(ssh:…) 면 이미지는 IPC 스트리밍 경유. */
  workspaceId?: string | null
}

let mermaidCounter = 0

// Mermaid 블록: IntersectionObserver로 viewport 진입 시점에 렌더
const MermaidBlock = memo(function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>('')
  const containerRef = useRef<HTMLDivElement>(null)
  const renderedRef = useRef(false)

  const render = useCallback(async () => {
    const id = `mermaid-${++mermaidCounter}`
    const result = await renderMermaid(id, code)
    setSvg(result)
    renderedRef.current = true
  }, [code])

  // mermaid 테마 변경 시 재렌더
  useEffect(() => {
    const unsubscribe = onMermaidThemeChange(() => {
      renderedRef.current = false
      render()
    })
    return unsubscribe
  }, [render])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !renderedRef.current) {
          render()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [render])

  return (
    <div
      ref={containerRef}
      className="mermaid-block"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      style={
        !svg
          ? {
              minHeight: '60px',
              background: 'var(--bg-elev)',
              borderRadius: 'var(--r-md)',
              padding: 'var(--sp-4)',
              margin: 'var(--sp-4) 0',
            }
          : { padding: 'var(--sp-2) 0', margin: 'var(--sp-4) 0' }
      }
    />
  )
})

// 외부 배지(private repo 404) 등 로드 실패 이미지를 깨진 아이콘 대신 alt 뱃지로 표시
// v0.4 H9 — 이미지 로드 전 `aspect-ratio: 16/9` placeholder 로 CLS 완화.
// onLoad 직후 naturalWidth/Height 로 실제 비율 swap. CSS `attr()` advanced
// syntax 는 Chromium 130 (Electron 33) 미지원 → JS 경로 단일 적용 (Plan S1).
function swapAspectRatioOnLoad(img: HTMLImageElement | null) {
  if (!img || !img.naturalWidth || !img.naturalHeight) return
  img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`
}

const SafeImage = memo(function SafeImage({
  src,
  alt,
  extraProps,
}: {
  src: string
  alt?: string
  extraProps: React.ImgHTMLAttributes<HTMLImageElement>
}) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  const safeImgRef = useRef<HTMLImageElement>(null)
  const handleSafeImageLoad = useCallback(() => swapAspectRatioOnLoad(safeImgRef.current), [])
  if (failed) {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '1px 6px',
          fontSize: 'var(--fs-xs)',
          color: 'var(--text-muted)',
          background: 'var(--bg-elev)',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--border)',
        }}
        title={t('markdown.imageLoadFailed', { src })}
      >
        {alt || 'image'}
      </span>
    )
  }
  return (
    <img
      ref={safeImgRef}
      src={src}
      alt={alt}
      {...extraProps}
      style={{ maxWidth: '100%', width: '100%', height: 'auto', aspectRatio: '16 / 9' }}
      onLoad={handleSafeImageLoad}
      onError={() => setFailed(true)}
    />
  )
})

// FS9-B — 원격 SSH workspace 의 이미지. IPC 로 버퍼 받아 blob URL 생성 후 <img> 에 주입.
// 실패 시 SafeImage 와 동일한 alt 배지 fallback.
const SshImage = memo(function SshImage({
  workspaceId,
  path,
  alt,
  extraProps,
}: {
  workspaceId: string
  path: string
  alt?: string
  extraProps: React.ImgHTMLAttributes<HTMLImageElement>
}) {
  const { t } = useTranslation()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const sshImgRef = useRef<HTMLImageElement>(null)
  const handleSshImageLoad = useCallback(() => swapAspectRatioOnLoad(sshImgRef.current), [])

  useEffect(() => {
    let cancelled = false
    let currentUrl: string | null = null
    setFailed(false)
    setBlobUrl(null)
    window.api.ssh
      .readImage({ workspaceId, path })
      .then((result) => {
        if (cancelled) return
        // result.data 는 IPC 직렬화 후 Uint8Array 또는 Buffer-like. Blob 생성에 필요한 ArrayBuffer 로 강제.
        const u8 =
          result.data instanceof Uint8Array
            ? result.data
            : new Uint8Array(result.data as unknown as ArrayBuffer)
        const ab = new ArrayBuffer(u8.byteLength)
        new Uint8Array(ab).set(u8)
        const blob = new Blob([ab], { type: result.mime })
        currentUrl = URL.createObjectURL(blob)
        setBlobUrl(currentUrl)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [workspaceId, path])

  if (failed || !blobUrl) {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '1px 6px',
          fontSize: 'var(--fs-xs)',
          color: 'var(--text-muted)',
          background: 'var(--bg-elev)',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--border)',
        }}
        title={failed ? t('markdown.remoteImageLoadFailed', { path }) : t('markdown.remoteImageLoading')}
      >
        {alt || (failed ? 'image' : '…')}
      </span>
    )
  }
  return (
    <img
      ref={sshImgRef}
      src={blobUrl}
      alt={alt}
      {...extraProps}
      style={{ maxWidth: '100%', width: '100%', height: 'auto', aspectRatio: '16 / 9' }}
      onLoad={handleSshImageLoad}
      onError={() => setFailed(true)}
    />
  )
})

// 헤딩 레벨 → 태그 이름
const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

// React children을 재귀적으로 순회해 텍스트를 수집한다.
// 인라인 포맷(**, *, `, [text](url))이 있는 heading도 extractHeadings와 동일한 slug가 나와야
// TOC 클릭 시 DOM id 매칭이 성공한다.
function extractChildText(node: React.ReactNode): string {
  if (node == null || node === false) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractChildText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractChildText((node as { props: { children?: React.ReactNode } }).props.children)
  }
  return ''
}

// id 중복 방지용 카운터 (컴포넌트 인스턴스 스코프는 ref로 관리)
function makeHeadingComponent(level: 1 | 2 | 3 | 4 | 5 | 6, slugCounter: Map<string, number>) {
  const Tag = HEADING_TAGS[level - 1]
  return function HeadingNode({ children, id: _ignored, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    // react-markdown의 기본 props에서 id는 무시하고 항상 extractHeadings와 동일한 slug를 부여한다.
    const text = extractChildText(children).trim()
    const base = slugify(text)
    const count = slugCounter.get(base) ?? 0
    slugCounter.set(base, count + 1)
    const id = count === 0 ? base : `${base}-${count}`
    return <Tag {...props} id={id}>{children}</Tag>
  }
}

function MarkdownViewerInner({ content, basePath, onDocNavigate, onHeadings, workspaceId }: MarkdownViewerProps) {
  const isSshContext = workspaceId?.startsWith('ssh:') ?? false
  const resolveRelativePath = useCallback(
    (href: string): string => {
      if (!href || href.startsWith('http://') || href.startsWith('https://')) return href
      // basePath는 파일 경로이므로 dirname을 기준으로 resolve
      const dir = pathUtil.dirname(basePath)
      return pathUtil.join(dir, href)
    },
    [basePath]
  )

  // content 변경 시 헤딩 추출해서 콜백
  useEffect(() => {
    if (onHeadings) {
      onHeadings(extractHeadings(content))
    }
  }, [content, onHeadings])

  // slugCounter는 components useMemo 클로저 내부에 두어 factory 호출마다 새로 생성.
  // 렌더 중 ref mutation을 피하고, StrictMode 이중 렌더에서도 각 invocation이 독립 counter를 받는다.
  const components: Components = useMemo(() => {
    const slugCounter = new Map<string, number>()
    return {
    h1: makeHeadingComponent(1, slugCounter),
    h2: makeHeadingComponent(2, slugCounter),
    h3: makeHeadingComponent(3, slugCounter),
    h4: makeHeadingComponent(4, slugCounter),
    h5: makeHeadingComponent(5, slugCounter),
    h6: makeHeadingComponent(6, slugCounter),

    // 링크 처리: 외부 → shell.openExternal, 내부 .md → onDocNavigate, app:// 이미지
    a({ href, children, ...props }) {
      if (!href) return <a {...props}>{children}</a>

      const isExternal = href.startsWith('http://') || href.startsWith('https://')
      if (isExternal) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault()
              window.api.shell.openExternal(href)
            }}
            {...props}
          >
            {children}
          </a>
        )
      }

      if (href.endsWith('.md') || href.includes('.md#')) {
        const absPath = resolveRelativePath(href.split('#')[0])
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault()
              onDocNavigate(absPath)
            }}
            {...props}
          >
            {children}
          </a>
        )
      }

      return <a href={href} {...props}>{children}</a>
    },

    // 이미지 처리: 상대 경로 → app:// 프로토콜(고정 host=local + encoded path).
    // host에 path 세그먼트를 넣으면 Chromium이 소문자 정규화해서 워크스페이스 비교가 깨진다.
    // 로드 실패(private repo 배지 404 등) 시 깨진 아이콘 대신 alt 뱃지로 fallback.
    img({ src, alt, ...props }) {
      if (!src) return <img alt={alt} {...props} />
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('blob:')) {
        return <SafeImage src={src} alt={alt} extraProps={props} />
      }
      const abs = src.startsWith('app://') ? src.replace(/^app:\/\/(?:local)?/, '') : resolveRelativePath(src)
      // FS9-B — SSH workspace 의 이미지는 app:// 로컬 fallthrough 불가 → IPC 스트리밍.
      if (isSshContext && workspaceId) {
        return <SshImage workspaceId={workspaceId} path={abs} alt={alt} extraProps={props} />
      }
      const encoded = abs.split('/').map(encodeURIComponent).join('/')
      const resolved = `app://local${encoded}`
      return <SafeImage src={resolved} alt={alt} extraProps={props} />
    },

    // 코드 블록: mermaid 분기
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '')
      const lang = match?.[1]
      const codeStr = String(children).replace(/\n$/, '')

      if (lang === 'mermaid') {
        return <MermaidBlock code={codeStr} />
      }

      // inline code
      if (!className) {
        return <code className={className} {...props}>{children}</code>
      }

      // block code는 rehypeHighlight가 hast 단계에서 hljs 클래스를 부여하므로 그대로 반환
      return <code className={className} {...props}>{children}</code>
    },
    }
  }, [content, resolveRelativePath, onDocNavigate, isSshContext, workspaceId])

  return (
    <div className="markdown-viewer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[
          rehypeHighlight,
          [rehypeSanitize, sanitizeSchema],
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// props(content/basePath/onDocNavigate/onHeadings)가 같으면 렌더 skip.
// find-in-page 결과 수신 등 부모 state 변경으로 인한 불필요한 full re-parse를 차단한다.
export const MarkdownViewer = memo(MarkdownViewerInner)
