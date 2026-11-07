#!/bin/zsh
# Publishes the version in VERSION as a GitHub Release, which every installed Notival picks up as an update.
#   1. Put the new number in VERSION (1.0.0 → 1.0.1 for fixes, 1.1.0 for new features).
#   2. Write what changed in release-notes/<version>.md.
#   3. Commit both, then run:  zsh scripts/release.sh
# It builds the app, zips it as Notival.zip, tags the commit v<version>, and creates the release.
set -eu
cd "${0:A:h}/.."
VERSION=$(tr -d '[:space:]' < VERSION)
TAG="v$VERSION"
NOTES="release-notes/$VERSION.md"
fail(){ print -u2 "release: $1"; exit 1 }

[[ "$VERSION" =~ '^[0-9]+\.[0-9]+\.[0-9]+$' ]] || fail "VERSION should look like 1.2.3 (it says '$VERSION')."
[[ -f "$NOTES" ]] || fail "write the release notes first: $NOTES"
[[ -z "$(git status --porcelain)" ]] || fail "commit your changes first, so the release matches what's on GitHub."
command -v gh >/dev/null || fail "install the GitHub CLI: https://cli.github.com"
gh auth status -h github.com >/dev/null 2>&1 || fail "sign in first: gh auth login -h github.com"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && fail "$TAG already exists. Raise the number in VERSION."
gh release view "$TAG" >/dev/null 2>&1 && fail "a release called $TAG already exists on GitHub."

print "Building Notival $VERSION…"
zsh scripts/build.sh >/dev/null
BUILT=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" dist/Notival.app/Contents/Info.plist)
[[ "$BUILT" == "$VERSION" ]] || fail "the app says $BUILT, expected $VERSION."
rm -f dist/Notival.zip
ditto -c -k --keepParent dist/Notival.app dist/Notival.zip

print "Publishing $TAG…"
git push origin HEAD
git tag -a "$TAG" -m "Notival $VERSION"
git push origin "$TAG"
gh release create "$TAG" dist/Notival.zip --title "Notival $VERSION" --notes-file "$NOTES" --latest
print "Done: $(gh release view "$TAG" --json url --jq .url)"
print "Installed copies will offer the update the next time they open."
