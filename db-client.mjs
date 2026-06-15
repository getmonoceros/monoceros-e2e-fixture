#!/usr/bin/env node
// Minimal Postgres probe client used by the monoceros-e2e
// `with-services` scenario. Goes a layer deeper than a TCP-port-open
// check: full CRUD round-trip via the actual postgres wire protocol,
// proving the service is responsive — not just listening.
//
// Self-contained:
//   - Uses a TEMP TABLE so nothing persists in the database. Even if
//     this script is run repeatedly, no cleanup is needed.
//   - Exits 0 on success with `ok` as the last stdout line. Exits 1
//     with `FAIL: <reason>` on any failure.
//
// Connection target:
//   - `POSTGRES_URL` env var, which Monoceros injects into the workspace
//     for a curated `postgres` service (ADR 0021). We deliberately
//     ASSERT it is set instead of falling back to a hardcoded string — a
//     missing/empty connection env is exactly the regression this probe
//     must catch (the old `DATABASE_URL ?? hardcoded` form masked it).

import pg from 'pg';

const url = process.env.POSTGRES_URL;
if (!url) {
  console.error(
    'FAIL: POSTGRES_URL is not set — the workspace did not receive the postgres connection env.',
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  console.log('connected');

  await client.query(
    'CREATE TEMP TABLE probe_e2e (id INT PRIMARY KEY, msg TEXT NOT NULL)',
  );
  console.log('created temp table probe_e2e');

  const ins = await client.query(
    "INSERT INTO probe_e2e (id, msg) VALUES (1, 'hello'), (2, 'world')",
  );
  if (ins.rowCount !== 2) {
    throw new Error(`INSERT affected ${ins.rowCount} rows, expected 2`);
  }
  console.log('inserted 2 rows');

  const sel = await client.query(
    'SELECT id, msg FROM probe_e2e ORDER BY id',
  );
  if (sel.rowCount !== 2) {
    throw new Error(`SELECT returned ${sel.rowCount} rows, expected 2`);
  }
  if (sel.rows[0].id !== 1 || sel.rows[0].msg !== 'hello') {
    throw new Error(`Row 1 unexpected: ${JSON.stringify(sel.rows[0])}`);
  }
  if (sel.rows[1].id !== 2 || sel.rows[1].msg !== 'world') {
    throw new Error(`Row 2 unexpected: ${JSON.stringify(sel.rows[1])}`);
  }
  console.log('selected and verified 2 rows');

  const del = await client.query('DELETE FROM probe_e2e WHERE id = 1');
  if (del.rowCount !== 1) {
    throw new Error(`DELETE affected ${del.rowCount} rows, expected 1`);
  }
  console.log('deleted 1 row');

  const after = await client.query('SELECT COUNT(*)::int AS c FROM probe_e2e');
  if (after.rows[0].c !== 1) {
    throw new Error(`Expected 1 row remaining, got ${after.rows[0].c}`);
  }
  console.log('verified 1 row remains');

  console.log('ok');
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
} finally {
  try {
    await client.end();
  } catch {
    /* ignore — we're exiting anyway */
  }
}
