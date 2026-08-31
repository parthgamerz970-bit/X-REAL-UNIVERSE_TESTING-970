---
name: WebGL preview limitation
description: Distinguishes hosted preview GPU limitations from application-level Three.js failures
---

The hosted screenshot/browser preview can fail to create a WebGL context because its GPU sequence is unavailable. Treat that as an environment limitation when the Three.js code typechecks and the production bundle builds; verify the playable scene on a WebGL-capable device.

**Why:** A direct GameWorld smoke check can show a WebGLRenderer context error before any scene code renders, which is not evidence that procedural geometry or shaders are invalid.

**How to apply:** Keep the normal menu-first flow unchanged, use typecheck/build/workflow logs for automated validation, and report the preview GPU limitation instead of adding an unnecessary gameplay fallback.