#!/usr/bin/env bash
# Works as AWS EC2 user-data, GCP startup-script, or Azure custom-data on any
# Debian/Ubuntu-based image. The wizard (index.html) fills these in for you.
set -e

REPO_URL="__REPO_URL__"

curl -fsSL https://get.docker.com | sh

git clone "$REPO_URL" /opt/cdm
cd /opt/cdm

cat > .env <<'ENVEOF'
__ENV_CONTENTS__
ENVEOF

chmod +x install.sh
./install.sh
