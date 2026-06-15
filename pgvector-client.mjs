#!/usr/bin/env node
// pgvector probe for the monoceros-e2e `with-pgvector` scenario. Like
// db-client.mjs but additionally proves the `vector` extension works:
// enable it, store an embedding, run a nearest-neighbour query.
//
// Connection target: `PGVECTOR_URL` (Monoceros injects it for a curated
// `pgvector` service, ADR 0021). ASSERTED — no hardcoded fallback.
//
// Exits 0 with `ok` as the last stdout line, else 1 with `FAIL: …`.

import pg from 'pg';

const url = process.env.PGVECTOR_URL;
if (!url) {
  console.error(
    'FAIL: PGVECTOR_URL is not set — the workspace did not receive the pgvector connection env.',
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  console.log('connected');

  await client.query('CREATE EXTENSION IF NOT EXISTS vector');
  console.log('extension vector enabled');

  await client.query(
    'CREATE TEMP TABLE probe_vec (id INT PRIMARY KEY, embedding vector(3))',
  );
  await client.query(
    "INSERT INTO probe_vec (id, embedding) VALUES (1, '[1,0,0]'), (2, '[0,1,0]'), (3, '[0,0,1]')",
  );
  console.log('inserted 3 embeddings');

  // Nearest neighbour to [1,0,0] must be row 1 (distance 0).
  const res = await client.query(
    "SELECT id FROM probe_vec ORDER BY embedding <-> '[1,0,0]' LIMIT 1",
  );
  if (res.rows[0]?.id !== 1) {
    throw new Error(
      `nearest-neighbour expected id 1, got ${JSON.stringify(res.rows[0])}`,
    );
  }
  console.log('nearest-neighbour query verified');

  console.log('ok');
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
} finally {
  try {
    await client.end();
  } catch {
    /* ignore */
  }
}
