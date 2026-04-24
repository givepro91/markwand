import { Component, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (err: Error, reset: () => void) => ReactNode
  onError?: (err: Error) => void
  // key 가 바뀌면 boundary state 리셋 — 문서 전환 시 자동 회복
  resetKey?: string | number
  // i18n 라벨 props — I18nErrorBoundary 래퍼가 주입, 직접 사용 시 선택적
  retryLabel?: string
  restartLabel?: string
  supportLabel?: string
  contentTitle?: string
  contentBody?: string
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

      const {
        retryLabel = '다시 시도',
        restartLabel = '앱 다시 시작',
        supportLabel = '지원',
        contentTitle = '이 영역에서 오류가 발생했어요',
        contentBody,
      } = this.props

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
            {contentTitle}
          </div>
          {contentBody && (
            <div style={{ marginBottom: 'var(--sp-2)', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
              {contentBody}
            </div>
          )}
          <details style={{ marginBottom: 'var(--sp-3)' }}>
            <summary style={{ fontSize: 'var(--fs-xs)', cursor: 'pointer', userSelect: 'none', opacity: 0.7 }}>
              상세 오류
            </summary>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-1)', wordBreak: 'break-word' }}>
              {this.state.error.message}
            </div>
          </details>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
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
              {retryLabel}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
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
              {restartLabel}
            </button>
            <a
              href="https://github.com/givepro91/markwand/issues"
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 'var(--fs-xs)',
                padding: '4px 10px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--color-danger)',
                background: 'transparent',
                color: 'var(--color-danger)',
                cursor: 'pointer',
                textDecoration: 'none',
              }}
            >
              {supportLabel}
            </a>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * ErrorBoundary 함수형 래퍼 — useTranslation 훅으로 라벨을 주입.
 * class 컴포넌트 제약(훅 사용 불가)을 우회하는 패턴.
 */
export function I18nErrorBoundary(props: Omit<ErrorBoundaryProps, 'retryLabel' | 'restartLabel' | 'supportLabel' | 'contentTitle' | 'contentBody'>) {
  const { t } = useTranslation()
  return (
    <ErrorBoundary
      retryLabel={t('errorBoundary.retry')}
      restartLabel={t('errorBoundary.restart')}
      supportLabel={t('errorBoundary.support')}
      contentTitle={t('errorBoundary.title')}
      contentBody={t('errorBoundary.body')}
      {...props}
    />
  )
}
