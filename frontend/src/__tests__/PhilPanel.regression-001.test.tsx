import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PhilPanel } from '../components/PhilPanel'

// Regression: ISSUE-001 — Phil's coaching panel rendered markdown as raw text
// Found by /qa on 2026-05-25
// Report: .gstack/qa-reports/qa-report-localhost-2026-05-25.md

describe('PhilPanel — markdown rendering', () => {
  const baseProps = {
    sessionId: 'test-session',
    skillLevel: 'beginner',
    isStreaming: false,
    isMyTurn: true,
  }

  it('renders **bold** as formatted text, not raw asterisks', () => {
    render(<PhilPanel {...baseProps} philText="**You should be raising.**" />)
    // The text content should be the inner text without asterisks
    expect(screen.queryByText('**You should be raising.**')).not.toBeInTheDocument()
    expect(document.querySelector('strong')).toBeInTheDocument()
    expect(document.querySelector('strong')?.textContent).toBe('You should be raising.')
  })

  it('renders *italic* as em element, not raw asterisks', () => {
    render(<PhilPanel {...baseProps} philText="You act *last* here." />)
    expect(screen.queryByText(/\*last\*/)).not.toBeInTheDocument()
    expect(document.querySelector('em')).toBeInTheDocument()
    expect(document.querySelector('em')?.textContent).toBe('last')
  })

  it('renders --- as a horizontal rule, not literal dashes', () => {
    render(<PhilPanel {...baseProps} philText={"First point.\n\n---\n\nSecond point."} />)
    expect(screen.queryByText('---')).not.toBeInTheDocument()
    expect(document.querySelector('hr')).toBeInTheDocument()
  })

  it('renders # heading as an h element, not raw hash', () => {
    render(<PhilPanel {...baseProps} philText="# Let's Talk About This Hand" />)
    expect(screen.queryByText(/^# /)).not.toBeInTheDocument()
    const heading = document.querySelector('h1, h2, h3')
    expect(heading).toBeInTheDocument()
    expect(heading?.textContent).toContain("Let's Talk About This Hand")
  })

  it('shows plain text unchanged when no markdown is present', () => {
    render(<PhilPanel {...baseProps} philText="Fold this hand. Save your chips." />)
    expect(screen.getByText('Fold this hand. Save your chips.')).toBeInTheDocument()
  })

  it('shows placeholder when philText is empty', () => {
    render(<PhilPanel {...baseProps} philText="" />)
    expect(screen.getByText(/phil is sizing up/i)).toBeInTheDocument()
  })
})
