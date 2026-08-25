---
name: Workspace package installs
description: A package-management caveat for this pnpm workspace
---

Artifact-specific JavaScript dependencies should be added with a package filter rather than the generic language-package installer.

**Why:** The generic installer targets the workspace root in this monorepo and can stop at the pnpm workspace-root safety check, while the app package needs its own dependency declaration.

**How to apply:** Use a filtered pnpm add for the target artifact package, then run that artifact's typecheck and its workflow-aware build check.