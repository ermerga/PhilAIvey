import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PhilPanel } from '../components/PhilPanel'
import type { ChatMessage } from '../types'

// Regression: ISSUE-001 — Phil's coaching panel rendered markdown as raw text
// Found by /qa on 2026-05-25
// Report: .gstack/qa-reports/qa-report-localhost-2026-05-25.md

function philMsg(content: string, isStreaming = false): ChatMessage[] {
  return [{ role: 'phil', content, isStreaming }]
}

describe('PhilPanel — markdown rendering', () => {
  const baseProps = {
    sessionId: 'test-session',
    skillLevel: 'beginner',
    isMyTurn: true,
    onUserMessage: vi.fn(),
  }

  it('renders **bold** as formatted text, not raw asterisks', () => {
    render(<PhilPanel {...baseProps} messages={philMsg("**You should be raising.**")} />)
    expect(screen.queryByText('**You should be raising.**')).not.toBeInTheDocument()
    expect(document.querySelector('strong')).toBeInTheDocument()
    expect(document.querySelector('strong')?.textContent).toBe('You should be raising.')
  })

  it('renders *italic* as em element, not raw asterisks', () => {
    render(<PhilPanel {...baseProps} messages={philMsg("You act *last* here.")} />)
    expect(screen.queryByText(/\*last\*/)).not.toBeInTheDocument()
    expect(document.querySelector('em')).toBeInTheDocument()
    expect(document.querySelector('em')?.textContent).toBe('last')
  })

  it('renders --- as a horizontal rule, not literal dashes', () => {
    render(<PhilPanel {...baseProps} messages={philMsg("First point.\n\n---\n\nSecond point.")} />)
    expect(screen.queryByText('---')).not.toBeInTheDocument()
    expect(document.querySelector('hr')).toBeInTheDocument()
  })

  it('renders # heading as an h element, not raw hash', () => {
    render(<PhilPanel {...baseProps} messages={philMsg("# Let's Talk About This Hand")} />)
    expect(screen.queryByText(/^# /)).not.toBeInTheDocument()
    const heading = document.querySelector('h1, h2, h3')
    expect(heading).toBeInTheDocument()
    expect(heading?.textContent).toContain("Let's Talk About This Hand")
  })

  it('shows plain text unchanged when no markdown is present', () => {
    render(<PhilPanel {...baseProps} messages={philMsg("Fold this hand. Save your chips.")} />)
    expect(screen.getByText('Fold this hand. Save your chips.')).toBeInTheDocument()
  })

  it('shows placeholder when messages is empty', () => {
    render(<PhilPanel {...baseProps} messages={[]} />)
    expect(screen.getByText(/phil is sizing up/i)).toBeInTheDocument()
  })

  it('renders user messages as plain text bubbles', () => {
    const messages: ChatMessage[] = [
      { role: 'phil', content: 'What do you think you should do here?' },
      { role: 'user', content: 'I think I should raise.' },
    ]
    render(<PhilPanel {...baseProps} messages={messages} />)
    expect(screen.getByText('I think I should raise.')).toBeInTheDocument()
    expect(screen.getByText('What do you think you should do here?')).toBeInTheDocument()
  })
})
