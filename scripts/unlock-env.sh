#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

info()  { echo -e "${GREEN}[unlock-env]${NC} $*"; }
error() { echo -e "${RED}[unlock-env]${NC} $*"; exit 1; }

command -v sops >/dev/null 2>&1 || error "sops no está instalado. Instalalo: https://github.com/getsops/sops#install"
command -v age  >/dev/null 2>&1 || error "age no está instalado. Instalalo: https://github.com/FiloSottile/age#installation"

if ! age-keygen -y ~/.config/sops/age/keys.txt >/dev/null 2>&1; then
  error "No se encontró tu age key en ~/.config/sops/age/keys.txt. Generala con: age-keygen -o ~/.config/sops/age/keys.txt"
fi

decrypt() {
  local enc_file="$1"
  local out_file="${enc_file%.enc.yml}"
  if [ -f "$enc_file" ]; then
    sops decrypt --input-type dotenv --output-type dotenv "$enc_file" > "$out_file"
    info "$out_file"
  else
    info "no encontrado: $enc_file (saltando)"
  fi
}

decrypt "$ROOT/apps/backend/.env.enc.yml"
decrypt "$ROOT/apps/mobile/.env.enc.yml"

info "listo."
