# Local SPIFFE Simulation

NexusForge uses environment-based SPIFFE-like identities in development:

- `SERVICE_SPIFFE_ID=spiffe://nexusforge.local/<service>`
- `MTLS_MODE=disabled`

For local certificate testing, generate a self-signed CA and service certificates:

- Linux/macOS: `bash docker/identity/generate-dev-certs.sh`

Generated certs are placed in `docker/identity/certs`.
