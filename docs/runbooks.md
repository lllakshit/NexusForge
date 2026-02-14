# Autonomous Runbooks

## Failed Job Remediation

1. `job-service` publishes `job.completed` with status `failed`.
2. `incident-service` subscription detects failure pattern.
3. Incident service starts `RemediationWorkflow` in Temporal.
4. Temporal activity calls `job-service` internal retry endpoint.
5. Incident service emits `incident.remediated`.

## Policy Denial Investigation

1. Inspect gateway 403 responses and correlation ID.
2. Query OPA decision input/output at `/v1/data/nexusforge/allow`.
3. Validate role claims in JWT and forwarded headers.

## MCP Tool Failure Recovery

1. Replay job timeline in frontend Replay Viewer.
2. Inspect `job-service` logs and `incident-service` incidents.
3. Re-run remediation endpoint: `POST /incidents/{jobId}/remediate`.
