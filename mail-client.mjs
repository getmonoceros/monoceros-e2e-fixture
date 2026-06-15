#!/usr/bin/env node
// Mailpit probe for the monoceros-e2e `with-mailpit` scenario. Sends a
// real mail over SMTP and confirms Mailpit accepted it (250), then
// verifies it landed via Mailpit's HTTP API — deeper than a TCP check.
//
// Connection target (Monoceros injects these for a curated `mailpit`
// service, ADR 0021), ASSERTED — no hardcoded fallback:
//   - MAILPIT_HOST — SMTP host (mailpit)
//   - MAILPIT_PORT — SMTP port (1025)
// The web/API port (8025) is fixed by Mailpit and derived here.
//
// Exits 0 with `ok` as the last stdout line, else 1 with `FAIL: …`.

import nodemailer from 'nodemailer';

const host = process.env.MAILPIT_HOST;
const port = process.env.MAILPIT_PORT;
if (!host || !port) {
  console.error(
    'FAIL: MAILPIT_HOST/MAILPIT_PORT not set — the workspace did not receive the mailpit connection env.',
  );
  process.exit(1);
}

const subject = `e2e probe ${Date.now()}`;

try {
  const transport = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: false, // Mailpit speaks plain SMTP on 1025
  });
  const info = await transport.sendMail({
    from: 'probe@e2e.local',
    to: 'inbox@e2e.local',
    subject,
    text: 'hello mailpit',
  });
  if (!info.accepted?.includes('inbox@e2e.local')) {
    throw new Error(`mail not accepted: ${JSON.stringify(info)}`);
  }
  console.log('sent mail (SMTP accepted)');

  // Verify it landed via the Mailpit API (web/API port is 8025).
  const res = await fetch(`http://${host}:8025/api/v1/search?query=${encodeURIComponent('subject:' + subject)}`);
  if (!res.ok) {
    throw new Error(`Mailpit API HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.messages || data.messages.length < 1) {
    throw new Error('sent mail not found via Mailpit API');
  }
  console.log('verified mail via Mailpit API');

  console.log('ok');
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
