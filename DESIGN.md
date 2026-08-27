# Design System — PhilAIvey

> Read this before making any visual or UI decision. All fonts, colors, spacing,
> motion, and aesthetic direction are defined here. Do not deviate without
> explicit user approval. In QA, flag any code that does not match this file.

## Product Context

- **What this is:** A Texas Hold'em poker tutor. The user plays against 1–5 AI
  opponents while an AI coach ("Phil") advises in real time, scaling advice to
  beginner / intermediate / advanced.
- **Who it's for:** People learning poker who want to understand *why* a decision
  is right, not just be told the answer.
- **Space / peers:** Poker-training software (GTO Wizard, PokerSnowie, Advanced
  Poker Training) crossed with real-money poker clients (PokerStars, GGPoker)
  whose table UIs set player expectations. Positioned to look like a product, not
  a class project.
- **Project type:** Real-time web app (React + FastAPI, WebSocket-driven table).

## Aesthetic Direction

- **Direction:** Luxury / Refined with expressive material realism — "card room
  after midnight."
- **Decoration level:** Expressive. Real felt grain, walnut rail with a thin
  brass edge, clay chips with weight, card stock that is not pure white. A soft
  radial vignette centers warm light on the board and lets the table edges fall
  to near-black — that single lighting move does most of the work.
- **Mood:** One poker table under one overhead lamp in a dim, warm room. Calm,
  weighted, atmospheric. Not neon Vegas, not a flat cartoon table, not a bright
  training dashboard. Reference feel: a WSOP feature table, the poker tables in
  *Red Dead Redemption 2*.
- **The one memorable thing:** *"It felt like a real table."* Every decision
  serves this.

## Typography

Three fonts, three jobs. `DM Sans` (previous UI) is fully removed.

- **Display / Hero:** **Fraunces** (optical serif). Headings, "Phil" wordmark,
  street labels in small caps (`FLOP · TURN · RIVER`). Gives the room age and
  class; fits a coach named after a legend. No competitor uses a serif here.
  Use `font-optical-sizing: auto`.
- **Body / UI / labels / Phil's coaching prose:** **Instrument Sans** (humanist
  sans). Reads clean at small sizes, unfussy.
- **Data / numbers:** **Geist Mono** with **tabular figures**
  (`font-variant-numeric: tabular-nums`). Every changing number — stack sizes,
  pot, bet amounts, to-call, pot odds, equity. Numbers must not jitter as they
  tick.
- **Code:** none needed in the product UI.
- **Loading:** Google Fonts.
  `https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Instrument+Sans:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap`
- **Scale (px):** 11 · 12 · 13 · 14 (body) · 15 · 17 · 20 · 26 · 40 · 62.
  - Body default 14–15px. Muted metadata 12–13px. Uppercase micro-labels 9–11px
    with `letter-spacing: 0.14–0.22em`.
  - Display: section headings 26px, hero 40–62px, `letter-spacing: -0.01em`.

## Color

Single dark theme. Mostly neutrals and one green, with one warm accent. There is
**no light mode** — a light-mode poker room is incoherent; hold AA+ contrast
instead.

- **Approach:** Restrained + material. Brass is the *only* accent and is spent on
  exactly three things: the acting-player lamp glow, the dealer button, and
  Phil's panel. Never on the pot, the winner, the wordmark, or generic emphasis.

### Room & felt
| Token | Hex | Usage |
|---|---|---|
| `--room` | `#0B0A09` | app background (warm near-black, not blue-black) |
| `--room-2` | `#14110E` | vignette inner, raised backdrop |
| `--felt-lit` | `#2C6B4F` | felt gradient center (lit) |
| `--felt-mid` | `#1E4D3A` | felt gradient middle |
| `--felt-rim` | `#0E2B20` | felt gradient outer (shadowed) |
| `--walnut-hi` | `#2A1D16` | rail / wood chrome, lighter |
| `--walnut-lo` | `#160E0A` | rail / wood chrome, darker |
| `--brass` | `#C8963E` | **the accent** — active glow, dealer button, Phil |
| `--brass-dim` | `#8A6A34` | brass edge line, slider fill, hairlines |

### Surfaces & text
| Token | Hex | Usage |
|---|---|---|
| `--panel` | `#171310` | seat plates, side panels |
| `--panel-hi` | `#211A14` | panel top edge / raised gradient stop |
| `--line` | `#33291F` | borders, dividers |
| `--text` | `#EDE6DA` | primary text (warm off-white) |
| `--muted` | `#9A9186` | secondary text, metadata |
| `--card-stock` | `#F7F4EC` | playing card face (not pure white) |
| `--pip-red` | `#C4362E` | card pips — red suits |
| `--pip-black` | `#1A1613` | card pips — black suits |
| `--rise` | `#5FB98C` | winning a pot / positive money (soft green, never gold) |

### Chips — also the semantic set
| Token | Hex | Chip | Semantic |
|---|---|---|---|
| `--chip-white` | `#E8E4DA` | white | — |
| `--chip-red` | `#B23A34` | red | error / loss |
| `--chip-green` | `#2C6B4F` | green | success |
| `--chip-black` | `#1A1613` | black | — |
| `--chip-blue` | `#2E5A8A` | blue | info |

- **Dark mode:** n/a (single theme).

## Spacing

- **Base unit:** 4px.
- **Density:** Comfortable on panels and the action rail. The table itself is
  composed by geometry (elliptical seat positions from one angle each), not the
  spacing scale.
- **Scale:** `2xs 2 · xs 4 · sm 8 · md 16 · lg 24 · xl 32 · 2xl 48 · 3xl 64`.

## Layout

- **Approach:** Hybrid — the table is a composed *stage*; the flanking panels are
  grid-disciplined.
- **Table:** Oval green felt, centered, with a slight perspective tilt
  (`rotateX(6–8deg)`) so it reads as a table you sit at. Human seat fixed at
  bottom-center. AI seats at true elliptical positions computed from a per-seat
  angle — **not** hardcoded `seat-pos--p1…p5` classes. Community cards + pot dead
  center. Dealer button and SB/BB pucks rest physically on the felt.
- **Chrome:** A dark walnut rail frames the felt with a thin `--brass-dim` edge
  line. Action controls (Fold / Call / Raise + raise slider with
  Min / ½ Pot / Pot / All-In presets) dock into the bottom rail near the human
  seat. Phil's coaching panel flanks the table (right on desktop, stacked below
  on narrow screens).
- **Max content width:** table caps ~760–960px on desktop; panels flank.
- **Border radius:** `sm 4px · md 8px · lg 12px`; chips and pucks are full
  circles. Keep radius restrained — no bubble-radius on everything.

## Motion

- **Approach:** Intentional, physics-flavored. Everything moves like it has mass,
  because real chips and buttons do. Nothing flashes.
- **Signature move:** The dealer button and SB/BB pucks **slide across the felt**
  from last hand's seats to this hand's at the start of every hand — medium
  duration, `ease-in-out`, small settle/overshoot. This is the identity motion
  and it teaches position (you see the button travel toward you).
- **Chips:** toss to the pot on a short arc when a bet is made; the pot slides to
  the winner at showdown.
- **Cards:** deal one at a time from the dealer seat; community cards flip with a
  real card turn.
- **Acting player:** a soft brass lamp-glow blooms and slowly *breathes* under
  the seat (~3.4s loop). No blinking borders.
- **Phil:** advice fades and rises in as it streams — no typewriter effect.
- **Easing:** enter `ease-out` · exit `ease-in` · move `ease-in-out`
  (puck slide adds a tiny overshoot).
- **Duration:** micro 80ms · short 200ms · medium 320ms · long 550ms.

## Safe Choices (poker literacy — do not break)

- Oval felt, seats around the rim, human at bottom-center, board + pot centered.
- Standard chip colors (white/red/green/black/blue) and a red/black 52-card deck
  with normal pip layout.
- Dealer = white "D" disc; SB/BB as labeled pucks.
- fold / call / raise with a slider + pot-fraction presets.

## Deliberate Risks (where PhilAIvey gets its face)

1. Warm near-black room + single-lamp vignette, no light mode.
2. Fraunces optical serif for display + small-caps street labels.
3. Brass as the only accent; pot / winner / money read green or neutral.
4. Real animation budget on the puck-slide as the signature motion.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-27 | Initial design system created | `/design-consultation`. Full UI redesign requested ("don't like it"; want dealer/blind chips on the felt that move with position each hand). Memorable-thing chosen: "it felt like a real table." HTML preview approved as-is (AI mockup generation blocked on OpenAI org verification). |
