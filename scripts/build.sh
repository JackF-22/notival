#!/bin/zsh
set -eu
cd "${0:A:h}/.."
APP="$PWD/dist/Notival.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
mkdir -p "$PWD/.build/module-cache"
swiftc -module-cache-path "$PWD/.build/module-cache" native/main.swift native/canvas.swift native/pdf_find.swift native/export.swift native/updater.swift native/listening.swift native/markdown.swift -o "$APP/Contents/MacOS/Notival" -framework Cocoa -framework WebKit -framework PDFKit -framework AVFoundation -framework Speech
rm -rf "$APP/Contents/Resources/web"
cp -R web "$APP/Contents/Resources/"
cp native/latex_ocr.py "$APP/Contents/Resources/latex_ocr.py"
cp scripts/setup-latex-ocr.sh "$APP/Contents/Resources/setup-latex-ocr.sh"
swift -module-cache-path "$PWD/.build/module-cache" scripts/make-icon.swift "$APP/Contents/Resources/NotivalIcon.png"
ICONSET="$PWD/.build/Notival.iconset"
mkdir -p "$ICONSET"
for POINTS in 16 32 128 256 512; do
  sips -s format png -z "$POINTS" "$POINTS" "$APP/Contents/Resources/NotivalIcon.png" --out "$ICONSET/icon_${POINTS}x${POINTS}.png" >/dev/null
  DOUBLE=$((POINTS * 2))
  sips -s format png -z "$DOUBLE" "$DOUBLE" "$APP/Contents/Resources/NotivalIcon.png" --out "$ICONSET/icon_${POINTS}x${POINTS}@2x.png" >/dev/null
done
python3 scripts/make-icns.py "$ICONSET" "$APP/Contents/Resources/Notival.icns"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleInfoDictionaryVersion</key><string>6.0</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleExecutable</key><string>Notival</string><key>CFBundleIdentifier</key><string>local.margin.desktop</string><key>CFBundleName</key><string>Notival</string><key>CFBundleVersion</key><string>10</string><key>CFBundleShortVersionString</key><string>0.9.0</string><key>CFBundleIconFile</key><string>Notival</string><key>NSSpeechRecognitionUsageDescription</key><string>Notival drafts the words in a voice message you add, so you can practise listening and check yourself.</string><key>NSHighResolutionCapable</key><true/><key>LSMinimumSystemVersion</key><string>13.0</string><key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>Notival capture</string><key>CFBundleURLSchemes</key><array><string>notival</string><string>margin</string></array></dict></array></dict></plist>
PLIST
# The version people see (About, updates) comes from VERSION; NOTIVAL_VERSION overrides it for test builds.
VERSION="${NOTIVAL_VERSION:-$(tr -d '[:space:]' < VERSION)}"
BUILD_NUMBER=$(print -r -- "$VERSION" | awk -F. '{printf "%d", ($1*10000)+($2*100)+$3}')
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" -c "Set :CFBundleVersion $BUILD_NUMBER" "$APP/Contents/Info.plist"
codesign --force --sign - "$APP"
echo "Built $APP"
