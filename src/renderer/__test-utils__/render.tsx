import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

interface ProviderProps {
  children: ReactNode
  theme?: 'light' | 'dark'
}

/**
 * i18n / 테마 컨텍스트를 감싼 렌더 헬퍼.
 * react-i18next 는 setup 에서 vi.mock 으로 key identity 반환.
 * 테마 토글이 필요한 테스트는 document.documentElement.dataset.theme 를 직접 조작.
 */
function AllProviders({ children, theme = 'light' }: ProviderProps) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
  }
  return <>{children}</>
}

export function renderWithProviders(
  ui: ReactElement,
  { theme, ...options }: RenderOptions & { theme?: 'light' | 'dark' } = {},
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => <AllProviders theme={theme}>{children}</AllProviders>,
    ...options,
  })
}

// RTL 의 screen/fireEvent/waitFor 등 재노출.
// userEvent 는 별도 패키지의 default export 이므로 RTL re-export 와 구분.
export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
