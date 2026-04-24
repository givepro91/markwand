import { afterEach, vi } from 'vitest'

// Evaluator Major-2 반영: jest-dom matcher 확장은 DOM 환경에서만 실행.
// node 환경 테스트가 setupFiles 를 공유하므로 조건부 dynamic import 로 matcher 오염 방지.
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
  const { cleanup } = await import('@testing-library/react')

  afterEach(() => {
    cleanup()
  })

  // matchMedia polyfill (prefers-color-scheme / prefers-reduced-motion)
  if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
  }

  // ResizeObserver polyfill
  if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
    ;(globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }

  // IntersectionObserver polyfill (mermaid lazy render 에서 사용)
  if (!(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver) {
    ;(globalThis as { IntersectionObserver: unknown }).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    }
  }
}

// i18next 인스턴스 초기화 — 테스트 내에서 `i18next` 가 초기화되어 있어야
// useTranslation / Trans 가 동작한다. 실제 리소스 대신 key identity 반환.
vi.mock('react-i18next', async () => {
  const actual =
    await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        if (options && typeof options === 'object' && 'defaultValue' in options) {
          return String(options.defaultValue)
        }
        return key
      },
      i18n: {
        language: 'ko',
        changeLanguage: async () => {},
      },
    }),
    Trans: ({ children, i18nKey }: { children?: React.ReactNode; i18nKey?: string }) =>
      children ?? i18nKey ?? null,
  }
})
