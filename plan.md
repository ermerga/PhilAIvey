# PhilAIvey — AI Poker Tutor: Implementation Plan

## Overview

A Texas Hold'em poker tutor where the user plays against 1–5 AI opponents, each with a distinct randomized play style. The app surfaces real-time coaching data (hand strength, pot odds, position, opponent tendencies) so the user can learn to read the table.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend | FastAPI | REST + WebSocket API |
| Game Engine | PyPokerEngine | Texas Hold'em game loop, state management |
| Hand Evaluation | `treys` | Fast hand strength scoring (0–7462 rank) |
| AI Decision Layer | Claude API (claude-sonnet-4-6) | LLM-based AI player decisions |
| Frontend | React | Game UI, coaching panel |
| State/Realtime | WebSockets | Push game state to client in real-time |

---

## Architecture

```
React Frontend
    |
    | WebSocket / REST
    v
FastAPI Backend
    ├── GameManager        — orchestrates PyPokerEngine game loop
    ├── AIPlayerAgent      — wraps each AI, calls Claude API with context
    ├── HandEvaluator      — wraps treys, computes hand strength + equity
    └── CoachingEngine     — builds per-decision coaching summary for user
```

---

## Core Components

### 1. Game Engine (`GameManager`)
- Wraps `PyPokerEngine` to manage game sessions
- Tracks: street (preflop/flop/turn/river), pot, community cards, player stacks, action history
- Emits game state via WebSocket after every action
- Supports 2–6 players (1 human + 1–5 AI)

### 2. AI Player Agents (`AIPlayerAgent`)
- Each AI is an instance with a randomly assigned **play style** at game start
- On each decision, the agent is given a rich context prompt and calls the Claude API
- Returns one of: `fold`, `call`, `raise <amount>`

#### Play Styles (randomized per game)
| Style | Description |
|---|---|
| `tight-aggressive (TAG)` | Plays few hands, bets/raises strong holdings |
| `loose-aggressive (LAG)` | Wide hand range, frequent bluffs, high pressure |
| `tight-passive (rock)` | Rarely bluffs, calls with strong hands, folds to aggression |
| `loose-passive (calling station)` | Calls almost everything, rarely raises |
| `maniac` | Extremely aggressive, high variance, unpredictable |
| `GTO-balanced` | Approximates game-theory-optimal mixed strategies |

Styles are shuffled randomly each new game so the user must re-profile opponents.

### 3. Hand Evaluator (`HandEvaluator`)
Uses `treys` to compute:
- **Absolute hand rank** (1 = Royal Flush, 7462 = worst)
- **Hand category** (e.g., "Two Pair, Aces and Kings")
- **Equity estimate** — Monte Carlo simulation against range of opponent hands
- **Pot odds** — required call / (required call + pot)
- **Expected value** — rough EV given equity vs pot odds

### 4. AI Context Payload
Every AI decision call includes:

```
- Hole cards (AI's own)
- Community cards + street
- Hand strength rank + category (from treys)
- Equity estimate vs. villain range
- Pot size + main pot / side pots
- Required call amount
- Pot odds
- Stack sizes (all players)
- Position (UTG / MP / CO / BTN / SB / BB)
- Action history this hand (per player)
- Action history summary across session (per player tendencies)
- AI play style persona (system prompt)
- Number of players remaining
```

### 5. Coaching Engine
After every **user decision**, the coaching panel shows:
- Hand strength + equity
- Pot odds vs. equity (was the call +EV?)
- What each AI likely holds (estimated range)
- Whether the user's action was optimal, acceptable, or a mistake
- Brief explanation (1–2 sentences)

---

## Data Models

```python
GameSession
  id, players[], community_cards[], pot, street, current_actor, hand_history[]

Player
  id, name, stack, hole_cards, is_human, play_style, action_history[]

Action
  player_id, action_type (fold/call/raise), amount, street, timestamp

HandResult
  winners[], pot_distributed, showdown_hands[]
```

---

## API Endpoints

### REST
| Method | Path | Description |
|---|---|---|
| POST | `/game/new` | Start new game, randomize AI styles |
| GET | `/game/{id}` | Get current game state |
| POST | `/game/{id}/action` | Submit human player action |
| GET | `/game/{id}/coaching` | Get coaching data for last user decision |
| GET | `/game/{id}/opponents` | Get observable opponent tendency summaries |

### WebSocket
| Path | Description |
|---|---|
| `ws://…/game/{id}/stream` | Push game state updates after every action |

---

## Frontend Views

### Table View
- SVG/Canvas poker table with seat positions
- Community cards + pot display
- Each player: name, stack, last action, play-style "tell" badge (unlocked by observation)
- Action buttons: Fold / Call / Raise (with raise slider)

### Coaching Panel (sidebar)
- Hand strength meter
- Equity % vs. estimated opponent ranges
- Pot odds indicator (are you getting the right price?)
- Decision grade after each action
- Running session stats (VPIP, PFR, win rate)

### Opponent Dossier
- Per-opponent stats observed so far: VPIP, aggression frequency, showdown tendencies
- Builds up over the session — user must learn by watching

---

## AI Persona Prompt Structure

```
System: You are {name}, a {play_style} Texas Hold'em poker player.
        Personality: {description}
        Your goal is to win chips while staying true to your style.

User:   === Current Hand ===
        Your cards: {hole_cards}
        Board: {community_cards} ({street})
        Hand strength: {rank} ({category}) — top {percentile}% of hands
        Equity vs. likely ranges: {equity}%
        Pot: {pot} | To call: {amount} | Pot odds: {pot_odds}%
        Your stack: {stack} | Position: {position}

        === Player Tendencies ===
        {per_player_action_summary}

        === Action History This Hand ===
        {hand_action_log}

        Respond with ONLY one of:
        fold | call | raise <integer amount>
```

---

## Development Phases

### Phase 1 — Core Game Loop
- [ ] Set up FastAPI project structure
- [ ] Integrate PyPokerEngine, wrap in `GameManager`
- [ ] Implement `HandEvaluator` with treys
- [ ] Basic WebSocket game state streaming
- [ ] Stub AI players that act randomly

### Phase 2 — AI Players
- [ ] Claude API integration for AI decisions
- [ ] Play style persona system + randomized assignment
- [ ] Action history tracking per player
- [ ] Prompt construction with full context payload

### Phase 3 — Coaching Engine
- [ ] Equity calculator (Monte Carlo vs. estimated ranges)
- [ ] Pot odds & EV analysis
- [ ] Decision grading logic
- [ ] Coaching API endpoint

### Phase 4 — React Frontend
- [ ] Table UI with player seats
- [ ] WebSocket connection + state rendering
- [ ] Action controls (fold/call/raise)
- [ ] Coaching sidebar
- [ ] Opponent dossier panel

### Phase 5 — Polish
- [ ] Session statistics tracking
- [ ] Play style "tell" badges (revealed over time)
- [ ] Multiple game modes (cash game / tournament)
- [ ] Hand history replay

---

## Key Dependencies

```
# Backend
fastapi
uvicorn
pypokerengine
treys
anthropic
websockets
pydantic

# Frontend
react
react-dom
typescript
tailwindcss
```

---

## Open Questions

1. **AI response latency** — Claude API calls happen sequentially per AI action. May need async batching or timeouts to keep the game snappy.
2. **Equity calculation speed** — Full Monte Carlo can be slow. Consider caching or limiting simulations (e.g., 1,000 samples).
3. **Opponent range modeling** — How sophisticated should villain range estimates be? Start with position-based priors, refine with observed actions.
4. **Session persistence** — Store hand history to DB (SQLite/Postgres) for post-session review?
