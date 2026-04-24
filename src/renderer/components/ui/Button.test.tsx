import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen, userEvent } from '../../__test-utils__/render'
import { Button } from './Button'

describe('Button (S0 smoke)', () => {
  it('children 을 버튼 텍스트로 렌더한다', () => {
    renderWithProviders(<Button>확인</Button>)
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument()
  })

  it('onClick 을 호출한다', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderWithProviders(<Button onClick={onClick}>클릭</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('disabled 일 때 클릭을 무시한다', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderWithProviders(
      <Button onClick={onClick} disabled>
        비활성
      </Button>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    await user.click(btn).catch(() => {}) // user-event throws on disabled
    expect(onClick).not.toHaveBeenCalled()
  })

  it('sm size 의 height 는 28px (WCAG 2.5.8 터치 타겟)', () => {
    renderWithProviders(<Button size="sm">작음</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toHaveStyle({ height: '28px' })
    expect(btn).toHaveStyle({ minWidth: '28px' })
  })

  it('aria-label 이 전달된다', () => {
    renderWithProviders(<Button aria-label="close dialog">×</Button>)
    expect(screen.getByRole('button', { name: 'close dialog' })).toBeInTheDocument()
  })
})
