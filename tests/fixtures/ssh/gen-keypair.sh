#!/usr/bin/env bash
# Ephemeral Ed25519 keypair 생성 — 통합 테스트 전용.
# 프로덕션 키 아님. GitHub secret scanning 회피용 prefix 불필요(로컬/CI 생성이라 git에 안 올라감).
# Plan §S4 (remote-fs-transport-m3-m4.md), Critic m-1 반영.
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p keys

if [[ -f keys/id_ed25519 && -f keys/id_ed25519.pub ]]; then
  echo "[gen-keypair] keys already exist → skipping"
  exit 0
fi

# -N ''  (empty passphrase, ssh-agent 위임 없이 CI 자동화)
# -C "markwand-test-fixture" (comment 명시 — 프로덕션 아님 힌트)
ssh-keygen -t ed25519 -N '' -C "markwand-test-fixture" -f keys/id_ed25519

chmod 0600 keys/id_ed25519
chmod 0644 keys/id_ed25519.pub

echo "[gen-keypair] generated keys/id_ed25519{,.pub}"
