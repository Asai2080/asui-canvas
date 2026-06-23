# Asui Canvas 2.0 Iteration Design

## Status

Draft recorded on 2026-06-23.

This document captures the current 2.0 direction discussed for Asui Canvas. It is a design record, not an implementation plan yet.

## 2.0 Product Direction

Asui Canvas 2.0 should keep the existing canvas generation path stable while adding higher-resolution generation, multi-annotation editing, slicing/export workflows, and an optional Codex collaboration path.

The 1.0 path must remain intact:

1. Create an image holder.
2. Enter a prompt.
3. Generate through the web app.
4. Add annotations.
5. Generate a new image version from an annotation.

Codex-related capabilities are a side path. They must not replace, block, or weaken the existing in-canvas generation flow.

## Goals

- Add real 2K and 4K generation choices that are passed through to the API layer.
- Support generating from multiple annotations on the same image in one request.
- Add a slicing workflow for turning generated images into reusable output formats.
- Define a Codex collaboration task path for code changes and image generation assistance.
- Keep video model integration as an exploration item, not a required 2.0 core feature.

## Non-Goals

- Do not require Codex for normal canvas generation.
- Do not remove or redesign the current API configuration flow as part of the first 2.0 slice.
- Do not promise video generation in the core 2.0 scope until model choice, cost, storage, and UX are decided.
- Do not build a full multi-user cloud project system in this iteration.

## Feature Area 1: 2K and 4K Generation

### User Experience

Resolution and canvas size should move toward a floating canvas settings bar, similar to the provided reference image. The bar should feel attached to the selected image holder or canvas frame, rather than being buried only in the side panel.

The floating settings bar should include:

- Canvas/frame identity, such as the frame name.
- Layout mode: auto or manual.
- Size preset selector: custom, common social presets, 2K, and 4K.
- Width and height fields.
- A resize or fit affordance when useful.

The size preset selector should behave like a design-tool dropdown. Example preset groups:

- Aspect ratios: 1:1, 2:3, 9:16, 3:2, 16:9.
- Print or document presets: A4.
- Web presets: webpage or common banner/screen sizes.

Choosing a preset should immediately update the active canvas/frame dimensions on the canvas. The user should see the blue selected frame resize in real time while the width and height fields update to the resolved pixel dimensions. Manual width and height edits should also resize the selected frame immediately after commit, such as on Enter, blur, or explicit apply depending on the final control behavior.

Resolution choices should include:

- Auto
- 1K
- 2K
- 4K

The selected resolution should affect the actual model request, not only the displayed canvas node size.

### Floating Settings Behavior

The floating settings bar should open from these triggers:

- Click the canvas/frame name.
- Create a new image holder or canvas frame.
- Click the selected canvas/frame border.

The floating settings bar should close when the user clicks outside the settings bar and outside the active canvas/frame interaction area.

This interaction should preserve the current right-side generation panel. The floating bar owns frame layout, width, height, and resolution preset changes. The generation panel continues to own prompt entry, generation status, and generation actions unless later product work intentionally merges these surfaces.

### Technical Behavior

The client should send a structured resolution field, for example `resolutionPreset`, along with width and height. The server should map this to provider-specific parameters.

Current behavior to improve:

- OpenAI-compatible requests currently use `size: "auto"`.
- OpenRouter requests currently map width and height to `image_config.aspect_ratio`.
- Width and height are preserved in returned version metadata, but not always enforced as provider output resolution.

2.0 should make the API behavior explicit:

- For providers that support exact size values, send the closest supported size.
- For providers that support quality or resolution tiers, map 2K and 4K to those documented tiers.
- For providers that only support aspect ratio, send aspect ratio and return a clear capability note.
- If 4K is unsupported, either warn and downgrade or block with a clear error. The preferred behavior should be chosen during implementation planning.

Canvas/frame settings should be stored in metadata so they survive selection changes and reloads:

- Layout mode.
- Size preset.
- Resolution preset.
- Width and height.

## Feature Area 2: Multi-Annotation Generation

### Current Behavior

The current app supports multiple annotations existing on the canvas, but generation is single-annotation based:

1. Select one annotation.
2. A floating "generate" button appears.
3. The app sends that one annotation as feedback.
4. A new image version is created.

### Desired 2.0 Behavior

Users should be able to apply several local edit instructions to the same source image in one generation.

Candidate interaction:

1. Add several AI annotations to one generated image.
2. Select multiple annotations or select the source image and use a "generate from annotations" action.
3. The app combines the annotation texts and their source-image relationship into one edit request.
4. The result is created as a new version linked to the original image.

### Guardrails

- Only combine annotations that target the same source image/version.
- Preserve the single-annotation path.
- Show a clear message when selected annotations belong to different images.
- Store the annotation IDs used for the generation in metadata for traceability.

## Feature Area 3: Codex Collaboration Path

### Principle

Codex is an optional side path. It should automatically recognize structured work from the web app, but the normal canvas generation path must keep working without Codex.

### Two Task Types

Code tasks:

- The user describes a product or code change from the web app.
- The app records a structured task.
- Codex reads the task and can modify the codebase.

Image tasks:

- The user selects a canvas node, prompt, version, or annotations.
- The app records a structured generation task.
- Codex can recognize it and optionally help generate, refine prompts, or write results back.

### Recommended Transport

Use a backend API plus file-backed task outbox:

1. The web app sends a request to a local API route, such as `/api/codex-tasks`.
2. The API route writes a structured JSON task into the project workspace.
3. Codex reads the task file from the repository and acts on it when asked or when the user points to it.

This is preferred over direct browser storage because Codex can reliably access project files, while browser IndexedDB/localStorage is awkward to inspect from the coding environment.

### Task Record Shape

The exact schema can be finalized later, but each task should include:

- Task ID.
- Task type: `code-change` or `image-generation`.
- Created timestamp.
- Source canvas context: selected shape IDs, version IDs, annotation IDs, prompt, dimensions, and resolution preset.
- User instruction.
- Status: `queued`, `in-progress`, `completed`, `failed`, or `cancelled`.
- Result links or generated asset references when available.

### Result Handling

Codex-generated image results should be able to re-enter the same image version system used by web-generated results. Metadata should record the generation source, for example `source: "codex"` or `source: "web"`.

## Feature Area 4: Slicing

Slicing is a good 2.0 candidate if the product is used for advertising, ecommerce, social content, or asset production.

Possible slicing workflow:

1. Select a generated image.
2. Create one or more slice regions.
3. Choose output presets such as square post, story, banner, avatar, or custom dimensions.
4. Export slices as image assets.
5. Optionally place exported slices back onto the canvas as separate versioned assets.

The slicing workflow pairs naturally with 2K and 4K generation because high-resolution source images give users more usable crop area.

## Feature Area 5: Video Model Exploration

Video generation is promising but should remain exploratory for now.

Potential entry point:

- Select a generated image version.
- Choose "Animate image" or "Generate video from this version".
- Provide motion instructions, duration, and aspect ratio.

Open questions before implementation:

- Which video provider/model should be supported first?
- Does the model accept a source image as first frame?
- How should long-running jobs be tracked?
- Where should video assets be stored?
- How should cost, retry, and failure states be shown?

Because video introduces a different asset type and likely async job polling, it should not block the 2.0 core image workflow.

## Architecture Notes

2.0 should extend existing boundaries instead of replacing them:

- `AiCanvas` remains the main tldraw orchestration layer.
- `GenerationPanel` gains resolution controls and maybe batch/multi-annotation entry points.
- `/api/images/generate` becomes provider-capability aware.
- A new Codex task route can own structured task creation.
- A new slicing module can handle crop math and asset export.

The current metadata-driven approach should continue. New fields should be added to shape, asset, and version metadata instead of relying on visible text.

## Testing Strategy

Minimum coverage should include:

- Resolution preset normalization and provider request mapping.
- Multi-annotation selection validation and prompt composition.
- Codex task schema validation and file writing.
- Slice rectangle normalization and exported asset sizing.
- Regression coverage proving the original single-holder and single-annotation paths still work.

## Open Decisions

- Whether unsupported 4K should downgrade with a warning or fail explicitly.
- Exact resolution mapping per provider and model.
- Whether multi-annotation generation is triggered by multi-select annotations or by selecting the source image.
- Whether slicing exports only to files or also creates canvas nodes.
- Whether Codex image generation writes results directly into canvas assets in 2.0 or only records a task/result contract.
- Whether video belongs in 2.0 as a disabled experimental entry or a 2.1 milestone.
