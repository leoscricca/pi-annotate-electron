# Pi Annotate Electron

A private Pi package for annotations and bounded frontend UI tools in an explicitly bootstrapped development Electron app. The developer's Pi session owns delivery. The package creates no product agent, authentication store, or model configuration.

## Scope

- macOS development apps, not packaged applications.
- A trusted main entry, a pinned local renderer file, and Electron's default session.
- A private authenticated local socket and Electron's internal debugger API. No public CDP port or process scan.
- Two separate routes: an owned synthetic sample and an attached development app.

The connected app is trusted content. UI snapshots, diagnostics, and requested images can reach the source Pi session. This route does not mask private content. Use only an approved app and profile.

The synthetic route keeps a frozen content catalog and four exact button hover and active paint exceptions. It cannot calibrate itself from an owner app.

## Local setup

Use Node 24.22 or later. Native terminal regressions also require Python 3.9 or later. They use only its standard library and private pseudo-terminals.

```sh
npm ci
PLAYWRIGHT_BROWSERS_PATH=0 ./node_modules/.bin/playwright install chromium --only-shell
npm run build
npm run typecheck
npm run check:package
npm test
```

The headless Chromium install stays inside this project's `node_modules`. Automated checks use isolated test profiles, not the owner's Chrome profile.

All dependencies belong to this directory. No command installs or activates this package in global Pi settings. The host Pi SDK packages are peers. Local development copies support isolated tests only.

The lockfile and overrides keep the tested SDK 1.1.0 family together. They do not replace the host Pi process's SDK. Other SDK versions do not inherit the local test results.

## Activate in one Pi process

Start a fresh Pi process from this directory:

```sh
pi -e ./extensions/annotate-electron.ts
```

Do not load the former host-local extension in the same process. Do not reset or discard a retained cleanup block to force a connection.

## Start a development app with explicit opt-in

First build the target app. In another terminal, start it through the external launcher:

```sh
npm run start:app -- \
  --app /absolute/path/to/app \
  --entry out/main/index.js \
  --renderer out/renderer/index.html
```

The entry and renderer must exist inside the selected app root. The root must contain `package.json`. The launcher refuses application bundles and ASAR archives. An optional `--profile /absolute/profile/directory` selects an explicit profile. The launcher does not remove that profile.

For the package's fictional sample, use `--app` with this directory after `npm run build`. The sample has no product backend or live account operations.

The launcher installs the compatible bridge before the app entry executes. Ordinary app startup stays bridge-free. An already-open app needs an owner-controlled restart through this launcher. Connect never starts, reloads, or restarts an app automatically.

Electron and its helpers use a separate process group and no terminal input. Terminal signals reach the launcher, which requests normal app quit through its private parent channel. The launcher retains that channel until Electron exits. Normal quit joins actual bridge work and cleanup. An unconfirmed cleanup stays blocked. There is no forced-termination deadline.

## Connect and annotate

In the source Pi process, use:

```text
/annotate-electron connect
```

Select the intended verified window with Pi's native chooser. A successful connection activates the picker. No image is the default. Picker readiness and note delivery are separate results.

Use the existing picker to select an element and submit a note. Comments and element facts remain untrusted review input. They grant no source-edit or process authority.

```text
/annotate-electron status
/annotate-electron disconnect
```

Disconnect removes only owned effects. It preserves the app, user state, and retained images. The `close` command also detaches an attached app. Only the owned synthetic route grants child-close authority.

The `electron_ui` tool supplies bounded snapshots, requested screenshots, input, and diagnostics for the selected frontend. It accepts no evaluation, shell command, arbitrary protocol method, or filesystem operation. An input timeout requires actual state inspection before another input.

## Design and evidence

The overlay owns its [canonical token scope](design/DESIGN.md). It does not borrow the target application's palette or modify target styles. Required token exports, seven icons, and licenses accompany the package.

Read the [migration contract](docs/MIGRATION.md), [wire contract](docs/ELECTRON_DEVELOPMENT_UI_PROTOCOL.md), and [verification record](docs/VERIFICATION.md). Historical host results do not validate these package bytes. Historical plans remain in `docs/history`; they do not authorize new work.

The package retains legacy internal identifiers and fictional control names for compatibility. They are not imports of the former host's backend or design implementation.

See [third-party notices](THIRD_PARTY_NOTICES.md) and [LICENSE](LICENSE). The repository is private. No npm publication or global installation forms part of this migration.
