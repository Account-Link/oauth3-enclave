# Security Model

OAuth3 Enclave runs inside a [dstack](https://docs.phala.network/dstack/overview) Confidential VM (CVM) on Intel TDX hardware. This document explains where secrets are stored, how they're protected, and under what conditions they can be lost.

## Data at rest

All Docker volumes inside the CVM sit on a **LUKS2-encrypted disk**:

- **Cipher:** AES-XTS-plain64, 512-bit key
- **KDF:** PBKDF2 with SHA256
- **Filesystem:** ZFS on the encrypted device
- **Key source:** derived from dstack KMS, tied to TDX attestation measurements

The disk encryption key (`disk_crypt_key`) is provisioned automatically at CVM boot. The KMS only releases the key after validating the TDX attestation quote — proving the correct code is running on genuine TEE hardware. The operator never sees this key.

The key is derived deterministically via HKDF-SHA256:
```
disk_crypt_key = HKDF(KMS_root_key, [app_id || instance_id || "app-disk-crypt-key"])
```

The `instance_id` includes a random seed generated once per CVM instance and persisted locally. This means:

- **Same CVM restarting or upgrading:** same seed → same key → data survives
- **Different CVM with same app_id:** different seed → different key → **cannot read the other's data**
- **No key migration or export:** there is no mechanism to share disk keys between instances

This is single-instance durability, not replicated storage. User secrets are bound to the specific CVM instance.

**Reference:** `dstack/dstack-util/src/system_setup.rs` (`luks_setup()`, `mount_data_disk()`), `dstack/kms/src/main_service.rs` (key derivation)

## What is stored where

### SQLite (`/data/proxy.db` — encrypted volume `oauth3-data`)

| Table | Contents | Sensitivity |
|---|---|---|
| `secrets` | User-submitted credentials (API keys, cookies), scoped by `owner_id` | **High** — plaintext within the app, encrypted at rest by LUKS2 |
| `sessions` | Session state, bearer tokens, expiry, policies | **High** — bearer tokens grant invoke access |
| `capabilities` | Capability code, signatures, spec hashes | Medium — defines what each permit can do |
| `kv_store` | Persistent key-value state for custom capabilities | Medium — application data |
| `execution_requests` | Pending/completed execution records | Low |
| `scope_grants` | Approved scope grants per session | Low |

### Postgres (`pgdata` volume — encrypted by same LUKS2 disk)

Stores **audit logs only** — execution history, session metadata, scope grant records. No secrets. Writes are fire-and-forget and never block the main flow.

### Environment variables (set at deploy time)

| Variable | Purpose | Who can see it |
|---|---|---|
| `JWT_SECRET` | HMAC-SHA256 key for signing/verifying JWTs | Operator (deploy-time env var) |
| `PG_PASSWORD` | Internal Postgres password (container-to-container) | Operator (deploy-time env var) |
| `ANTHROPIC_API_KEY` | For LLM-drafted capability specs | Operator (deploy-time env var) |
| `CLOUDFLARE_API_TOKEN` | TLS certificate provisioning via DNS-01 | Operator (deploy-time env var) |

## Authentication tokens

| Token | Issued by | Lifetime | Purpose |
|---|---|---|---|
| Owner JWT | Orchestrator or enclave | 1 year | Manage secrets, approve permits |
| Agent JWT | Orchestrator or enclave | 24 hours | Request permits, execute code |
| Bearer token | Enclave (at approval) | 1 year (custom) / 30 min (standard) | Direct capability invocation via `/invoke` |
| API key | Orchestrator | Indefinite | Tenant identity for orchestrator endpoints |
| Magic link | Orchestrator | 15 minutes | Email-based login |

Callers of `/invoke` use bearer tokens — no JWT knowledge required.

## Data loss scenarios

| Event | User secrets | Audit logs | Recovery |
|---|---|---|---|
| `phala deploy` (upgrade) | **Survives** — volumes persist | **Survives** | None needed |
| Container crash + restart | **Survives** — Docker restart policy | **Survives** | Automatic |
| `phala cvms create` (new CVM) | **Lost** — new volumes | **Lost** | Must recreate permits and re-submit secrets |
| CVM host migration | **Lost** — volumes don't migrate | **Lost** | Must recreate |

## Trust boundaries

```
┌─────────────────────────────────────────────────┐
│  CVM (Intel TDX)                                │
│                                                 │
│  ┌─────────────┐  ┌──────────┐  ┌───────────┐  │
│  │ oauth3-proxy│  │ postgres │  │  browser   │  │
│  │ (secrets,   │  │ (audit   │  │ (Playwright│  │
│  │  sessions,  │  │  logs)   │  │  + VPN)    │  │
│  │  execution) │  │          │  │            │  │
│  └──────┬──────┘  └──────────┘  └───────────┘  │
│         │                                       │
│  ┌──────┴──────────────────────────────────┐    │
│  │  LUKS2-encrypted ZFS volume             │    │
│  │  Key: disk_crypt_key from KMS           │    │
│  │  (tied to TDX attestation)              │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  dstack-ingress (attested TLS)                  │
└─────────────────────────────────────────────────┘
         │
    TLS (Cloudflare DNS-01 cert)
         │
┌────────┴────────┐          ┌──────────────────┐
│  Orchestrator   │          │  Agent / Browser  │
│  (Vercel)       │          │  (untrusted)      │
│  - signup       │          │                   │
│  - rate limits  │          │                   │
│  - dashboard    │          │                   │
│  NEVER sees     │          │                   │
│  user secrets   │          │                   │
└─────────────────┘          └──────────────────┘
```

**The orchestrator is untrusted.** It handles tenant signup, rate limiting, and serves the approval UI — but all secret submission and capability execution goes directly to the enclave. The orchestrator never sees user secrets.

**The operator** controls what code runs in the CVM (via docker-compose) and can set environment variables. See "Known limitations" below.

## Known limitations (Stage 0)

These are gaps that must be closed for [Stage 1 (Dev-Proof)](https://draftv4.erc733.org):

1. **`JWT_SECRET` is operator-supplied** — the operator could issue owner tokens for any tenant. Should be derived from `DeriveKey("/app/jwt-secret")` so it's TEE-bound.

2. **No on-chain transparency log** — no public record of what code version was deployed when. Should use Base KMS with DEPLOYMENTS.md tracking compose hashes and on-chain TX links.

3. **Docker images not pinned by digest in CI** — images are pinned in docker-compose.yml by `@sha256:`, but builds are not reproducible (no `SOURCE_DATE_EPOCH`, base images not pinned).

4. **Configurable URLs** — `ORCHESTRATOR_URL`, `PUBLIC_URL`, `CORS_ORIGIN` are operator-controlled env vars. A malicious operator could point these at attacker infrastructure.

5. **Dev fallback in auth.ts** — when `JWT_SECRET` is empty, auth is disabled entirely (open access). This should not be possible in production.

## Attestation

The CVM's TDX attestation quote can be fetched from the metadata endpoint:

```bash
curl https://23da7533b60fe6e5f5e30c97f30af5bd7ccdf4df-8090.dstack-pha-prod9.phala.network/
```

This returns `tcb_info` including the `compose_hash` — a SHA256 of the app configuration (docker-compose + allowed env vars). Third parties can verify this against the source code without needing account access.

Visual verification: https://trust.phala.com/app/23da7533b60fe6e5f5e30c97f30af5bd7ccdf4df
