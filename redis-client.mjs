#!/usr/bin/env node
// Redis probe for the monoceros-e2e `with-redis` scenario. A real
// set/get/delete round-trip via node-redis — deeper than a TCP check.
//
// Connection target: `REDIS_URL` (Monoceros injects it for a curated
// `redis` service, ADR 0021). ASSERTED — no hardcoded fallback.
//
// Exits 0 with `ok` as the last stdout line, else 1 with `FAIL: …`.

import { createClient } from 'redis';

const url = process.env.REDIS_URL;
if (!url) {
  console.error(
    'FAIL: REDIS_URL is not set — the workspace did not receive the redis connection env.',
  );
  process.exit(1);
}

const client = createClient({ url });
client.on('error', () => {}); // surfaced via the awaited calls below

try {
  await client.connect();
  console.log('connected');

  const key = 'probe:e2e';
  await client.set(key, 'hello');
  const val = await client.get(key);
  if (val !== 'hello') {
    throw new Error(`GET returned ${JSON.stringify(val)}, expected "hello"`);
  }
  console.log('set and verified key');

  const del = await client.del(key);
  if (del !== 1) {
    throw new Error(`DEL removed ${del}, expected 1`);
  }
  console.log('deleted key');

  console.log('ok');
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
} finally {
  await client.quit().catch(() => {});
}
