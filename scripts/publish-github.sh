#!/bin/zsh
# Run locally after signing in with gh auth login -h github.com.
set -eu
cd "${0:A:h}/.."
command -v gh >/dev/null || { print 'Install GitHub CLI first: https://cli.github.com'; exit 1; }
gh auth status -h github.com >/dev/null 2>&1 || { print 'First run: gh auth login -h github.com'; exit 1; }
owner=$(gh api user --jq .login)
repository="$owner/notival"
if git remote get-url origin >/dev/null 2>&1; then
  existing_origin=$(git remote get-url origin)
  if [[ "$existing_origin" == "https://github.com/$owner/margin.git" || "$existing_origin" == "git@github.com:$owner/margin.git" ]]; then
    repository="$owner/margin"
  fi
fi
if [[ ! -d .git ]]; then
  if gh repo view "$repository" >/dev/null 2>&1; then
    print "A repository named $repository already exists. Nothing was pushed. Choose another repository name or connect the intended remote first."
    exit 1
  fi
  git init -b main
fi
if git remote get-url origin >/dev/null 2>&1; then
  remote_url=$(git remote get-url origin)
  if [[ "$remote_url" != "https://github.com/$repository.git" && "$remote_url" != "https://github.com/$repository" && "$remote_url" != "git@github.com:$repository.git" ]]; then
    print "Origin points to a different repository: $remote_url. Nothing was pushed."
    exit 1
  fi
  [[ "$(gh repo view "$repository" --json visibility --jq .visibility)" == PRIVATE ]] || { print 'This script only pushes to a private repository.'; exit 1; }
fi
git add .gitignore README.md docs native web extension scripts tests
if ! git diff --cached --quiet; then
  git commit -m "Rebrand Margin as Notival with a new app identity"
fi
if git remote get-url origin >/dev/null 2>&1; then
  git push -u origin HEAD
else
  gh repo create "$repository" --private --source=. --remote=origin --push --description 'Notival: a local macOS notebook for subjects, units, study materials, test packs, and synthesis.'
fi
print "Ready: https://github.com/$repository"
