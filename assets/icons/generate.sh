#!/usr/bin/env bash
# Genera los iconos PNG necesarios desde icon.svg.
# Requiere ImageMagick (magick) o rsvg-convert.
# Uso:
#   cd assets/icons
#   bash generate.sh

set -euo pipefail
cd "$(dirname "$0")"

if ! command -v magick >/dev/null 2>&1; then
  echo "[!] ImageMagick no encontrado. Instala con:"
  echo "    Windows:  winget install ImageMagick.ImageMagick"
  echo "    macOS:    brew install imagemagick"
  echo "    Linux:    sudo apt install imagemagick"
  exit 1
fi

echo "[*] Generando iconos PNG desde icon.svg ..."

magick -background none icon.svg -resize 192x192 icon-192.png
magick -background none icon.svg -resize 512x512 icon-512.png

# Maskable: padding del 12% para safe-area (Android adaptive icons)
magick -background "#0a0a0a" icon.svg -resize 410x410 \
       -gravity center -extent 512x512 icon-maskable-512.png

# Apple touch
magick -background "#0a0a0a" icon.svg -resize 180x180 \
       -gravity center -extent 180x180 apple-touch-icon.png

# Favicon
magick -background none icon.svg -resize 32x32 favicon-32.png
magick -background none icon.svg -resize 16x16 favicon-16.png
magick favicon-16.png favicon-32.png favicon.ico

# OpenGraph (1200x630)
magick -background "#0a0a0a" og.svg -resize 1200x630 og.png

echo "[OK] Iconos generados:"
ls -lh *.png *.ico 2>/dev/null
