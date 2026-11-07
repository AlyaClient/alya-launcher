#!/bin/sh

set -e

pnpm tauri build --bundles deb

DEB=$(find src-tauri/target/release/bundle/deb -name "*.deb" | head -1)

if [ -z "$DEB" ]; then
  echo "no deb found, running tauri build..."
  pnpm tauri build --bundles deb
  DEB=$(find src-tauri/target/release/bundle/deb -name "*.deb" | head -1)
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

echo "==> Extracting package data..."
CONTROL_TAR=$(ar t "$DEB" | grep '^control\.tar')
DATA_TAR=$(ar t "$DEB" | grep '^data\.tar')

ar p "$DEB" "$DATA_TAR" | bsdtar -xf - -C "$WORKDIR"
CONTROL=$(ar p "$DEB" "$CONTROL_TAR" | bsdtar -xOf - ./control 2>/dev/null || ar p "$DEB" "$CONTROL_TAR" | bsdtar -xOf - control)

PKGNAME="Alya Launcher"
PKGVER=0.1.2
PKGDESC="Alya Client launcher"
SIZE=$(du -sb "$WORKDIR/usr" | awk '{print $1}')

echo "==> Generating .PKGINFO and .MTREE..."
cat > "$WORKDIR/.PKGINFO" <<EOF
pkgname = $PKGNAME
pkgver = ${PKGVER}-1
pkgdesc = $PKGDESC
url = 
builddate = $(date -u +%s)
packager = Alya Client
arch = x86_64
size = $SIZE
license = GPL-3.0-only
depend = gtk3
depend = hicolor-icon-theme
depend = webkit2gtk-4.1
EOF

PKG="$(dirname "$DEB")/${PKGNAME}-${PKGVER}-1-x86_64.pkg.tar.zst"

echo "==> Creating Arch package..."
(
  cd "$WORKDIR"
  fakeroot -- sh -c '
    bsdtar -czf .MTREE --format=mtree --options="!all,use-set,type,uid,gid,mode,time,size,md5,sha256,link" usr .PKGINFO
    tar --force-local -pcf - usr .PKGINFO .MTREE | zstd -q -T0 -f -o "$1"
  ' _ "$OLDPWD/$PKG"
)

sudo pacman -U "$PKG"
