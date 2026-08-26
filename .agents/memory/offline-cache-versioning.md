---
name: Offline cache versioning
description: Service-worker cache identity must advance with shipped UI behavior changes.
---

When a user-facing behavior changes in the offline-first web app, update the service-worker cache identity and its registration query together.

**Why:** A running browser can retain the previous cached bundle even after the dev workflow restarts, making a correct source change appear ineffective.

**How to apply:** Treat cache-name/query updates as part of the same release change as menu, controls, or gameplay fixes, then verify a fresh preview.