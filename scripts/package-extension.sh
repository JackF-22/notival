#!/bin/zsh
# Packs the VS Code companion (extension/) into dist/Notival-Companion.vsix, ready for:
#   code --install-extension dist/Notival-Companion.vsix
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
python3 - <<'PY'
import json, zipfile
pkg = json.load(open('extension/package.json'))
manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="{pkg['name']}" Version="{pkg['version']}" Publisher="{pkg['publisher']}" />
    <DisplayName>{pkg['displayName']}</DisplayName>
    <Description xml:space="preserve">{pkg['description']}</Description>
    <Categories>Other</Categories>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" /></Assets>
</PackageManifest>'''
types = '''<?xml version="1.0" encoding="utf-8"?>
<Types><Default Extension=".json" ContentType="application/json"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".vsixmanifest" ContentType="text/xml"/></Types>'''
with zipfile.ZipFile('dist/Notival-Companion.vsix', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', types)
    z.writestr('extension.vsixmanifest', manifest)
    z.write('extension/package.json', 'extension/package.json')
    z.write('extension/extension.js', 'extension/extension.js')
PY
echo "Built dist/Notival-Companion.vsix"
