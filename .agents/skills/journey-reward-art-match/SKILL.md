---
name: journey-reward-art-match
description: Match Journey art to Dream Journey reward effects. Use when selecting a reward for a Journey image, naming a dream from art, pairing Shutterstock journey images with docs/rewards.md reward types, or producing image ID + two-word dream name + matched reward type.
---

# Journey Reward Art Match

Use this skill to match one piece of Journey art to one reward type from the
Dream Journey reward pool. Each image represents a dream the player can enter to
earn the selected reward.

Run from the repository root.

## Required Inputs

The user should provide an image ID, image filename, or specific image path.

If the image cannot be identified from the request, ask for the image ID or
filename. If the image file cannot be opened, stop and report the error.

## Source Files

- Art images: `/Users/dthurn/Documents/shutterstock/images_journeys`
- Art descriptions: `/Users/dthurn/Documents/shutterstock/journey_urls.json`
- Quest reward context: `docs/quests.md`
- Reward pool: `docs/rewards.md`

Read the quest reward context before matching so terms like essence, omens,
Dreamsigns, dreamscapes, sites, shop rerolls, starter cards, and draft rewards
are interpreted as player-facing quest outcomes. Then load all 64 reward types
from `docs/rewards.md`; the pool is small enough to review directly.

## Duplicate Tracking

Before matching, check for any existing assignment ledger requested by the user.
If none is provided, use `docs/journey-reward-art-matches.toml` when it exists.

Track:

- Image IDs already assigned or eliminated by prior batches.
- Reward types already assigned.
- Dream-name words already used.

When producing a new assignment, avoid already assigned images. Prefer reward
types with fewer prior matches when multiple rewards fit the art equally well.
Avoid reusing distinctive dream-name words unless the new art strongly demands
one.

If no ledger exists yet, mention that this is the first assignment context and
start tracking words from the current session's known outputs.

## Phase 1: Load the Art

Find the image path and description from the image ID.

Useful commands:

```bash
jq '.[] | select(.id == "<image_id>")' /Users/dthurn/Documents/shutterstock/journey_urls.json
find /Users/dthurn/Documents/shutterstock/images_journeys -maxdepth 1 -type f -name '*<image_id>*'
```

Open the image itself with `view_image` or attach it as a `local_image` input
item. Use the JSON `alt` text only as supporting context. Do not match from the
filename or description alone.

All art in this folder is valid Journey art. Do not classify it as character,
landscape, abstract, event, or reject it for being the wrong kind of image.

## Phase 2: Read the Art's Story

This is the most important phase. Before thinking about rewards, write down what
the art is saying.

Create a concise but grounded visual reading:

- **Subject:** Central figure, creature, object, place, or action.
- **Setting:** Terrain, architecture, natural features, interior/exterior space.
- **Background:** Sky, horizon, distant structures, celestial objects, atmosphere.
- **Palette:** Dominant colors, contrast, warmth/coolness, light source.
- **Mood:** Emotional tone and visual intensity.
- **Style:** Painterly, cinematic, surreal, photorealistic, stylized, etc.

Ground the reading in what is visible. Describe ambiguous particles, haze, glow,
or environmental effects neutrally. If uncertain, say so.

Then write:

- **Literal reading:** One sentence describing what is physically happening.
- **Narrative anchor:** 2-3 sentences in story language, without game terms.
- **Reward constraints:** What kinds of rewards the dream should imply.

Examples of reward constraints:

- A vault, chest, hoard, marketplace, or gift implies gaining a concrete object:
  cards, Dreamsigns, omens, essence, or shop value.
- A doorway, portal, bridge, path, or threshold implies choice, drafting,
  transformation, replacement, or access to a site.
- A forge, spellwork, mutation, machinery, or ritual implies transfiguration,
  card modification, cost reduction, or duplication.
- A cleansing, burial, severing, ruin clearing, or escape implies purging or
  transforming unwanted cards.
- A map, starfield, oracle, library, council, or many visible options implies
  choosing from several rewards, cards, Dreamsigns, or sites.
- A crowded or abundant scene implies multiple copies, random cards, broad
  modification, or reward quantity.
- A solitary, quiet, intimate scene implies a targeted reward affecting one
  chosen card, Dreamsign, site, or starter card.
- A dramatic, world-scale scene implies a rare or high-impact reward such as
  major transformation, all-starter changes, a dreamscape site shift, or gaining
  two rewards.

## Phase 3: Search the Reward Pool

Read `docs/quests.md` for reward terminology and player meaning, then read
`docs/rewards.md` and compare the art's narrative anchor against all reward
types. Do not search for tide concepts or card-combat mechanics.

For each plausible candidate, ask the "aha" test:

> If the player entered this dream and received this reward, would the result
> feel like the image fulfilled its promise?

Strong matches:

- Make the reward feel like the natural outcome of entering the depicted dream.
- Connect to specific visible details, not just broad mood.
- Match reward scale to image scale and intensity.
- Preserve the player's emotional read of the image.
- Can be explained without inventing important story elements that are not in the
  art.

Reject matches where:

- The reward contradicts the image's emotional tone.
- The justification is generic enough to fit many unrelated images.
- The effect depends on a visible object, creature, or action absent from the art.
- A better match exists for a less-used reward type.

Identify the top 2-3 reward candidates. Before choosing, steel-man the later
candidates and devil's-advocate the first candidate you noticed so primacy bias
does not decide the match.

## Phase 4: Name the Dream

The dream name is always exactly two words.

Name rules:

- Use title case.
- Avoid proper names.
- Do not start with "The".
- Keep names evocative and specific to the image.
- Prefer the primary subject, action, or emotional promise of the art over minor
  background details.
- Name visible subjects and objects directly. Do not use a concrete object noun
  metaphorically when that object is not visibly present; for example, a glowing
  orb or hand-held light is not a "Lantern" unless the art shows a lantern body,
  frame, handle, vessel, candle, or similar physical lamp structure.
- Do not name ambiguous visual effects as specific weather, ash, snow, fireflies,
  etc. unless the image clearly shows that thing.
- Check prior assignments and avoid repeatedly using the same distinctive words.

Think of at least three two-word name candidates before selecting the final name.
For each candidate, check whether either word is already common in the ledger or
current batch. Prefer a fresh word pair when quality is otherwise equal.

## Phase 5: Final Output

Return only the assignment, using this exact format:

```text
<image_id> | <Dream Name> | <matched reward type>
```

The matched reward type should be copied exactly from `docs/rewards.md`, without
the leading percentage.

If the user asks for reasoning, include the art reading, top candidates, and
selected rationale before the final assignment line.
