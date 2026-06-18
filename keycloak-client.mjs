#!/usr/bin/env node
// Keycloak probe for the monoceros-e2e `with-keycloak` scenario.
//
// Proves the full chain that ADR 0025 (deferred service start) exists
// for: the realm.json committed in this fixture was mounted into the
// keycloak service, imported at boot, and a real OIDC auth round-trip
// against it succeeds.
//
// Connection target: `KEYCLOAK_URL` (Monoceros injects it for a curated
// `keycloak` service, ADR 0021). ASSERTED — no hardcoded fallback.
//
// Auth round-trip: client-credentials grant against the imported realm
// `monoceros-e2e` with the confidential client `e2e-probe`. A token back
// means the realm + client were imported and Keycloak is authenticating.
//
// Keycloak boots + imports the realm in the second wave (after the repo
// clone), so it is still starting when this runs — we retry the token
// request until it succeeds or a generous timeout elapses.
//
// Exits 0 with `ok` as the last stdout line, else 1 with `FAIL: …`.

const base = process.env.KEYCLOAK_URL;
if (!base) {
  console.error(
    'FAIL: KEYCLOAK_URL is not set — the workspace did not receive the keycloak connection env.',
  );
  process.exit(1);
}
console.log(`KEYCLOAK_URL=${base}`);

const REALM = 'monoceros-e2e';
const tokenUrl = `${base}/realms/${REALM}/protocol/openid-connect/token`;
const body = new URLSearchParams({
  grant_type: 'client_credentials',
  client_id: 'e2e-probe',
  client_secret: 'e2e-secret',
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEADLINE_MS = 150_000; // Keycloak cold-boot + realm import is slow.
const start = Date.now();
let lastReason = 'no attempt made';

while (Date.now() - start < DEADLINE_MS) {
  try {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (res.ok) {
      const json = await res.json();
      if (json.access_token) {
        console.log(`token received (${res.status}), realm import verified`);
        console.log('ok');
        process.exit(0);
      }
      lastReason = `200 but no access_token: ${JSON.stringify(json).slice(0, 200)}`;
    } else {
      // 404 → realm not imported yet (still booting); 503 → starting.
      lastReason = `HTTP ${res.status}`;
    }
  } catch (err) {
    // Connection refused while Keycloak is still coming up.
    lastReason = err instanceof Error ? err.message : String(err);
  }
  await sleep(2000);
}

console.error(
  `FAIL: no token from ${tokenUrl} within ${DEADLINE_MS / 1000}s (last: ${lastReason})`,
);
process.exit(1);
