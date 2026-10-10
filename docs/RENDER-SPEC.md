# Render spec and per-video tracking

Status: implemented. The motion graphics renderer has not consumed a spec yet; this document is the contract it should read.

## Why

A motion graphics engine makes a video variant cheap, which makes testing several concepts and hooks affordable. More variants only help if each one is measured on its own. So every rendered video gets a name that travels with it: the file name, the link's `utm_content`, and the `asset` on every result recorded for it. The campaign table stays per campaign; the Videos section in Do splits a campaign's results by video.

## Flow

1. Run the campaign brief skill on a campaign (Do).
2. On a concept card, choose **Render spec**, pick formats, optionally an alternate hook and a call to action, and export. Traction registers the next version, `<CODE>_<angle>_motion_v<N>`, and downloads `<name>.render.json`.
3. The renderer reads the spec and writes one file per format, named as `formats[].fileName`.
4. Publish with `script.cta.url` (it already carries `utm_content`). Paste the published link and the file link on the video under Videos.
5. Record results with the campaign code, a campaign metric, and the asset name, by hand under Results or as CSV columns `campaign,campaign_metric,asset`. An unknown asset name rejects the row or the whole file, so a typo cannot create a phantom video.

Videos made elsewhere (UGC, a creator's cut) can be registered by name under Videos and tracked the same way.

## Spec format: `traction.render-spec/v1`

| Field | Meaning |
| --- | --- |
| `schema` | Always `traction.render-spec/v1`. A breaking change gets a new version. |
| `generatedAt` | ISO time of export. The only field that differs between two exports of the same asset. |
| `business` | `name`, `url`. |
| `campaign` | `code`, `title`, `audience` (or null), `hypothesis` the concept tests. |
| `asset` | `name` (the join key), `version`, `angle`, and `concept` (`briefArtifactId`, `briefVersion`, `index`) so the spec can be rebuilt from the exact brief version. |
| `script.hook` | Opening line. The alternate hook when one was given, else the concept's. |
| `script.lines` | Body copy split into sentences, in order. Timing is the renderer's job. |
| `script.cta` | `text` (null when not set; the renderer must not invent one) and `url` (tracked link, or null when the business has no https site). |
| `visual` | `direction` (what the viewer sees) and `productionBrief` (format, assets, length guidance) from the concept. |
| `formats[]` | `aspect` (`9:16`, `1:1`, `4:5`, `16:9`), `width`, `height`, and the `fileName` to write. |
| `brand` | Confirmed facts only, by category: `offer`, `product`, `positioning`, `voice`, `proof`. Facts older than 90 days carry "(verify: observed …)". Unreviewed facts never appear. |
| `rules` | Standing corrections in scope for campaign creative. On-screen copy must follow them. |
| `claimsToVerify` | Stale facts the concept cites. Do not put these on screen until checked. |
| `flags` | Problems the renderer or owner must resolve: concept flags from the brief, a missing CTA, a missing https URL. |
| `tracking` | `campaign`, `asset`, the four `utm` values, and a one-line `report` instruction. |

## Data

- `Endeavor.assets` (cap 50): `name`, `kind` (`motion` or `external`), `concept`, `version`, `hook`, `ctaText`, `formats`, and optional https `mediaUrl` and `publishedUrl`. Stored in the business document; files are never stored, only links.
- `Signal.asset`: optional, valid only on a classified campaign signal, and only for an asset registered to that campaign.
- `assetTable` (`lib/assets.ts`) splits a campaign's classified signals by asset plus a "not assigned to a video" row. Rows sum to the campaign row. Cost per lead appears only at five or more leads. Pipeline contacts are campaign-level and are not split.

## Not yet

- The renderer side: reading the spec, rendering, and returning the file link automatically. The paired desktop runner is the intended path (a render job that returns `mediaUrl` as an unreviewed result), once the renderer's command line is known.
- File storage. Links only; R2 or Vercel Blob when uploads are needed.
- Per-video evidence bars and memo lines. The memo still judges the campaign; compare videos in the Videos table.
