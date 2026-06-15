#!/usr/bin/env node
// Two-instances-same-engine probe for the monoceros-e2e `with-two-postgres`
// scenario. The real point of ADR 0021: a second postgres added with
// `add-service postgres --as=analytics` must get its OWN connection env,
// distinct from the first instance's — not collide, not be empty.
//
// Connection targets: `POSTGRES_URL` (instance `postgres`) and
// `ANALYTICS_URL` (instance `analytics`). BOTH asserted, and asserted to
// be DISTINCT — if the serializer ever drops connectionEnv again, the
// renamed instance's var goes missing and this fails immediately.
//
// Each instance then does a real round-trip, proving both are
// independently reachable and writable through their own connection env.
//
// Exits 0 with `ok` as the last stdout line, else 1 with `FAIL: …`.

import pg from 'pg';

const primary = process.env.POSTGRES_URL;
const secondary = process.env.ANALYTICS_URL;

if (!primary) {
  console.error('FAIL: POSTGRES_URL is not set — first instance has no env.');
  process.exit(1);
}
if (!secondary) {
  console.error(
    'FAIL: ANALYTICS_URL is not set — the renamed instance got NO connection env. ' +
      'connectionEnv was not serialised per instance (ADR 0021 regression).',
  );
  process.exit(1);
}
if (primary === secondary) {
  console.error(
    `FAIL: POSTGRES_URL and ANALYTICS_URL are identical (${primary}) — ` +
      'the two instances are not distinct.',
  );
  process.exit(1);
}
console.log('both connection envs present and distinct');

async function roundTrip(label, url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      'CREATE TEMP TABLE probe_e2e (id INT PRIMARY KEY, who TEXT NOT NULL)',
    );
    await client.query('INSERT INTO probe_e2e (id, who) VALUES (1, $1)', [
      label,
    ]);
    const { rows } = await client.query('SELECT who FROM probe_e2e WHERE id = 1');
    if (rows.length !== 1 || rows[0].who !== label) {
      throw new Error(`unexpected rows: ${JSON.stringify(rows)}`);
    }
    console.log(`${label}: round-trip ok`);
  } finally {
    await client.end().catch(() => {});
  }
}

try {
  await roundTrip('postgres', primary);
  await roundTrip('analytics', secondary);
  console.log('ok');
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
