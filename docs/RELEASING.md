# Release guide

The owner approved MIT licensing and a public GitHub repository for the initial release. npm publication requires an authenticated publisher account. Never commit credentials or paste them into chat.

## Package and catalog

Pi accepts Git and npm package sources. Its catalog discovers public npm packages carrying the `pi-package` keyword. A public GitHub release is installable but does not itself create an npm catalog listing. See the [official package documentation](https://pi.dev/docs/latest/packages).

The README uses tagged Git installation until the first npm publication. After npm confirms `pi-annotate-electron@0.1.0` is public, replace the pending notice with:

```sh
pi install npm:pi-annotate-electron
```

The launcher can then run without a source checkout:

```sh
npx --yes pi-annotate-electron@0.1.0 \
  --app /absolute/path/to/your-app \
  --entry out/main/index.js \
  --renderer out/renderer/index.html
```

## First-time npm setup

Create a free account at [npm signup](https://www.npmjs.com/signup), verify its email, and configure the account's required authentication. Then, in your terminal:

```sh
npm login
npm whoami
```

Follow npm's prompts locally. Account and authentication requirements are maintained in [npm's publishing documentation](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/).

## Verify release bytes

Use Node 24.22 or later on macOS and Python 3.9 or later for terminal regressions:

```sh
npm ci
PLAYWRIGHT_BROWSERS_PATH=0 ./node_modules/.bin/playwright install chromium --only-shell
npm run build
npm run typecheck
npm run check:package
npm test
npm audit --omit=dev --audit-level=moderate
npm pack --dry-run
```

If npm blocks Electron's dependency installation script, run `node node_modules/electron/install.js` in this checkout. Keep the pinned runtime and synthetic version check aligned. Never weaken the frozen catalog to accept an update.

The archive includes runtime code, fixtures, built sample assets, design resources, selected docs and media. It excludes local Pi sessions, test results and historical plans. `prepare` builds the sample for Git installs; `prepack` builds it for npm archives. Build uses Node's standard library.

Packaged regression tests unpack the actual archive with hoisted dependencies, exercise its executable, verify built files, submit a no-image note and run an owned hidden Electron lifecycle. Also test a clean installation in a private temporary directory. Do not install globally as a release check.

Host SDKs remain peers. Pinned development SDK copies validate isolated tests, not all future host versions. Report actual commands, counts, skips and platform limits in the verification record.

## Media and identity

`npm run demo` captures the actual hidden fictional sample. It needs the project's headless Chromium and an installed `ffmpeg`. It produces `preview.png`, `light.png`, `demo.gif`, `demo.mp4` and the logo comparison. No owner profile or live provider is used.

Focus Note and its two alternatives are original MIT SVGs. Functional third-party icons retain their existing notices and are not repurposed as branding. Preserve canonical resource provenance.

Update version, lockfile, install examples and `pi.image` / `pi.video` tag URLs together. Verify public preview URLs after pushing the tag.

## Publish

With approved scope and a freshly verified release diff:

1. Commit and push release files, preserving unrelated worktree changes.
2. Create and push the matching `v0.1.0` tag. Public visibility requires owner approval, already granted for this initial release.
3. Publish the GitHub release with validation notes, archive and video.
4. With npm authentication available, publish:

   ```sh
   npm publish --access public
   npm view pi-annotate-electron@0.1.0 version license keywords pi --json
   ```

5. Test a private temporary Pi installation from the public tag and, after publication, from npm. Check public media URLs and the catalog after indexing.

npm versions are immutable. Changed source needs a new version after publication. Do not claim catalog availability from a GitHub release or an unverified publish command.
