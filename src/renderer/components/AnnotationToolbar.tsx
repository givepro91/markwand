import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { AnnotationToolbarState } from '../hooks/useAnnotations'

interface AnnotationToolbarProps {
  state: AnnotationToolbarState
  disabled: boolean
  onHighlight: () => void
  onRemove: () => void
  onDismiss: () => void
}

const TOOLBAR_GAP_PX = 8

/**
 * v0.4 S7 — 텍스트 선택 또는 annotation 클릭 시 뜨는 floating toolbar.
 * fixed positioning + viewport clamp. SSH workspace 면 disabled tooltip.
 * 출현 시 첫 버튼에 focus → 키보드 사용자 도달 보장 (Evaluator M-3).
 */
export function AnnotationToolbar({
  state,
  disabled,
  onHighlight,
  onRemove,
  onDismiss,
}: AnnotationToolbarProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [layout, setLayout] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!state.visible || !state.rect) {
      setLayout(null)
      return
    }
    const el = ref.current
    if (!el) return
    const tw = el.offsetWidth || 120
    const th = el.offsetHeight || 36
    let top = state.rect.top - th - TOOLBAR_GAP_PX
    if (top < 4) top = state.rect.bottom + TOOLBAR_GAP_PX
    let left = state.rect.left + state.rect.width / 2 - tw / 2
    const maxLeft = window.innerWidth - tw - 8
    if (left < 8) left = 8
    if (left > maxLeft) left = maxLeft
    setLayout({ left, top })
  }, [state.visible, state.rect])

  // 출현 시 button 에 focus — 키보드 사용자 도달 (Tab 문서 전체 순회 필요 없음).
  // selection 은 button.focus({preventScroll: true}) 로도 유지된다 (focus 이벤트는 selection collapse 안 시킴).
  useEffect(() => {
    if (state.visible && !disabled && layout && buttonRef.current) {
      try {
        buttonRef.current.focus({ preventScroll: true })
      } catch {
        // jsdom 등에서 preventScroll 미지원 시 일반 focus.
        buttonRef.current.focus()
      }
    }
  }, [state.visible, disabled, layout])

  if (!state.visible || !state.mode) return null

  const isCreate = state.mode === 'create'
  const onClick = isCreate ? onHighlight : onRemove
  const label = disabled
    ? t('annotation.disabledTooltip')
    : isCreate
    ? t('annotation.highlight')
    : t('annotation.remove')
  const icon = isCreate ? '🖍' : '✕'
  const ariaLabel = disabled
    ? t('annotation.disabledTooltip')
    : isCreate
    ? t('annotation.highlightAria')
    : t('annotation.removeAria')

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={t('annotation.toolbarLabel')}
      data-annotation-toolbar=""
      style={{
        position: 'fixed',
        left: layout?.left ?? -9999,
        top: layout?.top ?? -9999,
        zIndex: 50,
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        boxShadow: 'var(--shadow-md)',
        padding: 'var(--sp-1)',
        display: 'inline-flex',
        gap: 'var(--sp-1)',
        opacity: layout ? 1 : 0,
        transition: 'opacity 80ms var(--ease-standard, ease-out)',
        pointerEvents: layout ? 'auto' : 'none',
      }}
      onMouseDown={(e) => {
        // toolbar 자체 mousedown 은 root mousedown 으로 전파 안 시킴 — root 핸들러가 toolbar hide 하지 않도록.
        // Electron/React 조합에서 preventDefault() 는 실제 click 액션을 끊을 수 있다.
        e.stopPropagation()
      }}
      onClick={(e) => e.stopPropagation() /* root.click 의 caretRangeFromPoint hit 검사 우회 */}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onDismiss()
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        disabled={disabled}
        aria-disabled={disabled}
        title={label}
        aria-label={ariaLabel}
        style={{
          background: disabled ? 'transparent' : 'var(--bg-elev)',
          border: '1px solid transparent',
          borderRadius: 'var(--r-sm)',
          padding: '4px 8px',
          fontSize: 'var(--fs-sm)',
          color: disabled ? 'var(--text-muted)' : 'var(--text)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          minHeight: 28,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--sp-1)',
        }}
      >
        <span aria-hidden>{icon}</span>
        <span>{label}</span>
      </button>
    </div>
  )
}
