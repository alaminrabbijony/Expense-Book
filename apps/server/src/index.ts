import {
  SHARED_SCHEMA_VERSION,
  asMinor,
  formatMoney,
  DEFAULT_CURRENCY,
} from '@et/shared';

console.log(`shared schema version: ${SHARED_SCHEMA_VERSION}`);

const lunch = asMinor(12_50);

console.log(`lunch cost: ${formatMoney(lunch, DEFAULT_CURRENCY)} (stored as ${lunch})`);