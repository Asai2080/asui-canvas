# Canvas Generation State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-canvas scan animation while image generation is running.

**Architecture:** Track the shape currently associated with an async generation task in `AiCanvas`. Render a React overlay positioned from the target shape's tldraw page bounds converted into viewport coordinates. Keep the overlay outside the tldraw document so it does not affect exports, selections, metadata, or saved canvas state.

**Tech Stack:** Next.js App Router, React 19, tldraw `Editor`, TypeScript, CSS animations, Vitest/ESLint.

---

### Task 1: Add The Overlay Component

**Files:**
- Create: `src/components/canvas/canvas-generation-status-overlay.tsx`
- Modify: `src/app/globals.css`

- [x] Create a component that receives viewport bounds and renders the supplied diagonal scan SVG centered over the target node.
- [x] Add CSS for the translucent state layer, label, and reduced-motion behavior.

### Task 2: Track Generation Target In AiCanvas

**Files:**
- Modify: `src/components/canvas/ai-canvas.tsx`

- [x] Add `generationOverlay` state containing target shape id, viewport bounds, and label.
- [x] Add helpers to open, refresh, and clear the overlay.
- [x] Refresh overlay position through the existing editor store listener.

### Task 3: Wire Existing Generation Paths

**Files:**
- Modify: `src/components/canvas/ai-canvas.tsx`

- [x] Show overlay on the selected holder during `fillHolder`.
- [x] Show overlay on the source image during `editFromAnnotation`.
- [x] Show overlay on the source image during `editFromAllAnnotations`.
- [x] Clear overlay in all success and error paths.

### Task 4: Verify

**Files:**
- Modify: `docs/iterations/2.1-plan.md`

- [x] Run `npm run lint`.
- [x] Run targeted tests for image and canvas helpers if touched.
- [x] Update the 2.1 progress log with the completed P0 status.
