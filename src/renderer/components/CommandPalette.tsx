import { useEffect, useRef, useState, useCallback, useId } from 'react'
import { useAppStore } from '../state/store'
import { useGlobalHotkey } from '../hooks/useGlobalHotkey'

// Search API result shape (task 2 contract)
interface SearchResult {
  path: string
  projectId: string
  title: string
  snippet: string
  score: number
}

// Type extension for window.api.search (implemented by task 2 backend)
type ApiWithSearch = typeof window.api & {
  search: {
    query: (params: { query: string; limit: number }) => Promise<{ results: SearchResult[] }>
  }
}

type PaletteState = 'empty' | 'loading' | 'no-results' | 'results'

// Inject CSS once for hover/animation/pseudo styles that cannot be expressed inline
const CMD_STYLES = `
.cmd-palette {
  animation: cmd-enter var(--duration-normal, 150ms) var(--ease-standard, cubic-bezier(0.4,0,0.2,1));
}
@keyframes cmd-enter {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.cmd-input::placeholder { color: var(--text-muted); }
.cmd-clear-btn:hover { background: var(--border) !important; color: var(--text) !important; }
.cmd-clear-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cmd-result-item:hover,
.cmd-result-item[aria-selected="true"] { background: var(--bg-hover) !important; }
.cmd-result-item[aria-selected="true"] { box-shadow: inset 3px 0 0 var(--accent); }
.cmd-result-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.cmd-results::-webkit-scrollbar { width: 4px; }
.cmd-results::-webkit-scrollbar-track { background: transparent; }
.cmd-results::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }
@keyframes cmd-spin { to { transform: rotate(360deg); } }
.cmd-spinner { animation: cmd-spin 600ms linear infinite; }
[data-theme="dark"] .cmd-backdrop { background: rgba(0,0,0,0.6) !important; }
@media (prefers-reduced-motion: reduce) {
  .cmd-palette { animation: none; }
  .cmd-result-item { transition: none !important; }
  .cmd-spinner { animation: none; }
}
`

let styleInjected = false
function ensureStyles() {
  if (styleInjected || document.getElementById('cmd-palette-styles')) return
  styleInjected = true
  const el = document.createElement('style')
  el.id = 'cmd-palette-styles'
  el.textContent = CMD_STYLES
  document.head.appendChild(el)
}

// SVG search icon (inline to avoid external deps)
function SearchIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export function CommandPalette() {
  const isOpen = useAppStore((s) => s.commandPaletteOpen)
  const openCommandPalette = useAppStore((s) => s.openCommandPalette)
  const closeCommandPalette = useAppStore((s) => s.closeCommandPalette)
  const openDoc = useAppStore((s) => s.openDoc)
  const projects = useAppStore((s) => s.projects)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const paletteRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)
  const listboxId = useId()

  // Inject CSS on first render
  useEffect(() => { ensureStyles() }, [])

  // ⌘K global toggle
  const handleToggle = useCallback(() => {
    if (isOpen) {
      closeCommandPalette()
    } else {
      triggerRef.current = document.activeElement
      openCommandPalette()
    }
  }, [isOpen, openCommandPalette, closeCommandPalette])
  useGlobalHotkey('k', handleToggle, { meta: true })

  // Focus input on open; restore focus + reset state on close
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    } else {
      setQuery('')
      setResults([])
      setActiveIndex(0)
      setLoading(false)
      const el = triggerRef.current
      if (el instanceof HTMLElement) el.focus()
    }
  }, [isOpen])

  // Debounced search — 150ms per task spec
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const api = window.api as ApiWithSearch
        const res = await api.search.query({ query: query.trim(), limit: 20 })
        setResults(res.results)
        setActiveIndex(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 150)
    return () => clearTimeout(t)
  }, [query])

  // Keyboard navigation: Esc / ↑↓ / Enter
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        // Esc with query → clear first; Esc on empty → close
        if (query) {
          setQuery('')
        } else {
          closeCommandPalette()
        }
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (results.length > 0 ? (i + 1) % results.length : i))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) =>
          results.length > 0 ? (i - 1 + results.length) % results.length : i
        )
        return
      }
      if (e.key === 'Enter') {
        const item = results[activeIndex]
        if (item) openDoc(item.projectId, item.path)
        return
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [isOpen, query, results, activeIndex, openDoc, closeCommandPalette])

  // Focus trap: Tab / Shift+Tab cycles within palette
  useEffect(() => {
    if (!isOpen) return
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const el = paletteRef.current
      if (!el) return
      const focusable = el.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    window.addEventListener('keydown', onTab, true)
    return () => window.removeEventListener('keydown', onTab, true)
  }, [isOpen])

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[activeIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!isOpen) return null

  const paletteState: PaletteState = !query.trim()
    ? 'empty'
    : loading
      ? 'loading'
      : results.length === 0
        ? 'no-results'
        : 'results'

  const activeItemId = results.length > 0 ? `cmd-item-${activeIndex}` : undefined

  const getProjectName = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.name ?? projectId

  return (
    <div
      className="cmd-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="문서 검색"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeCommandPalette()
      }}
    >
      <div
        ref={paletteRef}
        className="cmd-palette"
        style={{
          width: '640px',
          maxHeight: '560px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-3)',
            padding: '0 var(--sp-4)',
            height: '52px',
            flexShrink: 0,
            borderBottom: '1px solid var(--border-muted)',
          }}
        >
          <SearchIcon style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="cmd-input"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={results.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={activeItemId}
            placeholder="문서 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 'var(--fs-lg)',
              fontFamily: 'inherit',
              color: 'var(--text)',
              lineHeight: 'var(--lh-tight)',
            }}
          />
          {query && (
            <button
              className="cmd-clear-btn"
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              aria-label="검색어 지우기"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                border: 'none',
                background: 'var(--bg-hover)',
                borderRadius: 'var(--r-pill)',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: 'var(--fs-sm)',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Results / state area */}
        <div
          className="cmd-results"
          style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}
        >
          {paletteState === 'empty' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--sp-2)',
                padding: 'var(--sp-10) var(--sp-6)',
                color: 'var(--text-muted)',
                fontSize: 'var(--fs-sm)',
                textAlign: 'center',
              }}
            >
              <SearchIcon style={{ width: '32px', height: '32px', opacity: 0.4 } as React.CSSProperties} />
              <span style={{ fontWeight: 'var(--fw-medium)' }}>최근 문서가 여기에 표시됩니다</span>
              <span style={{ fontSize: 'var(--fs-xs)', opacity: 0.7 }}>⌘K로 언제든 열 수 있어요</span>
            </div>
          )}

          {paletteState === 'loading' && (
            <div
              role="status"
              aria-label="검색 중"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--sp-2)',
                padding: 'var(--sp-10) var(--sp-6)',
                color: 'var(--text-muted)',
                fontSize: 'var(--fs-sm)',
                textAlign: 'center',
              }}
            >
              <div
                className="cmd-spinner"
                style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  borderRadius: '50%',
                }}
              />
              <span>검색 중...</span>
            </div>
          )}

          {paletteState === 'no-results' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--sp-2)',
                padding: 'var(--sp-10) var(--sp-6)',
                color: 'var(--text-muted)',
                fontSize: 'var(--fs-sm)',
                textAlign: 'center',
              }}
            >
              <SearchIcon style={{ width: '32px', height: '32px', opacity: 0.4 } as React.CSSProperties} />
              <span style={{ fontWeight: 'var(--fw-medium)', color: 'var(--text)' }}>
                &ldquo;{query}&rdquo;에 대한 결과가 없습니다
              </span>
              <span style={{ fontSize: 'var(--fs-xs)', opacity: 0.7 }}>
                다른 단어나 파일 경로를 시도해보세요
              </span>
            </div>
          )}

          {paletteState === 'results' && (
            <>
              {/* Visually hidden live region for screen readers */}
              <div
                role="status"
                aria-live="polite"
                style={{
                  position: 'absolute',
                  width: '1px',
                  height: '1px',
                  overflow: 'hidden',
                  clip: 'rect(0,0,0,0)',
                  whiteSpace: 'nowrap',
                }}
              >
                {results.length}개 결과
              </div>
              <ul
                id={listboxId}
                ref={listRef}
                role="listbox"
                aria-label="검색 결과"
                style={{ listStyle: 'none', padding: 0, margin: 0 }}
              >
                {results.map((item, i) => (
                  <li key={item.path} role="option" aria-selected={i === activeIndex}>
                    <button
                      id={`cmd-item-${i}`}
                      className="cmd-result-item"
                      aria-selected={i === activeIndex}
                      onClick={() => openDoc(item.projectId, item.path)}
                      onMouseEnter={() => setActiveIndex(i)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr',
                        gridTemplateRows: 'auto auto auto',
                        columnGap: 'var(--sp-3)',
                        rowGap: '2px',
                        padding: 'var(--sp-3) var(--sp-4)',
                        minHeight: '60px',
                        cursor: 'pointer',
                        border: 'none',
                        background: 'transparent',
                        width: '100%',
                        textAlign: 'left',
                        transition: 'background var(--duration-fast) var(--ease-standard)',
                      }}
                    >
                      <span
                        style={{
                          gridColumn: 1,
                          gridRow: '1 / span 3',
                          alignSelf: 'center',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '1px var(--sp-2)',
                          background: 'var(--badge-bg)',
                          color: 'var(--badge-text)',
                          borderRadius: 'var(--r-sm)',
                          fontSize: 'var(--fs-xs)',
                          fontWeight: 'var(--fw-medium)',
                          whiteSpace: 'nowrap',
                          maxWidth: '80px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={getProjectName(item.projectId)}
                      >
                        {getProjectName(item.projectId)}
                      </span>
                      <span
                        style={{
                          gridColumn: 2,
                          gridRow: 1,
                          fontSize: 'var(--fs-md)',
                          fontWeight: 'var(--fw-semibold)',
                          color: 'var(--text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.title}
                      </span>
                      <span
                        style={{
                          gridColumn: 2,
                          gridRow: 2,
                          fontSize: 'var(--fs-sm)',
                          color: 'var(--text-muted)',
                          lineHeight: 'var(--lh-normal)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.snippet}
                      </span>
                      <span
                        style={{
                          gridColumn: 2,
                          gridRow: 3,
                          fontSize: 'var(--fs-xs)',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontFamily: "'SF Mono', 'Menlo', monospace",
                        }}
                      >
                        {item.path}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Footer hints */}
        <div
          aria-hidden="true"
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-4)',
            padding: 'var(--sp-2) var(--sp-4)',
            height: '32px',
            borderTop: '1px solid var(--border-muted)',
            background: 'var(--bg-elev)',
          }}
        >
          {[
            { keys: ['↑', '↓'], label: '이동' },
            { keys: ['↵'], label: '열기' },
            { keys: ['Esc'], label: '닫기' },
          ].map(({ keys, label }) => (
            <span
              key={label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--sp-1)',
                fontSize: 'var(--fs-xs)',
                color: 'var(--text-muted)',
              }}
            >
              {keys.map((k) => (
                <kbd
                  key={k}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1px 5px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-sm)',
                    fontSize: 'var(--fs-xs)',
                    fontFamily: 'inherit',
                    color: 'var(--text-muted)',
                    lineHeight: 1,
                  }}
                >
                  {k}
                </kbd>
              ))}
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
