# Deployment

Updated: 2026-11-20

There is no CI and no release pipeline. 2pdf reaches a machine in one of two ways: as a dependency of another repo, or as a global CLI linked to a checkout. The web version is not deployed anywhere yet; what a host must provide is in [web.md](web.md).

## As a dependency of another repo

```bash
npm install --save-dev github:feralcreative/2pdf#v2.1.0
npx 2pdf docs/report.md --no-open
```

npm clones the tag, packs it by the `files` allowlist in `package.json`, and installs that. 2pdf itself has no lifecycle script and needs no devDependency, because the compiled stylesheet is committed. Pin a tag, not a branch: a branch pin moves only when the lockfile is refreshed, and says nothing about what it holds.

What ships is `bin/`, `src/`, `public/assets/styles/pdf.min.css`, the tracked images, `config/2pdf.config.sample`, `README.md`, `LICENSE`, and `package.json`. `web/`, `test/`, `docs/`, and the SCSS source do not. Check with `npm pack --dry-run` after adding any file the runtime reads.

The package name is `2pdf.js`, so that is the key in the other repo's `package.json` and the name to `require`. The command is `2pdf`.

Puppeteer's `postinstall` downloads Chrome into `~/.cache/puppeteer`, shared by every project on the machine. npm may hold that script for approval (`npm approve-scripts`), and `PUPPETEER_SKIP_DOWNLOAD=1` skips it; either way 2pdf then needs Google Chrome installed in the usual place, or `PUPPETEER_EXECUTABLE_PATH`.

## Releasing a version

1. `npm version <x.y.z> --no-git-tag-version`, commit, and merge to `main`.
2. Tag `main` as `v<x.y.z>` and push the tag. Pushing is User's call.
3. In each repo that uses 2pdf, change the tag in `package.json` and run `npm install`.

## Global install

```bash
npm install
npm install -g .        # or: npm run install-global
2pdf --version
2pdf document.md
```

`npm install -g .` links the checkout in place, so the global `2pdf` is whatever branch the checkout is on, and it needs the checkout's own `node_modules` (hence `npm install` first). `package.json` maps `bin.2pdf` → `./bin/2pdf.js`. The shebang is `#!/usr/bin/env node`.

Uninstall with the **package** name, not the command name:

```bash
npm uninstall -g 2pdf.js
```

## Config resolution

`ConfigManager` searches, in order: `<cwd>/2pdf.config`, `<cwd>/config/2pdf.config`, `<install>/2pdf.config`, `<install>/config/2pdf.config`. The project being rendered wins; the install's config is the fallback, which for the global install means this checkout's. `-c` skips the search.

## `package.json` fields that matter for install

- `bin`—the `2pdf` command. Renaming it breaks every user's muscle memory; ask first.
- `files`—the allowlist of what an installed copy contains. It overrides the root `.gitignore`, so images are listed by name: a directory entry would pack the gitignored logos from this checkout into a local `npm pack`.
- `engines.node`—`>=22`. Not enforced by npm unless the installer sets `engine-strict`.
- No `prepare`, `install`, or `postinstall` script, on purpose. See [decisions.md](decisions.md).

## Publishing

Never published to npm, and not planned. Do not run `npm publish`.
