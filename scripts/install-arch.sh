#!/bin/sh

set -e

# deno task tauri build

DEB=$(find src-tauri/target/release/bundle/deb -name "*.deb" | head -1)

if [ -z "$DEB" ]; then
  echo "no deb found, running tauri build..."
  cargo tauri build --bundles deb
  DEB=$(find src-tauri/target/release/bundle/deb -name "*.deb" | head -1)
fi

printf "Alya Client\nGPL-3\nNYA\n" | debtap "$DEB"

PKG=$(find src-tauri/target/release/bundle/deb -name "*.pkg.tar.zst" | head -1)

sudo pacman -U --nodeps --nodeps "$PKG"
