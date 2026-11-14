# Publishing a release

1. Raise the number in `VERSION` (1.0.0 → 1.0.1 for fixes, 1.1.0 for new features).
2. Write what changed in `release-notes/<version>.md`.
3. Commit both, then run `zsh scripts/release.sh`.

It builds the app, zips it as `Notival.zip`, packs the VS Code companion as `Notival-Companion.vsix`, tags the commit and creates the GitHub Release. Installed copies offer the update the next time they open.
