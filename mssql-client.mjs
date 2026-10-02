#!/usr/bin/env node
// SQL Server probe for the monoceros-e2e `with-mssql` scenario. A real
// create/insert/select round-trip via the `mssql` driver, deeper than a
// TCP check.
//
// Connection target: `MSSQL_HOST` / `MSSQL_PORT` / `MSSQL_USER` /
// `MSSQL_PASSWORD` / `MSSQL_DB` (Monoceros injects them for a curated `mssql`
// service, ADR 0021). ASSERTED, no hardcoded fallback. `MSSQL_URL` is asserted
// too, but not used: the driver does not take a `sqlserver://` URL.
//
// The image cannot create a database itself; the service healthcheck does it.
// Connecting to `MSSQL_DB` therefore proves that healthcheck ran, so the probe
// retries for a while instead of failing on the first "Cannot open database".
//
// Exits 0 with `ok` as the last stdout line, else 1 with `FAIL: …`.

import sql from 'mssql';

const keys = ['URL', 'HOST', 'PORT', 'USER', 'PASSWORD', 'DB'];
const missing = keys.filter((k) => !process.env[`MSSQL_${k}`]);
if (missing.length > 0) {
  console.error(
    `FAIL: ${missing.map((k) => `MSSQL_${k}`).join(', ')} not set - the workspace did not receive the mssql connection env.`,
  );
  process.exit(1);
}

const config = {
  server: process.env.MSSQL_HOST,
  port: Number(process.env.MSSQL_PORT),
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DB,
  // The server's certificate is self-signed.
  options: { trustServerCertificate: true },
};

let pool;
try {
  let lastErr;
  for (let i = 0; i < 60 && !pool; i++) {
    try {
      pool = await sql.connect(config);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!pool) throw lastErr;
  console.log(`connected to ${process.env.MSSQL_DB}`);

  // #temp table: session-scoped, dropped on disconnect. One batch, because the
  // pool may hand a second request a different session.
  const { recordset: rows } = await pool
    .request()
    .batch(
      "CREATE TABLE #probe_e2e (id INT PRIMARY KEY, msg NVARCHAR(32) NOT NULL); INSERT INTO #probe_e2e (id, msg) VALUES (1, N'hello'), (2, N'world'); SELECT id, msg FROM #probe_e2e ORDER BY id;",
    );
  console.log('inserted 2 rows');
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
  if (pool) await pool.close().catch(() => {});
}
