"""Approval-gated adapter for awlevin/typesafe-computer-use.

The upstream package owns perception and deterministic actions. This adapter
intercepts every proposed action before it reaches macOS and asks the paired
Traction session for a one-time decision over a JSON-lines protocol.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from typesafe_computer_use import config, macos, runner
from typesafe_computer_use.actions import Context
from typesafe_computer_use.writer import make_writer

PREFIX = "TRACTION_JSON:"
SAFE_ACTIONS = {"scroll_down", "scroll_up", "wait", "switch_to_browser"}


def emit(payload: dict) -> None:
    print(PREFIX + json.dumps(payload, separators=(",", ":")), flush=True)


def preview(decision, screen, items) -> dict:
    chosen = decision.chosen
    by_index = {str(item.index): item for item in items}
    target = None
    if chosen in by_index:
        target = by_index[chosen].text
        kind = "click"
    elif chosen.startswith("offscreen:"):
        index = chosen.split(":", 1)[1]
        node = screen.offscreen[int(index)] if index.isdigit() and int(index) < len(screen.offscreen) else None
        target = node.label if node else index
        kind = "press_offscreen"
    else:
        kind = chosen
    return {
        "kind": kind,
        "target": target,
        "app": screen.app,
        "url": screen.url,
        "field": screen.field.summary() if screen.field else None,
        "confidence": round(decision.confidence, 3),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--steps", type=int, default=8)
    parser.add_argument("--min-confidence", type=float, default=0.5)
    parser.add_argument("--delay", type=float, default=2.0)
    args = parser.parse_args()
    if not 1 <= args.steps <= 12 or not 0.4 <= args.min_confidence <= 1:
        raise SystemExit("invalid computer-use limits")
    if not os.environ.get("TYPESAFE_API_KEY"):
        raise SystemExit("TYPESAFE_API_KEY is required on the paired Mac")
    if not macos.accessibility_trusted():
        raise SystemExit("Accessibility permission is required for the runner terminal")

    emit({"type": "ready"})
    first = sys.stdin.readline()
    try:
        goal = json.loads(first)["goal"]
    except Exception as exc:
        raise SystemExit("invalid initial goal") from exc
    if not isinstance(goal, str) or not goal.strip() or len(goal) > 1000:
        raise SystemExit("invalid initial goal")

    writer = make_writer()
    original_perform = runner.perform
    sequence = 0

    def gated_perform(decision, screen, items, ctx):
        nonlocal sequence
        sequence += 1
        action = preview(decision, screen, items)
        action_id = f"action_{sequence}"
        if decision.chosen not in SAFE_ACTIONS:
            emit({"type": "approval", "id": action_id, "action": action})
            response = sys.stdin.readline()
            try:
                answer = json.loads(response)
            except Exception as exc:
                raise runner.Abort("approval channel closed") from exc
            if answer.get("id") != action_id or answer.get("decision") != "approved":
                raise runner.Abort("action declined")
        emit({"type": "acting", "id": action_id, "action": action})
        result = original_perform(decision, screen, items, ctx)
        emit({"type": "acted", "id": action_id, "result": result})
        return result

    runner.perform = gated_perform
    cfg = runner.RunConfig(
        goal=goal.strip(), out=args.out, act=True, steps=args.steps,
        min_confidence=args.min_confidence, delay=args.delay,
    )

    def context(typesafe, history):
        return Context(
            goal=goal, browser=config.browser(), email=config.email(),
            typesafe=typesafe, writer=writer, history=history,
        )

    state = runner.run(cfg, context)
    emit({"type": "complete", "outcome": state.outcome, "history": state.history})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
