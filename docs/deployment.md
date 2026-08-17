# Deployment

There is no server, no CI, and no release pipeline. "Deploying" means installing this checkout as a global CLI on the user's machine.

## Global install

```bash
npm install -g .        # or: npm run install-global
2pdf --version          # 2.0.0
2pdf document.md
```

`package.json` maps `bin.2pdf` → `./bin/2pdf.js`. The shebang is `#!/usr/bin/env node`.

Uninstall with the **package** name, not the command name:

```bash
npm uninstall -g 2pdf.js
```

## Compile the SCSS before installing

`npm install -g .` links the checkout in place, and the runtime reads `public/assets/styles/pdf.min.css` from that directory. Compiled CSS is gitignored, so a fresh clone installed globally will throw `No CSS file found` on first use. Compile first:

```bash
npx sass assets/styles/pdf.scss public/assets/styles/pdf.css
npx sass assets/styles/pdf.scss public/assets/styles/pdf.min.css --style=compressed
```

## Config resolution after a global install

`ConfigManager` searches, in order: `<install>/2pdf.config`, `<cwd>/2pdf.config`, `<install>/config/2pdf.config`, `<cwd>/config/2pdf.config`. Because the install directory is checked before the caller's `config/` subdirectory, a `config/2pdf.config` in this repo will win over the same path in whatever project the user is running from. Either keep this repo's config out of `config/`, keep per-project configs at the project root as `2pdf.config`, or pass `-c`.

## `package.json` fields that matter for install

- `bin`—the `2pdf` command. Renaming it breaks every user's muscle memory; ask first.
- `engines.node`—declares `>=14.0.0`. Not enforced, and unverified below the current local Node (v22 as of 2026-08-17). Do not raise it casually; do not trust it as tested.
- No `files` allowlist, so `npm pack` includes everything not gitignored—which means the compiled CSS the tool needs is **excluded** from a tarball. Publishing to npm as-is would ship a broken package.

## Publishing

Never published. `repository` points at `github.com/feralcreative/md-to-pdf` while `homepage`, `bugs`, and the config sample point at `feralcreative/2pdf`—the metadata is inconsistent and unverified.

If publishing is ever wanted, it needs at minimum: a `files` allowlist, a prepublish SCSS compile, reconciled repository URLs, and the user's explicit go-ahead. Do not run `npm publish`.
