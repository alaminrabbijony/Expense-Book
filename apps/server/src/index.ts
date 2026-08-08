import { SHARED_SCHEMA_VERSION, toMinor, formatMinor } from '@et/shared';

// Layer 1 checkpoint: the shared package resolves across the workspace boundary.
// No Express, no Drizzle yet — those are layer 3.
const lunch = toMinor(12_50);

console.log(`shared schema version: ${SHARED_SCHEMA_VERSION}`);
console.log(`lunch cost: ${formatMinor(lunch)} (stored as ${lunch})`);
