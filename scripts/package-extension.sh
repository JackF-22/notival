#!/bin/zsh
# Packs the VS Code companion (extension/) into dist/Notival-Companion.vsix, ready for:
#   code --install-extension dist/Notival-Companion.vsix
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
python3 - <<'PY'
import json, zipfile, glob
pkg = json.load(open('extension/package.json'))
manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="{pkg['name']}" Version="{pkg['version']}" Publisher="{pkg['publisher']}" />
    <DisplayName>{pkg['displayName']}</DisplayName>
    <Description xml:space="preserve">{pkg['description']}</Description>
    <Categories>Notebooks,Education,Other</Categories><Tags>notes,notebook,study</Tags>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" /><Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/icon.png" Addressable="true" /><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" /></Assets>
</PackageManifest>'''
types = '''<?xml version="1.0" encoding="utf-8"?>
<Types><Default Extension=".json" ContentType="application/json"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".vsixmanifest" ContentType="text/xml"/><Default Extension=".png" ContentType="image/png"/><Default Extension=".md" ContentType="text/markdown"/></Types>'''
with zipfile.ZipFile('dist/Notival-Companion.vsix', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', types)
    z.writestr('extension.vsixmanifest', manifest)
    for f in ['extension/package.json','extension/extension.js','extension/icon.png','extension/README.md'] + sorted(glob.glob('extension/walkthrough/*.md')):
        z.write(f, f)
PY
echo "Built dist/Notival-Companion.vsix"
