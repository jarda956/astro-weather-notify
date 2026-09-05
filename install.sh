#!/usr/bin/env bash
# Installs and starts astro-weather-notify inside a Debian/Ubuntu Proxmox LXC container.
#
# Requirements on the LXC container:
#   - Debian 12 / Ubuntu 22.04+ (unprivileged container works too)
#   - The container needs "nesting" and "keyctl" features enabled for Docker to run:
#       pct set <CTID> --features nesting=1,keyctl=1
#     then reboot the container.
#
# Usage (run inside the LXC container, as root or with sudo):
#   curl -fsSL https://raw.githubusercontent.com/<owner>/astro-weather-notify/main/install.sh | bash
# or, after cloning the repo:
#   ./install.sh

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jarda956/astro-weather-notify.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/astro-weather-notify}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found, installing..."
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -d "$INSTALL_DIR/.git" ]; then
  echo "Cloning repository into $INSTALL_DIR ..."
  git clone "$REPO_URL" "$INSTALL_DIR"
else
  echo "Updating existing checkout in $INSTALL_DIR ..."
  git -C "$INSTALL_DIR" pull
fi

cd "$INSTALL_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(openssl rand -hex 32)
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${SECRET}/" .env
  echo ""
  echo "Created .env with a random JWT_SECRET."
  echo "Edit $INSTALL_DIR/.env to set TELEGRAM_BOT_TOKEN before/after starting, then re-run:"
  echo "  docker compose up -d --build"
  echo ""
fi

docker compose up -d --build

echo ""
echo "astro-weather-notify is running on http://<lxc-ip>:3000"
