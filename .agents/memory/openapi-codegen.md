---
name: OpenAPI codegen compatibility
description: Conventions required by this repository's OpenAPI-to-Zod generation.
---

The API contract generator currently targets Zod 3. Avoid `format: uuid` in
OpenAPI schemas because it generates the unsupported `zod.uuid()` call. Keep
runtime UUID validation in route code. For request bodies, prefer reusable
component schemas when possible; inline body schemas can collide with generated
type exports.

**Why:** The repository's generated Zod package is pinned to a Zod 3 runtime
while newer OpenAPI format mappings may emit Zod 4 APIs.

**How to apply:** After changing `lib/api-spec/openapi.yaml`, run the API
codegen command and inspect the generated `lib/api-zod` output before
typechecking.