import { create } from 'zustand'
import { CSSProperties, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  variant: ToastVariant
  message: string
  durationMs?: number
  action?: { label: string; onClick: () => void }
}

interface ToastStore {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
}

let counter = 0

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = `toast-${++counter}-${Date.now()}`
    set((s) => ({ toasts: [...s.toasts, { id, ...toast }] }))
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

// 앱 어디서든 `toast.info(...)` 호출하면 ToastHost가 렌더.
export const toast = {
  success: (message: string, opts?: Omit<Toast, 'id' | 'variant' | 'message'>) =>
    useToastStore.getState().push({ variant: 'success', message, ...opts }),
  error: (message: string, opts?: Omit<Toast, 'id' | 'variant' | 'message'>) =>
    useToastStore.getState().push({ variant: 'error', message, ...opts }),
  info: (message: string, opts?: Omit<Toast, 'id' | 'variant' | 'message'>) =>
    useToastStore.getState().push({ variant: 'info', message, ...opts }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
}

const variantColors: Record<ToastVariant, { bg: string; color: string; border: string }> = {
  success: {
    bg: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    border: 'var(--color-success)',
  },
  error: {
    bg: 'var(--color-danger-bg)',
    color: 'var(--color-danger)',
    border: 'var(--color-danger)',
  },
  info: {
    bg: 'var(--bg-elev)',
    color: 'var(--text)',
    border: 'var(--border)',
  },
}

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { t: tr } = useTranslation()
  const duration = t.durationMs ?? 3500

  useEffect(() => {
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [duration, onDismiss])

  const c = variantColors[t.variant]
  const style: CSSProperties = {
    background: c.bg,
    color: c.color,
    border: `1px solid ${c.border}`,
    borderRadius: 'var(--r-md)',
    padding: 'var(--sp-2) var(--sp-3)',
    boxShadow: 'var(--shadow-md)',
    fontSize: 'var(--fs-sm)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    minWidth: 220,
    maxWidth: 420,
    pointerEvents: 'auto',
    animation: 'toast-in var(--duration-fast) var(--ease-standard)',
  }

  return (
    <div role="status" aria-live="polite" style={style}>
      <span style={{ flex: 1 }}>{t.message}</span>
      {t.action && (
        <button
          onClick={() => {
            t.action?.onClick()
            onDismiss()
          }}
          style={{
            background: 'transparent',
            color: 'inherit',
            border: `1px solid ${c.border}`,
            borderRadius: 'var(--r-sm)',
            padding: '2px 8px',
            fontSize: 'var(--fs-xs)',
            cursor: 'pointer',
            fontWeight: 'var(--fw-medium)',
          }}
        >
          {t.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label={tr('toast.closeAria')}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 'var(--fs-md)',
          lineHeight: 1,
          // v0.4 H5 — WCAG 2.5.8 터치 타겟 28×28px.
          padding: 'var(--sp-1) var(--sp-2)',
          minWidth: '28px',
          minHeight: '28px',
          opacity: 0.6,
        }}
      >
        ×
      </button>
    </div>
  )
}

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  const container: CSSProperties = {
    position: 'fixed',
    right: 'var(--sp-4)',
    bottom: 'var(--sp-4)',
    zIndex: 'var(--z-toast)' as CSSProperties['zIndex'],
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    pointerEvents: 'none',
  }

  return (
    <div style={container}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}
