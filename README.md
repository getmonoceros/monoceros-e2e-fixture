# monoceros-e2e-fixture

Test fixtures for the [Monoceros workbench](https://github.com/getmonoceros/workbench).

This repo is meant to be **cloned into a Monoceros dev-container** as a
known, public, predictable target — so the workbench's repo-clone path
(`monoceros init <name> --with-repo=…`), the Traefik port-routing
(`monoceros add-port`), and the upcoming automated end-to-end tests
all have a real fixture to run against. Public on purpose: an HTTPS
clone of a public repo needs no credentials, so it works in CI and on
a fresh machine without any token setup.

Today it's two probes — a multi-port HTTP server and a postgres
CRUD client — sharing a single `package.json`. The repo name is
deliberately broad so more fixtures can land here as new scenarios
need them.

## `serve-ports.mjs` — multi-port probe server

Several lightweight HTTP servers in one process. Each answers every
path / method with JSON reporting its own port, a label, and the
incoming `Host` header — so with multiple apps running you can tell
without a doubt which port served the request, and whether Traefik
delivered it via hostname routing.

Pure Node stdlib, **no dependencies** — runs in any container with
Node ≥ 18 (which every workbench container has).

### Run it

```sh
npm run serve-ports        # defaults: 3000/api, 5173/frontend, 6006/storybook, 9229/debug
# or directly:
node ./serve-ports.mjs

# custom ports:
node ./serve-ports.mjs 8080 9000

# custom labels (format <port>:<label>):
node ./serve-ports.mjs 3000:api 5173:frontend 6006:storybook 9229:debug
```

### From the workbench

```sh
# Clone this repo into a fresh container at init time:
monoceros init demo --with=node --with-ports=3000,5173,6006,9229 \
  --with-repo=https://github.com/getmonoceros/monoceros-e2e-fixture.git
monoceros apply demo

# Start the probe server inside the container (it landed at
# projects/monoceros-e2e-fixture/):
monoceros run demo -- npm --prefix projects/monoceros-e2e-fixture run serve-ports
```

### Expected response

Every endpoint answers with JSON like:

```json
{
  "success": true,
  "port": 3000,
  "label": "api",
  "method": "GET",
  "path": "/",
  "host": "demo.localhost",
  "timestamp": "2026-05-27T11:42:00.000Z"
}
```

The `host` field shows the HTTP Host header the request arrived with —
useful for verifying that Traefik routed by hostname
(`demo.localhost`, `demo-3000.localhost`, …) rather than via a port
mapping.

### Traefik smoke test

```sh
# In the container:
npm run serve-ports &

# From the host:
monoceros port demo
#   http://demo.localhost          → 3000
#   http://demo-3000.localhost     → 3000
#   http://demo-5173.localhost     → 5173
#   http://demo-6006.localhost     → 6006
#   http://demo-9229.localhost     → 9229

curl -s http://demo.localhost/      | jq .port    # → 3000
curl -s http://demo-5173.localhost/ | jq .port    # → 5173
curl -s http://demo-9229.localhost/ | jq .port    # → 9229
```

## `db-client.mjs` — postgres CRUD probe

Connects to a postgres service, creates a TEMP table, inserts two
rows, selects + verifies them, deletes one, verifies the count, and
exits with `ok` on success or `FAIL: <reason>` on any deviation. Uses
the `pg` driver under the hood so the wire protocol gets exercised
— this is what proves the service is _responsive_, not just listening.

The TEMP table goes away when the connection closes, so the script
is safe to run repeatedly without side effects.

### Connection target

`DATABASE_URL` env var if set, otherwise the Monoceros service-
catalog default:

```
postgresql://monoceros:monoceros@postgres:5432/monoceros
```

That mapping is what `monoceros add-service <name> postgres` provides
in compose-mode containers.

### Run it

```sh
# Inside the workbench container, after `monoceros init … --with=node,postgres`:
npm --prefix projects/monoceros-e2e-fixture ci
npm --prefix projects/monoceros-e2e-fixture run db-client
```

Expected last line on stdout: `ok`. Non-zero exit ⇒ something
between the postgres service and the workspace is broken.

### Used by

The `monoceros-e2e` `with-services` scenario. The TCP-port probe in
that scenario stays in place as a fail-fast baseline; this client
is the substantive proof on top.

## License

Apache-2.0 - see [LICENSE](./LICENSE).
