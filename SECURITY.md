# Static site security surface (minimal)

## Server (nginx + MinIO + Cloudflare)

| Control | Why |
|---------|-----|
| Static GETs only from public vhost | Edge rejects non-GET/HEAD/OPTIONS |
| No cookies / session on marketing host | No auth state to steal |
| TLS at Cloudflare tunnel | Origin stays LAN; no raw MinIO ports public |
| Object keys under `static/…` | No user upload path on this vhost |
| Credentials never in HTML | S3 root only on ops host (`mc` alias) |

## Client (browser)

| Control | Why |
|---------|-----|
| No `eval` / remote script injection | Modules are same-origin `/lib/*` |
| Wallet connect is user-initiated | No silent signing |
| Installer checksum verify path | Optional integrity check before `curl \| bash` |
| `textContent` / escape for chain data | Channel/fund UI avoids raw `innerHTML` of RPC strings where possible |
| Channel list truncated | Caps UI work if REST dumps huge state |
| IBC mesh is canvas-only GLSL | No DOM network graph widgets |

## Intentionally out of scope

- Full CSP headers (add at CF when ready)
- Content-hashed asset names (cache-bust still short-TTL on deploy)

Do not re-introduce: open CORS `*`, topology “doctor” forms that ask for channel params without a signed client, or auto-connect wallet on page load.
