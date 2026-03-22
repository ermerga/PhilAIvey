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
| Cache | Redis | Equity calc cache, active session state |
| Database | PostgreSQL | User profiles, hand history, session stats |
| Containerization | Docker + Docker Compose | Local dev and deployment orchestration |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Docker Compose                      │
│                                                      │
│  ┌──────────────┐        ┌──────────────────────┐   │
│  │ React/nginx  │◄──────►│   FastAPI Backend     │   │
│  │  (port 3000) │  WS +  │     (port 8000)       │   │
│  └──────────────┘  REST  │                       │   │
│                          │  ├── GameManager       │   │
│                          │  ├── AIPlayerAgent     │   │
│                          │  ├── HandEvaluator     │   │
│                          │  ├── CoachingEngine    │   │
│                          │  └── PhilTutor         │   │
│                          └──────┬──────┬──────────┘   │
│                                 │      │              │
│                    ┌────────────┘      └──────────┐  │
│                    ▼                              ▼  │
│            ┌──────────────┐           ┌────────────┐ │
│            │  PostgreSQL   │           │   Redis    │ │
│            │  (port 5432)  │           │ (port 6379)│ │
│            └──────────────┘           └────────────┘ │
└─────────────────────────────────────────────────────┘
                          │
                          ▼ (external)
                    Claude API & other Ai's
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
- **Outs count** — number of cards that improve the hand (used to teach Rule of 2 and 4)
- **Equity estimate (internal only)** — Monte Carlo simulation used by Phil and the Coaching Engine for accurate grading; never shown raw to the user
- **Pot odds** — required call / (required call + pot)
- **Expected value** — rough EV given internal equity vs pot odds

#### Equity Philosophy
Monte Carlo runs **internally** only. The user-facing layer teaches estimation, not consumption:
- **Rule of 2 and 4** — Phil walks the user through counting outs and applying the multiplier
- The true equity is used by Phil to verify whether the user's estimate and decision were correct
- After the user acts, Phil reveals the actual equity as a teaching moment ("Your estimate was close — the real number was 34%")

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
After every **user decision**, the coaching panel shows (content filtered by skill level):

| | Beginner | Intermediate | Advanced |
|---|---|---|---|
| Hand category | ✅ shown | ✅ shown | ✅ shown |
| Outs count | ✅ shown | ✅ shown | ✅ shown |
| Rule of 2&4 walkthrough | ✅ Phil explains | User prompted to calculate | Not shown — assumed known |
| True equity (post-decision) | ✅ revealed after | ✅ revealed after | ✅ revealed after |
| Pot odds | simplified ratio | exact % | exact % + EV |
| Opponent ranges | not shown | basic range labels | full range breakdown |
| Decision grade | ✅ | ✅ | ✅ |
| Phil's explanation | plain language | guided questions | peer-level critique |

### 6. Phil Ivey AI Tutor (`PhilTutor`)
Every time it is the **user's turn to act**, an AI Phil Ivey avatar pops up and offers proactive coaching advice — before the user makes their decision. The depth and vocabulary of the advice scales with the selected skill level, but **Phil is always a full conversational coach at every level**. The user can ask Phil any question at any point ("why would I fold here?", "what does pot odds mean?", "is this a bluff?") and Phil responds in full context of the current hand.

#### Skill Levels

| Level | What Phil Teaches | How Phil Teaches It |
|---|---|---|
| **Beginner** | Hand strength categories, basic position, simple pot odds as ratios ("you need to call $10 to win $30 — that's 3-to-1"), introduction to outs | Direct and concrete. Phil names the hand, says whether it's strong or weak, and explains what he'd do. Invites questions freely. No numbers shown until after the decision. |
| **Intermediate** | Rule of 2 and 4 (Phil walks through outs counting), pot odds as %, basic opponent reads, continuation bets, position leverage | Phil prompts the user to estimate before acting: "You have a flush draw — how many outs do you have? Multiply by 4. What do you get?" Reveals true equity after the decision and compares to their estimate. |
| **Advanced** | Range vs. range equity estimation, GTO vs. exploitative adjustments, SPR, meta-game, table image | Phil treats the user as a peer. No handholding — challenges their reasoning: "What range are you putting them on and why? Is a call better than a raise here given their stack?" True equity revealed post-decision for calibration. |

#### Behavior
- Phil's opening advice fires automatically when `current_actor == human_player`
- The tutor response streams in via WebSocket (typewriter effect) so it feels live
- After the user acts, Phil briefly grades the decision and explains why
- The user can type any question into a chat input — Phil responds with full hand context
- Conversation history is kept per hand so Phil can reference earlier in the conversation
- The user can toggle Phil on/off or mute him entirely

#### Phil Tutor Prompt Structure

```
System: You are Phil Ivey, one of the greatest poker players of all time.
        You are coaching a {skill_level} player. Speak in Phil's calm,
        confident, precise voice.

        Skill level rules:
        - beginner: use plain language only. Define every poker term you use.
          Be direct and concrete. Always be willing to explain further if asked.
          Default opener: tell them what their hand is, whether it's strong or
          weak, and what you'd generally do — then invite questions.
        - intermediate: introduce pot odds, equity, opponent reads.
          Use guiding questions to develop their thinking. Define terms briefly.
          Be ready to go deeper on any concept if they ask.
        - advanced: range vs. range, SPR, GTO vs. exploitative. Treat the player
          as a peer. Challenge their reasoning. Go as deep as they want.

        At ALL levels: the user may ask you any question about the hand or
        poker in general. Answer fully and in context of the current hand.
        Keep unprompted advice to 3–5 sentences. Expand freely when asked.

User:   === It's Your Turn ===
        Your cards: {hole_cards}
        Board: {community_cards} ({street})
        Hand strength: {rank} ({category}) — top {percentile}% of hands
        Equity vs. likely ranges: {equity}%
        Pot: {pot} | To call: {amount} | Pot odds: {pot_odds}%
        Your stack: {stack} | Position: {position}
        Players remaining: {active_players}

        === What You've Observed ===
        {opponent_tendency_summary}   ← filtered by skill level

        === Action History This Hand ===
        {hand_action_log}

        === Conversation So Far ===
        {chat_history}

        {user_message}   ← either "opening" (auto-fire) or user's question
```

---

## Data & Storage

### PostgreSQL — Persistent Data
```
users
  id, username, skill_level, created_at

sessions
  id, user_id, started_at, ended_at, num_opponents, starting_stack

hands
  id, session_id, hand_number, community_cards, pot, winners[], started_at

actions
  id, hand_id, player_id, action_type (fold/call/raise), amount, street, timestamp

player_session_stats
  id, session_id, player_id, is_human, play_style,
  vpip, pfr, total_hands, hands_won, net_chips

tutor_conversations
  id, hand_id, skill_level, messages[] (role + content), created_at
```

### Redis — Ephemeral / Fast Access
```
game:{session_id}:state     → full GameSession JSON (active hand state)
game:{session_id}:players   → player stack/action cache for quick reads
equity:{hand_key}           → cached Monte Carlo equity result (TTL: 1 hour)
                              key = sorted(hole_cards) + sorted(community_cards)
tutor:{session_id}:chat     → current hand's Phil conversation buffer
                              (flushed to PostgreSQL on hand end)
```

### In-Memory (PyPokerEngine)
Active game logic lives in the FastAPI process during a hand. Redis is the source of truth for state shared across requests or WebSocket connections.

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
| POST | `/game/{id}/tutor/chat` | Send a message to Phil Ivey tutor, get response |
| GET | `/game/{id}/tutor/history` | Get Phil tutor conversation history for current hand |

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

### Phil Ivey Tutor Panel
- Phil avatar appears when it is the user's turn
- Advice streams in with typewriter effect
- Chat input below Phil's message — user can type any question
- Full conversation scrollable within the panel
- Toggle button to show/hide Phil
- Skill level badge (Beginner / Intermediate / Advanced) with option to change between hands

### Coaching Panel (sidebar)
- Hand strength meter
- Equity % vs. estimated opponent ranges
- Pot odds indicator (are you getting the right price?)
- Decision grade after each action (shown after user acts)
- Running session stats (VPIP, PFR, win rate)

### Opponent Dossier
- Per-opponent stats observed so far: VPIP, aggression frequency, showdown tendencies
- Builds up over the session — user must learn by watching
- Beginner view: simplified labels ("plays a lot of hands", "bets big when strong")
- Intermediate/Advanced view: raw stats (VPIP %, PFR %, AF)

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
- [ ] Set up project directory structure (backend / frontend / docker)
- [ ] Write `docker-compose.yml` with FastAPI, React/nginx, PostgreSQL, Redis
- [ ] Set up FastAPI app with SQLAlchemy models + Alembic migrations
- [ ] Connect Redis client for session state
- [ ] Integrate PyPokerEngine, wrap in `GameManager`
- [ ] Implement `HandEvaluator` with treys + Redis equity cache
- [ ] Basic WebSocket game state streaming
- [ ] Stub AI players that act randomly

### Phase 2 — Phil Ivey AI Tutor
- [ ] `PhilTutor` service with Claude API integration
- [ ] Skill level selector (Beginner / Intermediate / Advanced) stored per user session
- [ ] Auto-fire opening advice when it becomes the user's turn
- [ ] Conversational chat input — user can ask Phil any question mid-hand
- [ ] Per-hand conversation history so Phil can reference earlier exchanges
- [ ] Post-decision grade + explanation streamed back via WebSocket
- [ ] Tutor on/off toggle in UI
- [ ] Opponent tendency summary filtered by skill level (beginners see simplified reads)

### Phase 3 — AI Opponents
- [ ] Claude API integration for AI player decisions
- [ ] Play style persona system + randomized assignment per game
- [ ] Action history tracking per player
- [ ] Prompt construction with full context payload

### Phase 4 — Coaching Engine
- [ ] Equity calculator (Monte Carlo vs. estimated ranges)
- [ ] Pot odds & EV analysis
- [ ] Decision grading logic
- [ ] Coaching API endpoint

### Phase 5 — React Frontend
- [ ] Table UI with player seats
- [ ] WebSocket connection + state rendering
- [ ] Action controls (fold/call/raise)
- [ ] Phil Ivey avatar panel with streaming typewriter response
- [ ] Chat input for user questions to Phil
- [ ] Coaching sidebar (post-decision analysis)
- [ ] Opponent dossier panel
- [ ] Skill level selector on game start

### Phase 6 — Polish
- [ ] Session statistics tracking (VPIP, PFR, win rate)
- [ ] Play style "tell" badges (revealed over time by observation)
- [ ] Multiple game modes (cash game / tournament)
- [ ] Hand history replay
- [ ] Phil Ivey voice/personality flavor (signature phrases, calm demeanor)

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
asyncpg          # async PostgreSQL driver
redis[asyncio]   # async Redis client
sqlalchemy       # ORM for PostgreSQL models
alembic          # DB migrations

# Frontend
react
react-dom
typescript
tailwindcss

# Infrastructure
docker
docker-compose
postgres:16      # Docker image
redis:7-alpine   # Docker image
nginx:alpine     # Docker image (serves React build)
```

---

## Docker Compose Services

```yaml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: .env
    depends_on: [postgres, redis]

  frontend:
    build: ./frontend        # React build served via nginx
    ports: ["3000:80"]
    depends_on: [backend]

  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: philaivey
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}

  redis:
    image: redis:7-alpine
    volumes: [redisdata:/data]

volumes:
  pgdata:
  redisdata:
```

### Environment Variables (`.env`)
```
ANTHROPIC_API_KEY=...
POSTGRES_USER=...
POSTGRES_PASSWORD=...
POSTGRES_HOST=postgres
REDIS_URL=redis://redis:6379
```

---

## Open Questions

1. **AI response latency** — Claude API calls happen sequentially per AI action. May need async batching or timeouts to keep the game snappy.
2. **Equity calculation speed** — Full Monte Carlo can be slow. Consider caching or limiting simulations (e.g., 1,000 samples).
3. **Opponent range modeling** — How sophisticated should villain range estimates be? Start with position-based priors, refine with observed actions.
4. **Session persistence** — Store hand history to DB (SQLite/Postgres) for post-session review?
