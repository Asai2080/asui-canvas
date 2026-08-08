# UI Prompt Optimization Research

This document records the external guidance used to rebuild the ASUI Canvas UI
prompt pipeline. The implementation is in
`src/lib/canvas-agent/prompts/ui-spec.ts`.

## Sources

- [Lovable prompting guide](https://docs.lovable.dev/prompting/prompting-one)
  - Define the product, audience, reason to use it, and one key action before
    styling.
  - Describe the user journey and use real content rather than placeholders.
  - Name concrete components such as buttons, cards, fields, toggles, and
    modals.
- [Lovable design guidance](https://docs.lovable.dev/features/design-guidance)
  - When visual direction is open, offer genuinely different directions.
  - Once a direction is selected, lock typography, palette, and layout into a
    detailed brief rather than continuing to mix styles.
- [Lovable design systems](https://docs.lovable.dev/features/design-systems)
  - Treat tokens, components, variants, props, and constraints as a source of
    truth that can be checked, not as decorative prose.
- [v0 text prompting](https://v0.app/docs/text-prompting)
  - Start with product context and requirements; specify functionality, design
    preferences, technical constraints, and error states.
  - Break complex products into a plan and build components incrementally.
- [v0 PRD design](https://v0.app/docs/prd-design)
  - Validate completeness, feasibility, consistency, clarity, and testability.
- [v0 Design Systems 2.0](https://v0.app/docs/design-systems-2)
  - Ground generation in verified components and tokens. Keep one focused,
    internally consistent system and validate the result before reuse.
- [v0 screenshots](https://v0.app/docs/screenshots)
  - A reference screenshot provides layout, color, component, and likely
    behavior evidence. Full-screen references give context; tight crops are
    better for local changes.
- [Google Vertex AI image prompt guide](https://cloud.google.com/vertex-ai/generative-ai/docs/image/img-gen-prompt-guide)
  - Put subject, context, and style into clear descriptive language.
  - Keep text in generated images short. Aspect ratio changes composition and
    must be specified explicitly.
- [Ideogram prompting fundamentals](https://docs.ideogram.ai/using-ideogram/getting-started/prompting-guide/2-prompting-fundamentals)
  and [prompt structure](https://docs.ideogram.ai/using-ideogram/getting-started/prompting-guide/3-prompt-structure)
  - Put the most important visible concept first and use concrete observable
    details rather than vague adjectives.
  - Avoid contradictory style instructions and excessive prompt length.
- [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
  - Image generation can revise prompts internally, but upstream prompts still
    need concise, high-signal content and benefit from iterative refinement.
- [UI UX Pro Max Skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
  - Resolve product type, audience, platform, visual direction, density, palette,
    typography, components, and anti-patterns as one design system before output.
  - Calibrate variance and density to the artifact instead of applying one visual
    style to dashboards, consumer apps, e-commerce, and marketing pages.
  - Its density dial uses different spacing bands: spacious `24-96px`, standard
    `16-64px`, and dense/dashboard `8-32px`. Its UX data also requires at least
    `8px` between adjacent touch targets and includes product-specific rules such
    as `48px+` section gaps.
- [Garden web-design-engineer](https://github.com/ConardLi/garden-skills/tree/main/skills/web-design-engineer)
  - Use explicit design reads and calibration dials whose values have visible
    consequences. Prevent cardification, generic gradients, fake proof,
    micro-label noise, and marketing composition in operational products.
  - A spacing system must be a concrete value ladder, not the phrase "8pt grid".
    Examples include Linear `4/8/12/16/24/40/64/96`, Headspace
    `8/16/24/40/64/96`, NYT `4/8/16/24/32/48/96`, and Pentagram's strict
    12-column grid with `24-32px` gutters. The selected product language and
    density determine which ladder is appropriate.
- [Garden gpt-image-2](https://github.com/ConardLi/garden-skills/tree/main/skills/gpt-image-2)
  - Select one task-specific structured image template, fill exact fields, keep
    text concise and literal, and separate must-keep constraints from avoid rules.
  - In host-native mode, compile the structured prompt into the host image model
    rather than attempting to execute the source Skill's local scripts.
  - Its UI templates specify practical outer padding, panel gaps, uniform
    margins, and `80-120px` vertical breathing room for landing-page sections.
- [xuexi-ui / Invisible Details UI](/Users/zhuyanming/Documents/Codex/2026-08-05/xuexi-ui)
  - The local archive contains the complete course and a separate distilled
    generation playbook. It requires a product task and explicit page state
    before visual styling, then asks for default, loading, success, failure,
    empty, disabled, selected, and focus states.
  - It treats feedback as a weighted conversation: small actions get local
    state changes, saves/copies get brief result feedback, and destructive or
    high-consequence actions need confirmation or undo. Long operations need
    immediate loading feedback followed by a completion result.
  - It also requires actionable errors, preserved user input, resilient long
    copy/dynamic numbers/charts, stable remembered filters and scroll position,
    and conventional keyboard semantics. These rules are now emitted by the
    UI prompt compiler rather than copied as a generic visual checklist.
- [X article: 让 AI 做成高级页面，必须知道提示词](https://x.com/sts81998850/status/2084653106944753931?s=46)
  - The complete article explains material hierarchy and interaction rhythm:
    selective backdrop blur, subtle 1px borders, restrained soft shadows,
    scroll reveal, stagger, and `0.2-0.4s` transitions.
  - It does not define page margins, component padding, section gaps, or a
    spacing ladder. Those concrete spacing values therefore come from the two
    repositories above; the article contributes hierarchy and pacing guidance,
    not fabricated spacing numbers.

## Rules Implemented

1. A UI request is compiled through a dedicated UI path. It never receives
   photographic lens, camera, depth-of-field, studio-lighting, or mockup
   instructions.
2. The prompt begins with product, user, current state, and one screen task.
3. The screen is specified as an ordered verbal wireframe with a hard content
   budget. Secondary rows are removed before text is shrunk or clipped.
4. Only essential visible copy is requested. Real labels and realistic data
   replace lorem ipsum and generic placeholders.
5. The design system contains palette roles and hex values, typography scale,
   spacing/grid, interaction size, component inventory, border, radius, shadow,
   and icon decisions.
6. Mobile and Web use different architectures. A 750 x 1624 mobile screen uses
   explicit top, body, summary, and bottom-navigation budgets. A 1440 x 1024
   work surface uses navigation, filters, metrics, and a dominant data region.
7. User-supplied style, palette, brand, and product decisions remain
   first-class constraints. Generic model prose is discarded.
8. Final prompts are compressed and deduplicated. The original model brief is
   not pasted wholesale and then repeated by a second template.
9. A design calibration section maps product type to concrete variance, density,
   asset-dependence, and brand-fidelity decisions. These values alter layout and
   visual treatment rather than acting as decorative scores.
10. Reference images use category-specific semantics. UI references control
    structure, density, typography hierarchy, component grammar, and palette
    roles; they never replace the current product, exact copy, dimensions, or
    brand.
11. The image-model rendering protocol lays out regions before components and
    components before exact short copy. It forbids repeated, fabricated, clipped,
    or pseudo-text and removes secondary content before reducing legibility.
12. UI prompts contain an explicit spacing hierarchy: a density-appropriate
    token ladder plus separate values for page margins, section gaps, sibling
    component gaps, internal padding, row spacing, and icon-to-label spacing.
    Whitespace establishes grouping and visual rhythm instead of becoming
    unallocated leftover space.

## Quality Gate

A UI brief is inadequate when it lacks several of these verifiable signals:

- target user or audience
- one page task or primary action
- realistic current state or data
- exact visible copy
- ordered regions and concrete components
- typography, palette, spacing, or grid decisions
- exact dimensions and safe-area behavior

Phrases such as "modern", "high-end", "clear hierarchy", and "consistent
components" do not count as evidence by themselves. Weak model output is
replaced by the deterministic domain-aware UI brief before prompt compilation.

## Verification Scenarios

- one-line mobile request expanded into a complete domain-specific screen
- weak model output rejected
- detailed user style preserved without duplication
- 750 x 1624 mobile safe-area and overflow rules
- 1440 x 1024 Web work-surface architecture
- no photographic language or landing-page rerouting in App prompts
- ordinary reference-image generation binds selected canvas context through the
  compiler, planner, executor, and image API
- UI, product, photography, illustration, poster, and other visual categories
  use isolated reference semantics and reject mismatched model briefs
- final prompt length below the practical UI prompt budget
