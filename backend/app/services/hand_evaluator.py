import random
from treys import Card, Evaluator, Deck

RANK_CLASS_TO_CATEGORY = {
    1: "Straight Flush",
    2: "Four of a Kind",
    3: "Full House",
    4: "Flush",
    5: "Straight",
    6: "Three of a Kind",
    7: "Two Pair",
    8: "Pair",
    9: "High Card",
}

# treys rank: 1 = best (Royal Flush), 7462 = worst (7-high)
BEST_RANK = 1
WORST_RANK = 7462


def _to_treys(card_str: str) -> int:
    """Convert a card string like 'Ah' or 'Tc' to a treys int."""
    return Card.new(card_str)


def _remaining_deck(known_cards: list[str]) -> list[int]:
    """Return all 52 cards minus the ones already in play."""
    known = set(_to_treys(c) for c in known_cards)
    full_deck = Deck()
    full_deck.shuffle()
    return [c for c in full_deck.cards if c not in known]


class HandEvaluator:
    def __init__(self) -> None:
        self.evaluator = Evaluator()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def evaluate(self, hole_cards: list[str], community_cards: list[str]) -> dict:
        """
        Evaluate the current hand strength.

        Returns:
            rank       : int  — 1 (Royal Flush) to 7462 (worst). Lower is better.
            rank_class : int  — 1–9 grouping (e.g. 4 = Flush)
            category   : str  — human-readable hand name
            percentile : float — 0–100, where 100 is the strongest possible hand
        """
        hand = [_to_treys(c) for c in hole_cards]
        board = [_to_treys(c) for c in community_cards]

        if board:
            rank = self.evaluator.evaluate(board, hand)
        else:
            # Preflop: treys can't evaluate without a board.
            # Return a placeholder — preflop strength is handled separately.
            rank = WORST_RANK // 2

        rank_class = self.evaluator.get_rank_class(rank)
        category = RANK_CLASS_TO_CATEGORY.get(rank_class, "Unknown")
        percentile = round((WORST_RANK - rank) / (WORST_RANK - BEST_RANK) * 100, 1)

        return {
            "rank": rank,
            "rank_class": rank_class,
            "category": category,
            "percentile": percentile,
        }

    def count_outs(self, hole_cards: list[str], community_cards: list[str]) -> dict:
        """
        Count outs for common drawing hands and compute Rule of 2 & 4 estimates.

        Only meaningful on the flop (3 community cards) or turn (4 community cards).
        Returns outs=0 and draw_type='none' preflop or when no draw is detected.

        Returns:
            outs       : int  — number of cards that improve the hand
            draw_type  : str  — e.g. "flush draw", "open-ended straight draw", "gutshot", "none"
            rule_of_2  : int  — approximate equity % on the turn (outs × 2)
            rule_of_4  : int  — approximate equity % on the flop (outs × 4)
        """
        if len(community_cards) < 3:
            return {"outs": 0, "draw_type": "none", "rule_of_2": 0, "rule_of_4": 0}

        all_cards = hole_cards + community_cards
        suits = [c[-1] for c in all_cards]
        ranks = [c[0] for c in all_cards]

        outs = 0
        draw_type = "none"

        # --- Flush draw: 4 cards of the same suit ---
        suit_counts = {s: suits.count(s) for s in set(suits)}
        flush_suit = next((s for s, count in suit_counts.items() if count == 4), None)
        if flush_suit:
            outs = 9  # 13 cards per suit - 4 already seen
            draw_type = "flush draw"

        # --- Straight draws ---
        rank_order = "23456789TJQKA"
        rank_values = sorted(set(rank_order.index(r) for r in ranks))

        # Open-ended straight draw: 4 consecutive ranks needing one end
        oesd_outs = self._check_oesd(rank_values)
        if oesd_outs and (outs == 0 or draw_type == "flush draw"):
            if draw_type == "flush draw":
                # Combo draw (flush + straight) — very strong
                outs += oesd_outs
                draw_type = "combo draw (flush + straight)"
            else:
                outs = oesd_outs
                draw_type = "open-ended straight draw"

        # Gutshot: 4 cards with a single gap
        if draw_type == "none":
            gutshot_outs = self._check_gutshot(rank_values)
            if gutshot_outs:
                outs = gutshot_outs
                draw_type = "gutshot straight draw"

        return {
            "outs": outs,
            "draw_type": draw_type,
            "rule_of_2": outs * 2,
            "rule_of_4": outs * 4,
        }

    def estimate_equity_monte_carlo(
        self,
        hole_cards: list[str],
        community_cards: list[str],
        num_opponents: int,
        num_simulations: int = 1000,
    ) -> float:
        """
        Estimate win probability via Monte Carlo simulation.

        INTERNAL USE ONLY — this number is never shown directly to the user.
        Phil uses it to verify accuracy and grade decisions post-action.

        Returns:
            float — win probability from 0.0 to 1.0
        """
        known = hole_cards + community_cards
        remaining = _remaining_deck(known)

        cards_needed_on_board = 5 - len(community_cards)
        cards_per_opponent = 2

        wins = 0
        for _ in range(num_simulations):
            if len(remaining) < cards_needed_on_board + cards_per_opponent * num_opponents:
                break

            sample = random.sample(remaining, cards_needed_on_board + cards_per_opponent * num_opponents)
            board_cards = [_to_treys(c) for c in community_cards] + sample[:cards_needed_on_board]
            my_hand = [_to_treys(c) for c in hole_cards]

            my_rank = self.evaluator.evaluate(board_cards, my_hand)

            won = True
            for i in range(num_opponents):
                start = cards_needed_on_board + i * 2
                opp_hand = sample[start: start + 2]
                opp_rank = self.evaluator.evaluate(board_cards, opp_hand)
                if opp_rank <= my_rank:  # lower rank = better in treys
                    won = False
                    break

            if won:
                wins += 1

        return round(wins / num_simulations, 3)

    def pot_odds(self, call_amount: int, pot_size: int) -> dict:
        """
        Calculate pot odds — how much you're risking vs. how much you can win.

        Example: call $10 into a $30 pot → pot odds = 3-to-1 → 25%
        At 25%, you need >25% equity to make calling profitable.

        Returns:
            ratio      : str   — e.g. "3-to-1"
            percentage : float — e.g. 25.0
        """
        if call_amount <= 0:
            return {"ratio": "0-to-1", "percentage": 0.0}

        total = pot_size + call_amount
        ratio_number = round(pot_size / call_amount, 1)
        percentage = round(call_amount / total * 100, 1)

        return {
            "ratio": f"{ratio_number}-to-1",
            "percentage": percentage,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _check_oesd(self, rank_values: list[int]) -> int:
        """Return 8 if there's an open-ended straight draw, else 0."""
        for i in range(len(rank_values) - 3):
            window = rank_values[i: i + 4]
            if window[-1] - window[0] == 3 and len(set(window)) == 4:
                # 4 consecutive ranks — can complete on either end
                return 8
        return 0

    def _check_gutshot(self, rank_values: list[int]) -> int:
        """Return 4 if there's a gutshot straight draw, else 0."""
        for i in range(len(rank_values) - 3):
            window = rank_values[i: i + 4]
            if window[-1] - window[0] == 4 and len(set(window)) == 4:
                # 4 ranks spanning 5 spots with one gap
                return 4
        return 0
