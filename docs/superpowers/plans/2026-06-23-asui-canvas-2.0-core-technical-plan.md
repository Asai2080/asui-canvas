# Asui Canvas 2.0 Core Technical Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` before implementing this plan task-by-task.

**Goal:** Plan the first three 2.0 capabilities: size-driven generation, multi-annotation editing, and Codex collaboration.

**Architecture:** Keep the existing canvas generation path intact. Add focused modules around frame sizing, annotation grouping, provider size mapping, and Codex task recording so each feature can ship independently.

**Tech Stack:** Next.js App Router, React 19, tldraw, TypeScript, Base UI, local JSON files, Node.js route handlers, Vitest.

---

## Research Summary

### tldraw

tldraw's `Editor` is the right integration point for the canvas work. Its docs describe the `Editor` class as the main way to control internal editor state, create shapes, update documents, and respond to changes. The same docs show access through the `Tldraw` `onMount` callback and reactive state through methods like `getSelectedShapeIds` and `getCurrentPageShapes`.

Use tldraw directly for:

- Finding selected holders, frames, images, and annotations.
- Updating frame dimensions when a preset is selected.
- Reading annotation text and page bounds.
- Writing metadata to shapes/assets for traceability.

Source: https://tldraw.dev/docs/editor

### Base UI

The project already depends on `@base-ui/react`. Base UI has unstyled, accessible Popover and Select components. This is a better first choice than adding Radix, Headless UI, or Floating UI because it matches the current dependency set and keeps bundle/API sprawl lower.

Use Base UI for:

- Floating canvas settings bar container.
- Size preset dropdown.
- Future Codex task menu/dropdown.

Sources:

- https://base-ui.com/react/components/popover
- https://base-ui.com/react/components/select

### Image Provider Size Mapping

OpenAI's current image API supports different size behavior by model. The docs say `gpt-image-2` supports arbitrary `WIDTHxHEIGHT` strings with divisibility and aspect-ratio constraints, while standard GPT image sizes include `1024x1024`, `1536x1024`, and `1024x1536`; DALL-E models have their own fixed sizes.

OpenRouter's image generation docs expose `resolution`, `aspect_ratio`, and `size` shorthand, but model support varies. The existing app already uses OpenRouter chat completions with image output and `image_config.aspect_ratio`, so 2.0 should extend the adapter rather than replace it.

Use a provider capability mapper for:

- Rounding dimensions to supported values.
- Mapping arbitrary canvas dimensions to exact size strings where supported.
- Mapping to aspect ratio when exact size is unsupported.
- Returning capability notes for UI/status messages.

Sources:

- https://developers.openai.com/api/reference/resources/images/methods/generate
- https://openrouter.ai/docs/guides/overview/multimodal/image-generation

### Codex Task Bridge

Codex CLI is documented as a local coding agent that can read, change, and run code in the selected directory. Its default local permissions allow workspace reads/edits and routine commands, with approval before internet or outside-workspace access. Codex also has non-interactive mode via `codex exec`, but 2.0 should not depend on auto-running Codex from the app.

The safest first bridge is file-based:

- The website records structured tasks to the repository workspace.
- Codex reads the task files when the user asks it to continue.
- No background process or direct Codex invocation is required for the first slice.

Sources:

- https://developers.openai.com/codex/cli
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/concepts/sandboxing

### Local JSON and Validation Utilities

Use Zod for runtime validation of Codex task payloads and API inputs. Zod is TypeScript-first and returns typed validated data.

For storage, prefer simple append-only JSON files using Node's `fs/promises` first. If concurrent writes become a problem, add `write-file-atomic`, which writes files atomically. If task querying grows beyond simple files, consider `lowdb`, a type-safe local JSON database.

Sources:

- https://github.com/colinhacks/zod
- https://github.com/npm/write-file-atomic
- https://github.com/typicode/lowdb

## 1. Size-Driven Generation

### Product Behavior

The canvas/frame dimensions are the source of truth. There is no separate 2K/4K control.

When a user creates or selects an image holder:

1. A floating settings bar appears near the selected frame.
2. The user picks a preset such as `1:1`, `2:3`, `9:16`, `3:2`, `16:9`, `A4`, or `Web`.
3. The selected frame immediately resizes on the canvas.
4. Width and height fields update to the resolved dimensions.
5. Generation uses the current frame width and height.

### Proposed Files

- Modify `src/components/canvas/ai-canvas.tsx`
  - Own selected frame state.
  - Open/close the floating settings bar.
  - Apply preset and manual dimension changes to tldraw frames.

- Create `src/components/canvas/canvas-size-floating-bar.tsx`
  - Render the floating bar.
  - Contain layout mode, preset select, width, and height controls.
  - Emit normalized size changes.

- Create `src/lib/canvas/size-presets.ts`
  - Define preset metadata and dimension resolution.
  - Keep preset math outside React components.

- Modify `src/lib/canvas/size.ts`
  - Reuse existing sanitization and normalization.
  - Add model/API-safe dimension normalization if needed.

- Modify `src/app/api/images/generate/route.ts`
  - Replace `size: "auto"` for OpenAI-compatible requests with mapped size when possible.
  - Keep OpenRouter aspect-ratio behavior, but return capability metadata.

- Create or extend tests:
  - `src/lib/canvas/size-presets.test.ts`
  - `src/app/api/images/generate/route.test.ts`

### Implementation Notes

The floating bar should be positioned from the selected frame's page bounds converted to viewport coordinates. The current code already uses `editor.pageToViewport` for annotation action placement; reuse that pattern.

Preset changes should update both frame props and metadata:

```ts
meta: {
  kind: "image-holder",
  asuiNode: "image-holder",
  asuiMetaVersion: 1,
  layoutMode: "manual",
  sizePreset: "9:16",
  size: { width: 1024, height: 1820 },
}
```

Provider mapping should return both the request payload fragment and a note:

```ts
type ProviderSizeMapping = {
  size?: string
  aspectRatio?: string
  capability: "exact" | "nearest" | "aspect-ratio-only" | "auto"
  note?: string
}
```

## 2. Multi-Annotation Single Generation

### Product Behavior

Keep the existing single-annotation generation path. Add a new multi-annotation path:

1. User creates several AI annotations on one source image.
2. User selects the source image or selects multiple annotations.
3. The UI offers "Generate from all annotations".
4. The app validates that all annotations target the same source image/version.
5. The app sends one edit request with all annotation texts and lightweight location descriptions.
6. The result becomes a new version linked to the original image.

### Proposed Files

- Modify `src/components/canvas/ai-canvas.tsx`
  - Track multi-selection with `editor.getSelectedShapeIds()`.
  - Derive eligible annotation groups.
  - Show a multi-annotation generation action.

- Create `src/lib/canvas/annotations.ts`
  - Resolve annotation targets.
  - Extract annotation text.
  - Validate same source image/version.
  - Compose multi-annotation feedback.

- Modify `src/lib/canvas/types.ts`
  - Add metadata fields for source generation mode and annotation IDs.

- Modify `src/app/api/images/generate/route.ts`
  - Accept a `feedbackItems` array while retaining the existing `feedback` string.
  - Compose the prompt so models receive a clear list of edit instructions.

- Create tests:
  - `src/lib/canvas/annotations.test.ts`
  - Add route tests for `feedbackItems`.

### Prompt Shape

Use structured feedback text even if the provider ultimately receives a single prompt string:

```text
Apply the following canvas annotations to the attached source image.
Only change the regions requested by the annotations.
Preserve unannotated regions as much as possible.

Annotations:
1. Top-right region: change the sky to sunset.
2. Center subject: change the coat to red.
3. Bottom text: replace the slogan with "Asui Canvas".
```

### Metadata

The generated image shape and version should store:

```ts
generationMode: "single-annotation" | "multi-annotation" | "holder-fill" | "codex"
sourceAnnotationIds: string[]
sourceShapeId: string
parentVersionId: string
```

## 3. Codex Collaboration Side Path

### Product Behavior

Codex is optional. The original website generation path keeps working without it.

The first 2.0 Codex path should be task recording, not automatic agent execution:

1. User selects a canvas item or writes an instruction.
2. User chooses "Send to Codex".
3. The app writes a structured task file through a local API route.
4. Codex can read the task file and act when the user asks.
5. Results can later be written back as new canvas assets or documented code changes.

### Proposed Files

- Create `src/lib/codex-tasks/schema.ts`
  - Zod schemas for `code-change` and `image-generation` tasks.

- Create `src/lib/codex-tasks/store.ts`
  - Write task JSON files into `.asui-codex/tasks/queued/`.
  - Keep the write path inside the repository.
  - Use Node `fs/promises` first; add `write-file-atomic` only if writes become concurrent.

- Create `src/app/api/codex-tasks/route.ts`
  - Accept task creation from the web app.
  - Validate with Zod.
  - Return task ID and file path.

- Create `src/components/canvas/codex-task-panel.tsx`
  - Minimal UI for task type and instruction.
  - Use selected canvas context from `AiCanvas`.

- Modify `.gitignore`
  - Ignore generated task files if they may contain user prompts or local asset paths.
  - Optionally keep `.asui-codex/README.md` tracked to document the folder.

- Create tests:
  - `src/lib/codex-tasks/schema.test.ts`
  - `src/lib/codex-tasks/store.test.ts`
  - `src/app/api/codex-tasks/route.test.ts`

### Task Shape

```ts
type CodexTask = {
  id: string
  type: "code-change" | "image-generation"
  status: "queued"
  createdAt: string
  source: "asui-canvas"
  instruction: string
  canvasContext: {
    selectedShapeIds: string[]
    sourceShapeId?: string
    versionId?: string
    annotationIds: string[]
    prompt?: string
    width?: number
    height?: number
    sizePreset?: string
  }
}
```

### Storage Layout

```text
.asui-codex/
  README.md
  tasks/
    queued/
      task-20260623-163000-example.json
    completed/
    failed/
```

### Safety Rules

- Do not run Codex from the website in the first slice.
- Do not store API keys in task files.
- Do not write generated tasks into `public/`.
- Keep task files local and ignored unless the user explicitly wants to share them.
- Treat task file contents as user data.

## Recommended Open Source / Existing Tech

Use now:

- tldraw Editor API: core canvas operations and metadata.
- Base UI Popover/Select: floating settings and dropdown controls.
- Zod: task and route input validation.
- Node `fs/promises`: first task outbox storage implementation.

Use if needed:

- `write-file-atomic`: safer file writes if task writes can race.
- `lowdb`: local JSON task database if simple per-file task storage becomes awkward.
- Codex `codex exec`: future automation path, not part of the first 2.0 implementation.

Avoid for now:

- Adding another UI primitive library such as Radix or Headless UI while Base UI is already installed.
- Adding a database for the Codex task bridge.
- Auto-running Codex from a web route.

## Suggested Build Order

1. Implement size preset math and frame resizing.
2. Add the floating settings bar.
3. Add API provider size mapping and capability notes.
4. Extract annotation target/text helpers.
5. Add multi-annotation validation and prompt composition.
6. Add the multi-annotation generate action.
7. Add Codex task schemas and local task store.
8. Add `/api/codex-tasks`.
9. Add a minimal "Send to Codex" UI.
10. Run `npm test`, `npm run lint`, and `npm run build`.

## Open Questions

- For unsupported exact dimensions, should the app downgrade silently with a visible note or block generation?
- Should the multi-annotation action appear when selecting the source image, selecting annotations, or both?
- Should Codex tasks be ignored by Git by default, or should the task outbox be partially tracked for collaboration?
- Should Codex image-generation tasks write results directly back into canvas assets in 2.0, or only record task intent first?
