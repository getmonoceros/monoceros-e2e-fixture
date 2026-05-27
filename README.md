# monoceros-e2e-fixture

Test fixtures for the [Monoceros workbench](https://github.com/getmonoceros/workbench).

This repo is meant to be **cloned into a Monoceros dev-container** as a
known, public, predictable target — so the workbench's repo-clone path
(`monoceros init <name> --with-repo=…`), the Traefik port-routing
(`monoceros add-port`), and the upcoming automated end-to-end tests
all have a real fixture to run against. Public on purpose: an HTTPS
clone of a public repo needs no credentials, so it works in CI and on
a fresh machine without any token setup.

Today it's a single port-probe server; the name is deliberately broad
so more fixtures can land here later.

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

## License

MIT — see [LICENSE](./LICENSE).
