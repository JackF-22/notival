#!/bin/zsh
set -eu
cd "${0:A:h}/.."
APP="$PWD/dist/Margin.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
mkdir -p "$PWD/.build/module-cache"
swiftc -module-cache-path "$PWD/.build/module-cache" native/main.swift -o "$APP/Contents/MacOS/Margin" -framework Cocoa -framework WebKit -framework PDFKit
rm -rf "$APP/Contents/Resources/web"
cp -R web "$APP/Contents/Resources/"
swift -module-cache-path "$PWD/.build/module-cache" scripts/make-icon.swift "$APP/Contents/Resources/MarginIcon.png"
ICONSET="$PWD/.build/Margin.iconset"
mkdir -p "$ICONSET"
for POINTS in 16 32 128 256 512; do
  sips -s format png -z "$POINTS" "$POINTS" "$APP/Contents/Resources/MarginIcon.png" --out "$ICONSET/icon_${POINTS}x${POINTS}.png" >/dev/null
  DOUBLE=$((POINTS * 2))
  sips -s format png -z "$DOUBLE" "$DOUBLE" "$APP/Contents/Resources/MarginIcon.png" --out "$ICONSET/icon_${POINTS}x${POINTS}@2x.png" >/dev/null
done
python3 scripts/make-icns.py "$ICONSET" "$APP/Contents/Resources/Margin.icns"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleInfoDictionaryVersion</key><string>6.0</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleExecutable</key><string>Margin</string><key>CFBundleIdentifier</key><string>local.margin.desktop</string><key>CFBundleName</key><string>Margin</string><key>CFBundleVersion</key><string>8</string><key>CFBundleShortVersionString</key><string>0.7.0</string><key>CFBundleIconFile</key><string>Margin</string><key>NSHighResolutionCapable</key><true/><key>LSMinimumSystemVersion</key><string>13.0</string><key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>Margin capture</string><key>CFBundleURLSchemes</key><array><string>margin</string></array></dict></array></dict></plist>
PLIST
codesign --force --sign - "$APP"
echo "Built $APP"
