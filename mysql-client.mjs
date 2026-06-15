#!/usr/bin/env node
// MySQL probe for the monoceros-e2e `with-mysql` scenario. A real
// create/insert/select round-trip via mysql2 — deeper than a TCP check.
//
// Connection target: `MYSQL_URL` (Monoceros injects it for a curated
// `mysql` service, ADR 0021). ASSERTED — no hardcoded fallback.
//
// Exits 0 with `ok` as the last stdout line, else 1 with `FAIL: …`.

import mysql from 'mysql2/promise';

const url = process.env.MYSQL_URL;
if (!url) {
  console.error(
    'FAIL: MYSQL_URL is not set — the workspace did not receive the mysql connection env.',
  );
  process.exit(1);
}

let conn;
try {
  conn = await mysql.createConnection(url);
  console.log('connected');

  // TEMPORARY table: session-scoped, auto-dropped on disconnect.
  await conn.query(
    'CREATE TEMPORARY TABLE probe_e2e (id INT PRIMARY KEY, msg VARCHAR(32) NOT NULL)',
  );
  await conn.query(
    "INSERT INTO probe_e2e (id, msg) VALUES (1, 'hello'), (2, 'world')",
  );
  console.log('inserted 2 rows');

  const [rows] = await conn.query('SELECT id, msg FROM probe_e2e ORDER BY id');
  if (rows.length !== 2 || rows[0].msg !== 'hello' || rows[1].msg !== 'world') {
    throw new Error(`unexpected rows: ${JSON.stringify(rows)}`);
  }
  console.log('selected and verified 2 rows');

  console.log('ok');
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
} finally {
  if (conn) await conn.end().catch(() => {});
}
