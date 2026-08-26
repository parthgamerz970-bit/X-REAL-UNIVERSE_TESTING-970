---
name: Imported artifact registration
description: How to preserve an existing cloned app when the current workspace has not registered its artifact metadata
---

When importing an existing runnable app into a workspace that only knows about scaffold artifacts, register the artifact before relying on managed preview workflows. Preserve the imported source and restore it after bootstrap rather than replacing it with a new scaffold.

**Why:** A copied artifact directory can serve through a manually configured workflow while remaining invisible to the artifact registry, which blocks the normal preview and presentation path.

**How to apply:** Check the artifact list after import; if the app is missing, use the artifact registration flow with the existing slug, keep the generated artifact metadata, restore the app source, and then use the managed workflow.