# Testing

## Philosophy

100% test coverage is the key to great vibe coding. Tests let you move fast, trust your instincts, and ship with confidence — without them, vibe coding is just yolo coding. With tests, it's a superpower.

## Frontend (Vitest + Testing Library)

**Framework:** Vitest v4 + @testing-library/react + @testing-library/jest-dom

**Run tests:**
```bash
cd frontend
npm test          # single run
npm run test:watch  # watch mode
```

**Test files:** `frontend/src/__tests__/`

### Layers

| Layer | What to test | Where |
|-------|-------------|-------|
| Unit | Pure logic, type helpers | `src/__tests__/*.test.ts` |
| Component | UI behavior, conditional rendering, user interactions | `src/__tests__/*.test.tsx` |
| Integration | Multi-component flows (game start → action → next hand) | `src/__tests__/*.integration.test.tsx` |

### Conventions

- Test files: `ComponentName.test.tsx` alongside the component's logic
- Use `screen.getByRole` over `getByTestId` — tests should find what users see
- Use `userEvent` over `fireEvent` — simulates real browser events
- Mock `fetch` with `vi.fn()` for API tests; never call the real backend in unit tests

### What to test

- When fixing a bug → write a regression test first
- When adding a conditional (`if`/`else`) → test both branches
- When adding a new component prop → test what changes in the rendered output
- When an interaction triggers a callback → assert it was called with the right args

## Backend (no framework yet)

pytest bootstrap is pending. Run `/qa` and select "Backend (Python/FastAPI) with pytest" to set it up.
