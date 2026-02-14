#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="docker/identity/certs"
mkdir -p "${CERT_DIR}"

openssl req -x509 -nodes -newkey rsa:2048 -keyout "${CERT_DIR}/ca.key" -out "${CERT_DIR}/ca.crt" -days 365 -subj "/CN=nexusforge-local-ca"

for service in gateway auth-service project-service job-service file-service mcp-server incident-service feature-flags worker-python temporal-worker; do
  openssl req -nodes -newkey rsa:2048 -keyout "${CERT_DIR}/${service}.key" -out "${CERT_DIR}/${service}.csr" -subj "/CN=${service}"
  openssl x509 -req -in "${CERT_DIR}/${service}.csr" -CA "${CERT_DIR}/ca.crt" -CAkey "${CERT_DIR}/ca.key" -CAcreateserial -out "${CERT_DIR}/${service}.crt" -days 365
done
