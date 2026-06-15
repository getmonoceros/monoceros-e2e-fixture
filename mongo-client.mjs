#!/usr/bin/env node
// MongoDB probe for the monoceros-e2e `with-mongodb` scenario. A real
// insert/find/delete round-trip via the official driver — deeper than a
// TCP check.
//
// Connection target: `MONGODB_URL` (Monoceros injects it for a curated
// `mongodb` service, ADR 0021). ASSERTED — no hardcoded fallback.
//
// Exits 0 with `ok` as the last stdout line, else 1 with `FAIL: …`.

import { MongoClient } from 'mongodb';

const url = process.env.MONGODB_URL;
if (!url) {
  console.error(
    'FAIL: MONGODB_URL is not set — the workspace did not receive the mongodb connection env.',
  );
  process.exit(1);
}

const client = new MongoClient(url);

try {
  await client.connect();
  console.log('connected');

  // The URL targets the seeded DB; use a throwaway collection.
  const col = client.db().collection('probe_e2e');
  await col.deleteMany({}); // idempotent: clear any prior run

  const ins = await col.insertMany([
    { id: 1, msg: 'hello' },
    { id: 2, msg: 'world' },
  ]);
  if (ins.insertedCount !== 2) {
    throw new Error(`insertMany inserted ${ins.insertedCount}, expected 2`);
  }
  console.log('inserted 2 docs');

  const found = await col.findOne({ id: 1 });
  if (found?.msg !== 'hello') {
    throw new Error(`findOne id:1 unexpected: ${JSON.stringify(found)}`);
  }
  console.log('found and verified doc');

  const del = await col.deleteMany({});
  if (del.deletedCount !== 2) {
    throw new Error(`deleteMany removed ${del.deletedCount}, expected 2`);
  }
  console.log('cleaned up');

  console.log('ok');
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
