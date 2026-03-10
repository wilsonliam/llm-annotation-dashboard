#!/usr/bin/env bash
# Source this file to load API keys into your shell:
#   source source_env.sh

set -a
source "$(dirname "${BASH_SOURCE[0]}")/.env"
set +a

echo "✓ Environment variables loaded from .env"
