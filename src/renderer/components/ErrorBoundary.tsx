import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (err: Error, reset: () => void) => ReactNode
  onError?: (err: Error) => void
  // key 가 바뀌면 boundary state 리셋 — 문서 전환 시 자동 회복
  resetKey?: string | number
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * React Error Boundary.
 * 함수형 컴포넌트로는 구현 불가 (class 필수).
 * 하위 트리에서 throw 되면 fallback UI 로 대체하고, resetKey 변경 시 자동 복구.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error)
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error)
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ error: null })
    }
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset)
      return (
        <div
          role="alert"
          style={{
            padding: 'var(--sp-4)',
            margin: 'var(--sp-4)',
            border: '1px solid var(--color-danger)',
            borderRadius: 'var(--r-md)',
            background: 'var(--color-danger-bg)',
            color: 'var(--color-danger)',
            fontSize: 'var(--fs-sm)',
          }}
        >
          <div style={{ fontWeight: 'var(--fw-semibold)', marginBottom: 'var(--sp-2)' }}>
            이 영역에서 오류가 발생했어요
          </div>
          <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--fs-xs)', marginBottom: 'var(--sp-3)', wordBreak: 'break-word' }}>
            {this.state.error.message}
          </div>
          <button
            type="button"
            onClick={this.reset}
            style={{
              fontSize: 'var(--fs-xs)',
              padding: '4px 10px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--color-danger)',
              background: 'transparent',
              color: 'var(--color-danger)',
              cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
