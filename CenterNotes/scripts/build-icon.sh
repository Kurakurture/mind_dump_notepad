#!/bin/sh
set -eu

SOURCE_ICON=""

if [ -f "icon.png" ]; then
  SOURCE_ICON="icon.png"
elif [ -f "build/icon.png" ]; then
  SOURCE_ICON="build/icon.png"
else
  echo "Put icon.png in the project root or build/icon.png before building."
  exit 1
fi

mkdir -p build/icon.iconset

sips -z 16 16 "$SOURCE_ICON" --out build/icon.iconset/icon_16x16.png >/dev/null
sips -z 32 32 "$SOURCE_ICON" --out build/icon.iconset/icon_16x16@2x.png >/dev/null
sips -z 32 32 "$SOURCE_ICON" --out build/icon.iconset/icon_32x32.png >/dev/null
sips -z 64 64 "$SOURCE_ICON" --out build/icon.iconset/icon_32x32@2x.png >/dev/null
sips -z 128 128 "$SOURCE_ICON" --out build/icon.iconset/icon_128x128.png >/dev/null
sips -z 256 256 "$SOURCE_ICON" --out build/icon.iconset/icon_128x128@2x.png >/dev/null
sips -z 256 256 "$SOURCE_ICON" --out build/icon.iconset/icon_256x256.png >/dev/null
sips -z 512 512 "$SOURCE_ICON" --out build/icon.iconset/icon_256x256@2x.png >/dev/null
sips -z 512 512 "$SOURCE_ICON" --out build/icon.iconset/icon_512x512.png >/dev/null
sips -z 1024 1024 "$SOURCE_ICON" --out build/icon.iconset/icon_512x512@2x.png >/dev/null

iconutil -c icns build/icon.iconset -o build/icon.icns
rm -rf build/icon.iconset

echo "Created build/icon.icns from $SOURCE_ICON"
