import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActionBar } from '../components/ActionBar'
import type { ValidAction } from '../types'

const foldAction: ValidAction = { action: 'fold', amount: 0 }
const checkAction: ValidAction = { action: 'call', amount: 0 }
const callAction: ValidAction = { action: 'call', amount: 50 }
const raiseAction: ValidAction = { action: 'raise', amount: { min: 20, max: 200 } }

describe('ActionBar', () => {
  it('shows waiting message when it is not the human turn', () => {
    render(
      <ActionBar validActions={[foldAction, callAction]} isMyTurn={false} onAction={vi.fn()} />
    )
    expect(screen.getByText(/waiting for opponents/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows "Check" instead of "Call 0" when the call amount is zero', () => {
    render(
      <ActionBar validActions={[foldAction, checkAction]} isMyTurn={true} onAction={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: /check/i })).toBeInTheDocument()
    expect(screen.queryByText(/call 0/i)).not.toBeInTheDocument()
  })

  it('shows "Call N" with the correct amount when calling costs chips', () => {
    render(
      <ActionBar validActions={[foldAction, callAction]} isMyTurn={true} onAction={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: /call 50/i })).toBeInTheDocument()
  })

  it('calls onAction with "fold" and 0 when fold button is clicked', async () => {
    const onAction = vi.fn()
    render(
      <ActionBar validActions={[foldAction, callAction]} isMyTurn={true} onAction={onAction} />
    )
    await userEvent.click(screen.getByRole('button', { name: /fold/i }))
    expect(onAction).toHaveBeenCalledWith('fold', 0)
  })

  it('calls onAction with "call" and the correct amount when call is clicked', async () => {
    const onAction = vi.fn()
    render(
      <ActionBar validActions={[foldAction, callAction]} isMyTurn={true} onAction={onAction} />
    )
    await userEvent.click(screen.getByRole('button', { name: /call 50/i }))
    expect(onAction).toHaveBeenCalledWith('call', 50)
  })

  it('shows raise button with min amount when raise action is available', () => {
    render(
      <ActionBar validActions={[foldAction, callAction, raiseAction]} isMyTurn={true} onAction={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: /raise 20/i })).toBeInTheDocument()
    expect(screen.getByRole('slider')).toBeInTheDocument()
  })

  it('does not show raise controls when no raise action is provided', () => {
    render(
      <ActionBar validActions={[foldAction, callAction]} isMyTurn={true} onAction={vi.fn()} />
    )
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })
})
