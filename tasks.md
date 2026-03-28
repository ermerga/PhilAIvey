# PhilAIvey — Task Tracker

## In Progress

---

## Up Next

### UI: Active player indicator
Show clearly which player's turn it is. The yellow "Acting" badge exists but the current seat highlight needs to be more visible — especially so the user always knows who is thinking.

### UI: Last action display
After a player acts (fold/call/raise), show what they did next to their name (e.g. "Called 20", "Raised to 60", "Folded") until the next street or hand starts. This lets the user follow the action without guessing.

### UI: Showdown — reveal cards
When a hand ends at showdown (multiple players still in), flip all remaining players' hole cards face-up so the user can see the winning hand and why it won.

### UI: Fold equity — show or muck
When a hand ends because everyone else folded, the winner (AI or human) should decide whether to show their cards. AI opponents: randomize with a weighted chance (e.g. 30% show, 70% muck). Human winner: prompt with a "Show" / "Muck" button.

### UI: Dealer button + position labels
Show a dealer button (D) on the table so the user always knows where the button is. Label each seat with their position (BTN, SB, BB, UTG, MP, CO). The user's own position should be highlighted so they immediately know where they sit in the hand.

### UI: Deal animation
When a new hand starts, animate cards being dealt one at a time around the table before revealing hole cards. This makes the hand start feel more intentional and gives the user a clear "the hand is starting now" moment instead of cards just appearing.

### UI: Hand start clarity
Make it obvious when a new hand begins — clear previous action labels, briefly show the blinds being posted (e.g. "SB posts 10", "BB posts 20"), and ensure the user knows it's their turn before Phil fires advice.

---

## Completed

- [x] Phase 1 — Core game loop (PyPokerEngine, REST API, WebSocket, basic React UI)
- [x] Phase 1 — AI thinking delay (3s pause, "Thinking..." badge in UI)
- [x] Phase 2 — Phil Ivey AI Tutor (streaming Claude responses, chat input, skill levels)
- [x] Phase 2 bug fix — Phil race condition (moved trigger to WebSocket handler)
