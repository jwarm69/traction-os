# AlignIQ Golf — Week 1: calibrate

Status: ready to start. Owner work, not engineering. Time budget: about 5–6 hours across five short sessions.
Parent plan: six weeks focused on AlignIQ Golf growth. Traction OS is used as the operating tool and judged by whether it helped. Astro-Log and Tonight are parked for the window.

## Rules for the six weeks

1. No new Traction infrastructure. The runner stays behind `RUNNER_ENABLED` (off). Nothing is deleted either.
2. Traction code changes only when something blocks that week's AlignIQ work: one fix, same day, then back to the work.
3. Every time Traction is slower than asking Claude directly, or gets in the way, add a line to the friction log below.

## What is already known (and what is not)

| Item | Current state | Source |
| --- | --- | --- |
| Website | https://aligniqgolf.com | Owner |
| Stage | Private beta (implied by the pilot seed prompt; not confirmed) | `scripts/seed-project-pilots.mjs` |
| Provisional goal | Five golfers complete a first logged round within 14 days | Same seed; marked provisional |
| Coach features | Unconfirmed: the seed says "confirm coach capabilities before promising them" | Same seed |
| Research facts | 4–6 AI-researched facts saved as `unreviewed` | `scripts/seed-live.mjs` |
| Search visibility | A September 23, 2026 web search for "AlignIQ Golf app" returned no AlignIQ Golf result: only an unrelated enterprise product named AlignIQ and several "Golf IQ" apps | Web search, Sept 23, 2026 |
| Signup, activation, return counts | Unknown | Nobody has recorded them yet |
| Price and payer | Unknown | — |

Implication of the search result: anyone who hears about AlignIQ Golf and searches for it will probably land on something else. Every outreach message must carry a direct link. This matters more than any SEO work right now.

## Day 1 — Ground truth (60–90 min)

Answer these three questions before doing anything else. The rest of the plan branches on them.

1. **Stage.** Is it live with real users, private beta with invited users, or pre-launch?
2. **Funnel counts.** All time and last 30 days:
   - Signed up: ___
   - Logged at least one round: ___
   - Came back to review a logged round: ___
   Define "came back" precisely and write the definition here: ___ (suggestion: opened a round review at least 24 hours after logging it).
3. **Price and payer.** Free, paid, or not decided? Who pays: the golfer or the coach?

If the counts can't be produced, the first job is instrumentation **in AlignIQ, not Traction**: three events (`signup`, `first_round_logged`, `round_reviewed`) with user ID and timestamp. Nothing else.

## Day 2 — Calibrate AlignIQ in Traction (45 min)

- Open AlignIQ Golf in Traction. Mark each unreviewed fact as confirmed, corrected, or rejected. Don't leave any as "unreviewed."
- Add the Day 1 answers as owner-confirmed facts, with today's date.
- Add the search-visibility observation as a fact (source: web search, Sept 23, 2026).
- Replace the provisional goal with one built around the metric that matters: **golfers who log a first round and come back to review it.**
- Start the friction log.

## Day 3 — Choose the week 2 channel from the funnel, not from the idea list (30 min)

| What Day 1 showed | Week 2 work | Why |
| --- | --- | --- |
| Fewer than about 10 people have ever logged a round | Hand-recruit about 10 golfers you can reach directly (friends, your course, the range) and watch them log a first round | Activation is unproven. Sending coach traffic into an unproven flow wastes the coaches' goodwill. |
| Plenty of signups, but few log a first round | A product brief for the drop-off step. No new traffic until it's fixed. | More traffic into a leaky step teaches you nothing new. |
| Golfers log and return; the constraint is reach | Coach-led first-round cohort (the suggested first pick in `FOUR-BUSINESS-IDEATION.md`) | Now distribution is the bottleneck. |
| Coaches are the ones who pay | Coach discovery conversations, not a coach-as-channel campaign | Coaches become the customer. Different questions, different success metric. |

The "about 10" threshold is a judgment call, not a benchmark. Adjust it if you have a reason, but write the reason down.

## Day 4 — Define the experiment in Traction, with a stopping rule (45 min)

Create one endeavor (or select the coach cohort idea in Explore and hand it to Do). Fill in every field **before** starting:

- **Hypothesis:** ___
- **Audience:** ___ (who exactly; for coaches: e.g. independent instructors whose public teaching emphasizes practice planning or on-course reflection)
- **Contact count:** ___ (coach version: about 15 coaches, aiming for about 3 yeses and about 10 golfers)
- **Success:** ___ golfers log a first round **and** return to review it within 14 days
- **Stop date:** ___ (stop on this date whatever the numbers say)
- **How it's measured:** the Day 1 events or counts, not impressions

## Day 5 — Prepare, but don't send (60–90 min)

- Research 5 targets first, not 15, so the message gets tested before the list gets built. Use Traction research, and record source links with retrieval dates.
- Draft one outreach message in Traction. Rules: a direct link, no performance promises, only coach features that exist today, and one clear ask.
- Review it as the owner. Sending starts in week 2, once the baseline is recorded, so the results have something to be compared against.

## Week 1 exit checklist

- [ ] Stage, funnel counts, and price/payer are answered and saved as confirmed facts
- [ ] Baseline counts are recorded, or the three events are live in AlignIQ
- [ ] No AlignIQ fact in Traction is left `unreviewed`
- [ ] Week 2 channel chosen, with the Day 3 row that justified it
- [ ] One endeavor defined with a stop date and a success number
- [ ] Five targets researched and one message reviewed
- [ ] Friction log has entries (an empty log after a week of real use is suspicious)

## Friction log

| Date | What I was trying to do | What happened | Minutes lost | Faster in plain Claude? (y/n) |
| --- | --- | --- | --- | --- |
| | | | | |

At week 6 this log decides the Traction question: keep it as a personal ops tool, or productize it with a precise build list.
