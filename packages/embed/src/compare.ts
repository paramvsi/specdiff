// Lazy comparison chunk for the embed (PK-02). Loaded only when `compareWith` is set, so the
// main script stays inside the 250 KB budget: core's comparison engine is large.
import { compareOpenApi, upgradeSpec } from '@specdiff/core';

(globalThis as unknown as { SpecdiffCompare: unknown }).SpecdiffCompare = { compareOpenApi, upgradeSpec };
