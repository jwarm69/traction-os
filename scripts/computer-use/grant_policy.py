"""Owner plan grant: which proposed actions may run without a per-action prompt.

Pure and dependency-free so it can be tested without the computer-use stack.
A grant never widens what the runner may do; it only removes the prompt for
low-consequence steps on domains the owner named for this one job. Submitting,
sending, publishing, paying, deleting, signing in, Return, navigation, and
anything off-domain or unidentifiable still pause for a one-time decision.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

MAX_GRANT_STEPS = 40
DEFAULT_STEPS = 8
AUTO_KINDS = {"type_text", "type_email", "press_escape"}
TARGET_KINDS = {"click", "press_offscreen"}
DOMAIN = re.compile(r"^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$")
CONSEQUENTIAL = re.compile(
    r"\b(submit|send|publish|post|tweet|share|reply|pay|buy|purchase|order|checkout|"
    r"check out|place|confirm|delete|remove|discard|cancel|unsubscribe|subscribe|"
    r"sign|log ?in|log ?out|register|create account|accept|agree|allow|authorize|"
    r"grant|connect|install|download|upload|save|apply|book|schedule|invite|"
    r"follow|donate|transfer|withdraw|deposit|upgrade|continue|next|done|finish)\b",
    re.IGNORECASE,
)


def parse_grant(value) -> dict | None:
    """Validate the grant delivered with the job; anything malformed means no grant."""
    if not isinstance(value, dict):
        return None
    domains = value.get("domains")
    steps = value.get("steps")
    if not isinstance(domains, list) or not 1 <= len(domains) <= 5:
        return None
    if not all(isinstance(d, str) and DOMAIN.match(d) for d in domains):
        return None
    if not isinstance(steps, int) or isinstance(steps, bool):
        return None
    if not DEFAULT_STEPS <= steps <= MAX_GRANT_STEPS:
        return None
    return {"domains": domains, "steps": steps}


def on_granted_domain(url, grant: dict) -> bool:
    try:
        parsed = urlparse(url if isinstance(url, str) else "")
    except ValueError:
        return False
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host:
        return False
    return any(host == d or host.endswith("." + d) for d in grant["domains"])


def auto_allowed(action: dict, grant: dict | None) -> bool:
    """True only when the owner's grant covers this exact proposed action."""
    if not grant or not on_granted_domain(action.get("url"), grant):
        return False
    kind = action.get("kind")
    if kind in AUTO_KINDS:
        return True
    if kind in TARGET_KINDS:
        target = action.get("target")
        return (
            isinstance(target, str)
            and bool(target.strip())
            and not CONSEQUENTIAL.search(target)
        )
    return False
