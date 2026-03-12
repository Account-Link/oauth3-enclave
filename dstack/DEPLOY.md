# Deploy to a TEE

Deployment on [dstack](https://docs.phala.network/dstack/overview) (Phala CVM).

**We only deploy to STAGING right now. Production is not active.**

## Staging

CVM app ID: `23da7533b60fe6e5f5e30c97f30af5bd7ccdf4df`
URL: https://tee.oauth3-stage.monerolink.com
Orchestrator: https://oauth3-stage.monerolink.com (Vercel)

```bash
# 1. Build & push image (only if proxy code changed)
docker build -t ghcr.io/amiller/oauth3-proxy:latest proxy/
docker push ghcr.io/amiller/oauth3-proxy:latest
# Pin digest (attestation requires exact match):
docker inspect ghcr.io/amiller/oauth3-proxy:latest --format '{{index .RepoDigests 0}}'
# Update dstack/docker-compose.yml oauth3-proxy image with new digest

# 2. Deploy (env-only update doesn't need image rebuild)
phala deploy --cvm-id 23da7533b60fe6e5f5e30c97f30af5bd7ccdf4df \
  -c dstack/docker-compose.yml -e dstack/.env.staging
```

## Files

- `docker-compose.yml` — the ONE compose file, includes ingress + postgres + proxy + ssh
- `.env.staging` — staging secrets (JWT_SECRET shared with Vercel orchestrator)
- `.env.production` — production secrets (not currently used)

## Architecture

dstack-ingress (attested TLS via Cloudflare) → oauth3-proxy → postgres

## Gotchas

- **JWT_SECRET must match** between Vercel (orchestrator) and Phala (proxy) — without it, approval flow breaks silently
- **Volumes persist** across `phala deploy` updates — DB data and certs survive redeploys
- **Only one compose file** — `dstack/docker-compose.yml`. There is no other.
