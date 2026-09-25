# dsh-session-suspend

A lightweight DSH web plugin: park a session with a natural-language note in the
conversation, and the matching session in the left sidebar is highlighted and
shows the reminder on hover.

Single-purpose, no runtime dependencies, no build step — two source files
(host face + browser face).

[中文说明](README.zh.md)

## What it does

| Where | What you see |
| --- | --- |
| Left sidebar | Parked session rows are painted with a **style preset** (default: left bar; also row tint / leading dot / title color / bottom line / glow — 7 styles) |
| Hovering a highlighted row | A card **below** the row: `Parked` + time + the note verbatim + `Open` / `Clear` |
| Sidebar footer | `⏰ Parked N` button opening the parked list (title / note / time / open / clear); the gear opens **Style settings** |
| Sidebar collapsed | A dot on the expand button, meaning something is parked |
| Session page header | `📌 Park note` button to write / edit / clear the current session's note by hand |
| Hovering any session row | A pin button next to the official `…`, to write a note for **that** session |
| **Folded workspace** | A count on the right of the workspace row while it is folded, telling you how many sessions inside it are parked. It disappears when you expand — the sessions are in front of you, so the number would be redundant |
| Parked list | Every row is rendered with **its own** style preset, exactly like the sidebar; the parked time sits in a subtle filled chip instead of blending into the background |
| **Official settings page** | A `Parked Sessions` entry in DSH's own Settings navigation, opening the **same** preference editor as the panel gear |
| **Slash commands** | `/suspend <note>`, `/suspended`, `/resume` right in the composer — no model round-trip |

> The hover card deliberately sits **below** the row: DSH itself draws a session
> status card to the right of the row (`left = row right + 8`, 244px wide,
> z-index 100). Placing ours to the right would cover it and block the pointer
> path, so the official card would vanish after its 200ms grace. Staying inside
> the 200px sidebar band lets both cards coexist.
>
> The position is configurable — right of the official card, or below-left of it
> — and it never slides after being drawn (see *Tooltip placement* below).
>
> The last two rows above, plus the master switch in *Style settings*, are all
> on by default and can each be turned off there.

## Style presets

The preference editor has two entrances with identical content (one
`presets.json`; a change in either place takes effect immediately):

- Sidebar footer → gear → **Style settings**
- **Official settings page**: Settings navigation → **Parked Sessions** (DSH's own
  Settings window — no need to open the sidebar panel first)

Editor contents:

- **Ask for a style when parking** (master switch, on by default): on, every park
  opens a dropdown of your presets; off, the default preset is used.
- **Preset list**: name / style / color / strength (5%–100%); add, edit, delete;
  up to 12 presets.
- Three built-in presets: *Default* (left bar, amber), *Waiting* (row tint 16%,
  blue), *Later* (leading dot, violet). Their names follow the UI language; once
  you rename one, your name wins.
- A natural-language park can also name one: `suspend_session` takes a
  `preset_id` argument (`list_suspended` lists the available ids).
- **Count on folded workspaces** (on by default): shows how many sessions in a
  workspace are parked, on the workspace row, only while it is folded. The badge
  is *removed from the DOM* on expand rather than hidden with CSS, so the row's
  hover and click geometry stays honest.
- **Style presets in the list** (on by default): every parked-list row also
  carries that session's preset. Off, the list degrades to plain text and every
  row looks the same.
- **Time chip** (on by default): wraps the parked time in a subtle filled chip
  (8px radius). Off, it is plain text.

### Where the folded-workspace count comes from

There is a real trap here worth recording. DSH's workspace grouping — the UI
calls it 工作区 — renders **no session rows at all while it is folded**
(`deriveGroups` maps `sessions: expanded ? … : []`). So the DOM contains zero
members when folded, and the count simply cannot be derived from it.

The plugin goes the other way: it takes the workspace membership from the global
`useWorkspaces` hook and intersects it with the parked notes, then stamps the
already-computed number onto the folded row. The workspace row itself carries no
id, so the row-to-workspace correspondence also comes from its React fiber's
`group`, not from the DOM.


### Theme adaptation

The plugin hard-codes no color; everything goes through DSH design tokens, so
light and dark themes are followed automatically:

- Tokens live on `body` (not `:root`), and the dark variant selector is
  `body[data-ds-dark-theme]` (light = that attribute absent). The plugin
  overrides with the same selector and **not** with a `prefers-color-scheme`
  media query, because the theme preference is user-chosen and can differ from
  the OS.
- The amber badge uses `state-warn-primary` fill (amber-500, same value in both
  themes) + `neutral-1000` text, about 9.8:1 contrast. The official
  `state-warn-tertiary` fill + `state-warn-label` text is only about 2.5:1 in
  light mode — that is the root cause of "not prominent enough".
- Native `<select>` / color inputs declare `color-scheme` explicitly (DSH does
  not, which is how the official agent-team owner dropdown ends up unreadable),
  with an opaque token background + `appearance:none`.
- Every `var(--dsw-*)` carries a literal fallback, so nothing renders unreadable
  before the theme stylesheet mounts.

## Usage

### Natural language (the main way)

Just say it in the conversation and the model calls `suspend_session`. Both
languages trigger it:

- "这个会话先挂起，晚点再继续"
- "挂起：等对方回复后再继续"
- "这事先放着，下午回来接着弄"
- "park this, remind me later"
- "suspend this session until the build finishes"
- "hold this, I will be back tonight"

When it is done, say "这事结了 / 取消挂起 / done, unpark / clear the reminder"
to call `resume_session`; ask "我还有哪些事没做完 / what is still parked?" to
call `list_suspended`.

### Slash commands (no model round-trip)

Type a slash in the composer and DSH's command discovery lists this plugin's
three registrations:

| Command | What it does |
| --- | --- |
| `/suspend <note>` | Parks the **current** session; an empty note prints the usage |
| `/suspended` | Lists every parked session (note + time, newest first) — the same data as the `list_suspended` tool |
| `/resume` | Unparks the current session; says so plainly when nothing was parked |

The outcome lands in the session timeline as a flow node (DSH does this for every
command), and the sidebar highlight / badge / folded counts update with it.

### By hand

Click `📌 Park note` in the session page header, type the reminder and save
(`Ctrl/Cmd + Enter`).

## Install

Verified against **DSH 0.1.6-alpha.2 and 0.1.7-rc.2** — the same build runs on
both (see [DSH version compatibility](#dsh-version-compatibility)). Needs a DSH
≥ 0.1.6-alpha.1 web profile. The two `@deepseek-ai/*` dependencies
(`dsh-home-paths`, `dsh-tools`) are declared as **peerDependencies** (the
ecosystem convention, same as `dsh-better-sidebar`): when installed from a
tarball they land in the plugin's own `node_modules` inside the profile and do
not touch the profile's dependency tree.

### A. Tarball (recommended, self-contained)

```bash
# in the plugin directory (7 delivered files, see package.json "files")
pnpm pack --pack-destination .

# install into the production profile
dsh plugin --profile web add dsh-session-suspend-0.2.5.tgz --ignore-scripts
```

The version in the filename tracks the current release — check the
[releases page](https://github.com/Archaofan/dsh-sidebar-reminder/releases) rather
than copying the one written here, which is the sort of thing that goes stale the
moment a release ships. The equivalent one-liner, which needs no local pack:

```bash
dsh plugin --profile web add https://github.com/Archaofan/dsh-sidebar-reminder/releases/download/v0.2.5/dsh-session-suspend-0.2.5.tgz
```

Self-contained: once installed, moving or deleting the plugin directory does not
affect production. To upgrade, repack and `add` again. Dependencies are
installed into the plugin's own `node_modules` inside the profile, at the same
version as the harness.

> ⚠️ **Always pass `--ignore-scripts` on Windows.** `dsh plugin add` forwards its
> arguments verbatim to pnpm, and pnpm by default re-runs the install scripts of
> **every package in the profile**, not just the one being added. Measured on a
> real profile this caused three separate failures: the install never finished
> (node-gyp rebuilding `ssh2` / `cpu-features`, no Visual Studio on the machine),
> and `cloudflared`'s postinstall — which downloads the **latest** release
> regardless of the pinned version — truncated `cloudflared.exe` to 0 bytes. With
> `--ignore-scripts` the same install finishes in about 3 seconds and touches
> nothing but the plugin. This plugin itself declares no install scripts, so
> nothing is lost by skipping them.

### If the second install fails with `ERR_PNPM_MISSING_TARBALL_INTEGRITY`

A pnpm bug, not a plugin one, reproducible in plain `pnpm` with no DSH involved:

```bash
$ pnpm add https://github.com/Archaofan/dsh-sidebar-reminder/releases/download/v0.2.5/dsh-session-suspend-0.2.5.tgz
# ok, but the lockfile records `resolution: {tarball: ...}` with NO integrity
$ pnpm add <any-other-package>
ERR_PNPM_MISSING_TARBALL_INTEGRITY  Cannot install package "dsh-session-suspend@...":
its lockfile entry has no "integrity" field, so pnpm cannot verify the tarball.
```

When pnpm serves a tarball from its content-addressable store instead of
downloading it, the lockfile entry it writes carries no integrity field. The
install that caused it succeeds; the **next** install in that profile then
refuses to run. **The first install always works**, so this only bites when you
add a second plugin to a profile that already has one.

To clear it, delete both files — deleting only the lockfile does **not** work,
because pnpm regenerates it from `package.json` and the store is still warm:

```bash
# <DSH_HOME>/profiles/<profile>/
rm -rf node_modules pnpm-lock.yaml
dsh plugin --profile web add dsh-session-suspend-0.2.5.tgz --ignore-scripts
```

`pnpm store prune`, `pnpm add --force` and a cold `--store-dir` were all tested;
none clear it while `node_modules` still holds the package.

### B. Directory link (for iterating)

```bash
dsh plugin --profile web add /path/to/dsh-session-suspend --ignore-scripts
```

pnpm links the directory with the `link:` protocol; restart to pick up changes.
**This requires the plugin directory's `node_modules` to exist** (Node resolves
dependencies from the link's real path, not from the DSH install directory).
Measured locally: link install/uninstall occasionally prunes that
`node_modules`, showing up as `Cannot find package
'@deepseek-ai/dsh-home-paths'` at boot — run `npm install` once in the plugin
directory to restore it. Use method A for production.

### After publishing

```bash
dsh plugin --profile web add dsh-session-suspend --ignore-scripts
dsh plugin --profile web add github:Archaofan/dsh-sidebar-reminder --ignore-scripts
```

**Restart DSH** after installing (plugins load at startup; every session created
afterwards gets the tools). Confirm it is enabled in Settings → Plugins or with
`dsh plugin --profile web list`.

> The first time a tool runs, if the current session's permission policy pops an
> approval, allow it once — the plugin only reads and writes its own storage file.

### Double-mount tolerance

If the plugin is mounted twice (for example both via `dsh plugin add` and by a
hand-added line in the profile's `cordis.patch.yml`), the official loader fails
the **whole plugin tree on a duplicate tool name / route** and DSH will not boot.
The host face guards both registrations at runtime: the second instance stands
down (one warn log) while the first keeps working, so **the boot does not fail**.
If the plugin seems dead, check `dsh plugin --profile web list` for a double
mount first.

## How it works

```
index.js   host face: 3 model tools + 3 slash commands + 3 local HTTP routes + JSON persistence
client.js  browser face: polling / panel / badge / row highlight / hover card / official settings section (single file, no build)
```

- **Storage**: `~/.dsh/storages/session-suspend/suspended.json`
  (`{ sessionId: { note, createdAt } }`), written via temp file + atomic rename.
- **Data flow**: the browser polls `GET /session-suspend/list` every 2.5s; save
  and clear go through `POST /session-suspend/set|clear`. The host is the single
  source of truth.
- **Model tools**: `suspend_session` / `resume_session` / `list_suspended`,
  registered per DSH's `defineTool` convention; only a root agent may park its
  own session.
- **Slash commands**: `/suspend` / `/suspended` / `/resume`, registered per
  `ctx.commands.register` (names must be lowercase). They share the tools'
  storage and resolution logic and just skip the model round-trip.
- **UI**: official slots only (`sidebar.footer.action`,
  `conversation.session.header.actions`, `settings.section`); no official
  component is shadowed.
- **Row highlight**: official session rows expose no per-row slot and read only
  the built-in `schedule` projection, so — like the community plugins
  (dsh-activity-bell et al.) — this uses DOM enhancement: a `data-dsh-suspend`
  attribute plus a highlight class is written onto the matching
  `[role="treeitem"]` row, and re-applied after React re-renders by a
  MutationObserver plus a periodic scan.

## Known limitations

- **No fourth item in the `…` menu**: the official row menu (rename / fork
  session / archive session) is a **hard-coded array** in
  `dsh-client-ui-workspace` with no slot anywhere on its render chain
  (`sidebar → sidebar.workspaces → WorkspaceBrowser`), so a plugin cannot inject
  a menu item. The in-row pin button is the fallback.
- **The official hover card cannot be extended either** — no slot there either,
  so the two cards coexist side by side.
- **Title matching**: row highlight matches session title ↔ stored session id
  (any leaf text of the matched row, title preferred); same-named sessions all
  highlight (the panel still tells them apart by id). A session that has just
  been created and has no title yet (shown as "New session") is not highlighted
  (panel / badge still show it).
- **Upgrade fragility**: DOM enhancement depends on the official row's
  `role="treeitem"` and title text structure; if DSH changes the row structure
  the highlight may stop working (panel, badge and tools are unaffected).
- **HTTP routes are unauthenticated**: like the community plugins, they listen
  on the local loopback only, so other processes on the same machine can read
  and write the file.
- One note per session (parking again replaces it); archived sessions keep their
  note until cleared manually.
- UI strings are built in for Chinese and English. The document language seeds
  them at load, then the active dictionary **follows DSH's UI language**: switch
  the language in Settings and the sidebar, panel and official settings section
  all repaint without a reload (compositions without a locale face fall back to
  the document language).
- Opening a session goes through `uiWorkspace.openSession` (how DSH's own sidebar
  does it), falling back to clicking the matching sidebar row, then to a text
  hint in the panel.
- In a non-loopback (remote) browser, preset changes only apply to that process
  (established behaviour of DSH's settings pipeline).

## Tooltip placement

Both the official card and ours open on the same 500ms dwell, so placement is
the whole problem:

| Setting | Position | Trade-off |
| --- | --- | --- |
| **Below-left** (default) | `row right + 8`, tucked under the official card | Off the sidebar band and not over the sessions below; pointer travel ~162px, so `Open` is reachable inside the official 200ms grace |
| **Right of official card** | `row right + 260`, side by side | Independent of the official card's height, so it can never jump; pointer travel ~385px |

`Below-left` measures the official card's bottom edge and, when it cannot be
measured, falls back to **exactly** the same spot as `Right` — so the card never
moves from one place to another. `Below-left` also waits for the official card
to lay out before drawing once, rather than drawing at the fallback and
correcting later (that correction is what made the card visibly slide).

Timings mirror the official `HoverCard` — open 500ms, close 200ms
(`usePointerGrace`) — because two cards that disagree look broken even when each
is individually correct. The **open** side is a *floor*, not a hardcoded host
value: DSH's dwell is not a contract and it has already moved once (the
session-row card passes `openDelayMs: 800` in 0.1.7, where 0.1.6 used the 500
default). So the plugin opens no earlier than 500ms and then keeps waiting, up to
a 700ms budget, for the official card to become measurable — which places both
cards together whether the host dwells at 500 or 800. `check-host-card.cjs`
reads a real DSH install and fails if the card's width, its 8px anchor offset or
its dwell ever drifts outside what the plugin assumes.

## DSH version compatibility

One build, verified on both lines. What changed in 0.1.7 and how it is handled:

| 0.1.7 change | Effect on this plugin | Handling |
| --- | --- | --- |
| Session-row `HoverCard` dwell raised 500 → **800ms** | The tooltip's wait, sized in *frames* (~100ms), expired while the official card was still 300ms away, so `Below-left` drew at the fallback spot beside the row instead of under the card | The wait became a **700ms time budget**. Nothing is displayed until it resolves, so a slower host costs latency, never a jump. Gate variant 11 reproduces the regression |
| First-run onboarding (内测声明 + API Key) | A full-page mask intercepts every click, so the sidebar was unclickable and e2e runs failed on the *first* click | `dismissFirstRun(page)` — dismisses **after** the GUI settles (dismissing first finds no dialog, then the mask appears and the next click times out) and clicks the last button by **exact** role name |
| Plugin manager card title shows the full package name (`dsh-session-suspend`, not `session-suspend`) | The e2e's card selector matched an element whose text was exactly `session-suspend` | Matched on the `…_cardTitle` class plus a `session-suspend$` suffix, so both spellings drive the same check |
| Session log format **v3 → v4** | Sessions written by 0.1.6 cannot be read by 0.1.7 (and vice versa) — an environment limit, not a plugin one. A 0.1.7 profile therefore has no session rows to measure against | The live-GUI geometry half runs on 0.1.6 (where real sessions exist); on 0.1.7 the row-dependent checks report *skipped* rather than *failed*, and the same geometry is guarded statically by `check-host-card.cjs` against both installs |
| `dsh-settings` rewritten; `ui-primitives` icon exports renamed | None — this plugin only consumes official slots (`sidebar.footer.action`, `conversation.session.header.actions`, `settings.section`), which are stable across both | No change needed; the e2e asserts the three slots still render and register without conflict |

Nothing in the plugin is version-gated at runtime: there is no `if (dshVersion)`.
Both hosts are handled by the same code, and the compatibility claim is backed by
`check-host-card.cjs` reading each install rather than by a version string.

The two `@deepseek-ai/*` peers (`dsh-home-paths`, `dsh-tools`) expose the exact
same signatures on both lines — `defineTool(options)` and
`dshHomePath(...segments)` — so a 0.1.6 copy satisfies a 0.1.7 host and vice
versa. That is verified by diffing both installs, not assumed.

## Development and sandbox verification

Changing a production DSH directly is genuinely risky: a bad patch or manifest
fails the **whole plugin tree** and DSH will not boot. This repo's workflow is
"sandbox first", and the sandbox is already set up and verified:

> **The sandbox rig is git-ignored.** `.sandbox/`, `.sandbox-next/` and every
> `*.tgz` are excluded, because the rig contains two full DSH installs. A fresh
> clone therefore has none of it, and the commands below will not run until it
> is rebuilt. What *is* committed is the published package itself — `index.js`,
> `client.js`, `cordis.patch.yml`, both READMEs and `LICENSE` — so the plugin
> installs from a clone without any of this.

```
.sandbox/        DSH 0.1.6-alpha.2 — the regression baseline
├── dsh/          a full DSH install at the same version as production (0.1.6-alpha.2)
├── home/         an isolated DSH_HOME (profiles/sandbox, storages live here)
├── node_modules/ pnpm for the sandbox only
└── boot-*.log    boot logs
.sandbox-next/    DSH 0.1.7-rc.2 — the adaptation target
```

The daily loop (edit → pack into the sandbox → boot → check routes/UI → only then
production). **Use a tarball, not a link**: link installs occasionally get their
`node_modules` pruned by pnpm, which yields stale code or a mysterious boot
failure.

```powershell
# 0. syntax self-check
node --check index.js && node --check client.js

# 1. pack and install into the sandbox profile (self-contained, deps travel with it)
$env:DSH_HOME = 'E:\DSH-Workspace\DSH-Plugin\.sandbox\home'
npm pack --ignore-scripts            # produces dsh-session-suspend-<version>.tgz
$tgz = (Get-ChildItem .sandbox\dsh-session-suspend-*.tgz | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
node .sandbox\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js plugin --profile sandbox remove dsh-session-suspend
node .sandbox\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js plugin --profile sandbox add $tgz --ignore-scripts

# 2. boot the sandbox (isolated port 12996, loopback only, isolated home — never touches production)
node .sandbox\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js --profile sandbox --no-open --port 12996 --host 127.0.0.1

# 3. verify (another terminal)
curl "http://127.0.0.1:12996/session-suspend/list?token=<token from the boot log>"
curl -X POST "http://127.0.0.1:12996/session-suspend/set?token=<token>" -H "content-type: application/json" -d '{"sessionId":"t","note":"n"}'
# open the http://127.0.0.1:12996/?token=... URL from the boot log to see the UI
```

> When a port is taken, find the PID with `netstat -ano | Select-String '12996'`
> (`Get-NetTCPConnection` is unreliable on this machine) and kill only the
> sandbox process — **production listens on 12931 and must never be touched**.
> (Production binds `0.0.0.0:12931`, so do not grep for `127.0.0.1:12931` or you
> will wrongly conclude it is not running.)
>
> `npm pack` fails with a permissions error when the default cache is not
> writable — point it at the sandbox's own cache:
> `$env:npm_config_cache = 'E:\DSH-Workspace\DSH-Plugin\.sandbox\.npm-cache'`.
> On Windows `npm.ps1` may be blocked by the execution policy; call `npm.cmd`.

> ⚠️ **Interactive verification must be started by you, in a normal PowerShell
> terminal — not by the AI assistant.** The official workspace directory picker
> is a native Win32 dialog spawned by the host process through a piped
> `child_process.spawn`; the AI runtime's file sandbox blocks that spawn
> (`EPERM`), which shows up as "cannot pick a workspace, cannot create a
> conversation". A sandbox started from a normal terminal behaves exactly like
> production (isolation still comes from DSH_HOME + profile + port). Point the
> workspace at `.sandbox\workspace` (a throwaway directory).

Verified: the boot graph, all host routes and persistence (list / set / clear /
presets, including 400/413 status codes and preset validation), the client bundle
being composed and delivered, all three slots registering, the official settings
section and the slash commands verified in a real browser, the tarball install
path, the runtime guard against double mounts, and the negative cases of "missing
dependency / port taken" boot failures (all caught by the sandbox, never reaching
production). The sandbox is fully isolated (separate home / profile / port) and
can be deleted at any time.

### Verifying the browser half (important)

**DSH's module loader only materializes the client bundle when the browser
actually imports it**, so even a sandbox that boots cleanly with every route
working proves only the host face — the browser face may never have run. A
client activation failure shows in the GUI as:

```
HARNESS Failed to load plugins / <plugin name> / web boot: 1 entry did not activate
```

`.sandbox/client-harness.cjs` materializes `client.js` in Node against a fake DOM
and a fake cordis ctx and calls `apply()`, exposing this class of problem without
a browser:

```bash
node .sandbox/client-harness.cjs client.js            # against the source
node .sandbox/client-harness.cjs <installed client.js> # against the install artifact
HARNESS_LANG=en node .sandbox/client-harness.cjs client.js  # same, in the English UI
```

It checks ten things: no throw at module scope, `apply()` completing with all
three slots registered, `inject` listing only reachable services (and covering
every service the module reads — see pitfall 5), the **paint
chain** (the `presetId` stored on the note really decides the row's style class
instead of always falling back to the default preset), **preset name
localization** (a built-in preset reads in the UI's language, and a renamed one
keeps its stored name), **tooltip placement** (both configured positions leave
the sidebar band, neither covers the official card, and neither moves once
drawn), **wait behaviour** (`below-left` waits for the official card instead of
drawing first and correcting later, which is what made the card visibly jump),
**timing parity** (open 500ms / close 200ms, exactly the official
`HoverCard`'s `openDelayMs = 500` and `usePointerGrace`'s 200ms), **locale
dictionaries and hot switching** (both zh and en published under `ctx.locale`;
the active dictionary follows the framework locale rather than the document
language, and a language switch rebinds it and repaints the store), and the
**official settings section** (`settings.section` registers, its nav label is a
locale-following thunk, and the component renders).

`.sandbox/tool-schema.cjs` is the host face's counterpart: it registers the real
tools, calls each one, and recursively checks that every field of the returned
value is declared in the output schema (with `additionalProperties: false` an
undeclared field is a violation — see pitfall 4 below). The three slash commands
are self-tested the same way (lowercase names, `{kind:'success'|'error'}`
returns).

`.sandbox/gate.cjs` is the overall regression gate: both faces run the good build
plus broken builds — fourteen client variants (`inject` naming an unreachable
service; reading `ctx.locale` without listing `locale` in `inject`; a
`noteByTitle` shape mismatch; the tooltip hung back over the sidebar;
`below-left` guessing the official card's height; `showTipWhenReady` no longer
waiting; the open delay drifting from 500; the close grace drifting from 200; a
language switch that never rebinds the dictionary; a settings nav label written
as a static string; the card-wait budget shrinking back to the old frame count,
which is the 0.1.7 regression itself; a missing deadline read as "wait forever"
instead of "no budget"; the row park button labelled once and never following a
language switch; the two title indexes picking different duplicates) and three
host variants (`suspend_session` returning an undeclared `presetId`; `/suspend`
ignoring its rawInput; a command name the registry would reject). All must be
rejected (exit 1) while all four good builds pass (exit 0: Chinese, English, and
a deliberately mismatched combination — English document, Chinese framework
locale — proving the plugin follows the framework language).

Four of those exist because a *test* was wrong rather than the plugin, which is
the more dangerous direction: a harness that silently mis-drives the code proves
a bug that does not exist, or misses one that does. Variants 2 and 12 were both
found that way — `paintRow(row, hit)` takes exactly two arguments, and
`showTipWhenReady` needs a deadline — so the gate mutates the *source* to
reproduce each known bug and the harness must reject it.

`check-host-card.cjs` runs as a third half of the gate and reads a **real DSH
install**: it fails if the official card's width (244px), its 8px anchor offset
or its dwell ever drift outside what the plugin assumes. None of those is a
published contract, which is why the drift has to be detected rather than
trusted — it runs against every installed version, so a new DSH that moves any
of them fails the gate here instead of in a user's sidebar.

Three e2e scripts drive the **real GUI** in a real browser (Playwright), where
the slot registry, React rendering, the official `HoverCard`, the official
Settings window and the command discovery are all genuine:

- `.sandbox/e2e/e2e.mjs` — the footer button renders, no "did not activate"
  error, parked rows really carry the highlight attribute, and — the part no
  fake DOM can check — hovering a row puts our card **below-left of the official
  card with no overlap**, it **does not move after being drawn**, its action
  buttons sit inside its own box, it never hangs over the sidebar band, and
  switching the placement actually moves it and persists to the host.
- `.sandbox/e2e/e2e-new-surfaces.mjs` — the official settings page renders our
  section (title / switches / preset list), toggling *Ask for a style* inside it
  really flips the host-side preference, and `/suspend`, `/suspended`, `/resume`
  typed into a real session park, list and clear with the flow node visible in
  the timeline.
- `.sandbox/e2e/e2e-settings-page.mjs` — the plugin manager card shows the
  version, the package name and the Chinese-first description, with the
  component reported as running (the only place activation is reported per
  plugin). The version is read from `package.json` rather than written into
  the test, so a release that forgets to bump it fails here instead of
  passing against a stale expectation.

```bash
pnpm install                      # once, for the playwright devDependency
node .sandbox/e2e/e2e.mjs http://127.0.0.1:12996/?token=...              # from the sandbox boot log
node .sandbox/e2e/e2e-new-surfaces.mjs http://127.0.0.1:12996/?token=...
node .sandbox/e2e-settings-page.mjs http://127.0.0.1:12996/?token=...
# E2E_CHROMIUM=/path/to/chrome.exe node .sandbox/e2e/e2e.mjs <url>   # any recent Chromium
```

Both new e2e scripts are **self-contained**: with nothing parked they open a
session and park one with `/suspend` themselves, so no manual preparation is
needed. The selectors were learned from the real DOM and are worth recording:
the official Settings navigation is the only `<nav>` that also lists a built-in
section (通用设置) — the sidebar footer button carries the same label as our nav
entry, so an unscoped text search clicks the wrong element; the composer is a
`contenteditable`, not a `textarea`; command results are **flow nodes in the
session timeline**, and the greeting screen mounts no timeline, so a session with
history must be opened first; and in 0.1.6 the plugin manager no longer uses
`code[data-plugin-name]` — each plugin is a card whose title is a button.

### Are the tools visible to the model?

Registering a tool only puts it in `ctx.tools`; what the model actually receives
is what `ctx.tools.schemas()` projects. To prove that half in a genuine boot, a
throwaway diagnostic plugin was installed into the sandbox alongside this one,
dumped the real registry after the tree settled, and was then removed. From that
boot:

```
ctx.tools.constructor.name        ToolRuntime
ctx.tools.schemas()               ["suspend_session", "resume_session", "list_suspended"]
ctx.tools.wireSchemas().schemas   ["suspend_session", "resume_session", "list_suspended"]
```

with all three descriptions present verbatim, bilingual trigger examples
included. Two things worth knowing if you repeat it: an effect that reads the
registry **synchronously at activation sees an empty view** — the tools are
registered by a sibling plugin's effect, so read it after a delay; and built-in
tools (`run_code`, `bash`, …) do not appear in the global view at all, they are
agent-scoped, so an empty global list is not by itself evidence of a problem.

What this does **not** prove is that a model chooses to call the tool for a given
phrasing — that needs a credentialed model round-trip and is the one check left
to a human.

> Pitfall 1 — `inject` listed a service this plugin's fiber cannot reach
> (`uiWorkspace` is provided by `dsh-client-ui-workspace`'s own fiber, a sibling
> rather than an ancestor). cordis waits for it forever, so the plugin never
> activates (the GUI reports "1 entry did not activate"). Keep `inject` to the
> genuinely reachable `['slots', 'locale']` (both registered at root scope by
> bundles dsh-base itself composes) and read other services opportunistically at
> the call site with fallbacks.
>
> Pitfall 5 — the runner's `ctx` is **fail-loud**: reading a service that is not
> listed in `inject` throws `cannot get property "locale" without inject`, and it
> throws inside `apply()`, killing the whole plugin tree on the spot (measured in
> v0.1.5's first cut). A permissive fake ctx would have hidden this forever — the
> service simply sat on the object, so the read silently returned undefined — so
> `.sandbox/client-harness.cjs`'s fake ctx is now a strict Proxy: only the
> declared `inject` services and cordis's own built-ins resolve, everything else
> throws. The matching broken variant (dropping `locale` from `inject`) must be
> rejected by the gate.
>
> Pitfall 2 — `noteByTitle()` once returned `{sessionId, entry}` while its
> consumer `presetFor()` reads `note.presetId`; the field was nested away and
> never read, so every row silently fell back to the default preset — "I picked
> another style but the default one was applied". `noteByTitle()` now flattens
> the note fields and carries `sessionId`, guarded by the paint-chain test.
>
> Pitfall 3 — tooltip placement went through three rounds. ① Below the row,
> covering the sessions listed underneath it. ② Right of the official card, which
> stopped covering them but meant ~385px of pointer travel, so `Open` could not
> be reached inside the official 200ms grace. ③ Below the official card, which
> then visibly slid from the right to the lower-left because it was drawn at the
> deterministic fallback and re-measured 150ms later. Final design: the position
> is **configurable** (right of the official card / below-left of it) and
> `below-left` uses `requestAnimationFrame` to **wait for the official card to
> lay out and then draw once**, with no later correction. Timings were also
> aligned exactly with the official `HoverCard` (open 500ms / close 200ms). The
> placement, wait and timing tests guard all of it.
>
> Pitfall 4 — `suspend_session` returned `presetId` while the output schema never
> declared it, and the schema is `additionalProperties: false`; dsh-tools treats
> any undeclared field in the returned value as a violation, which the model sees
> as a serialization warning on every park (the feature itself works, so it is
> easy to ignore). The fix is to declare `presetId: { type: 'string' }`, guarded
> by `.sandbox/tool-schema.cjs`. Note that `required: true` inside a property is
> DSH's convention (`dsh-tools` promotes it into a standard `required: [...]`
> array) — do not rewrite it into plain JSON Schema style.

## Development

```bash
node --check index.js && node --check client.js   # syntax self-check
```

No dependencies need installing; the host half's `@deepseek-ai/*` references
resolve from the DSH install directory — the same approach as the official
`dsh-workspace-kit` and friends. Everything else about developing against a real
sandbox is under [Development and sandbox verification](#development-and-sandbox-verification)
above, including why the browser half needs its own harness.

## Release checklist

Before publishing the first release:

- [x] Replace the `repository.url` placeholder in `package.json` with the real
      repository address — now `https://github.com/Archaofan/dsh-sidebar-reminder`.
- [ ] After publishing, verify the "after publishing" install path above
      (`dsh plugin --profile web add github:Archaofan/dsh-sidebar-reminder
      --ignore-scripts`) on the **sandbox profile** before touching production.
- [x] Bump `version` and re-pack for the next release; the tarball name carries
      the version.
- [x] Install into production with `--ignore-scripts` (see the warning under
      method A); verified on profile `web`, all seven files byte-identical to the
      release tarball, no other package touched.
- [ ] Confirm the interactive UI once more in a normal terminal: park a session
      in both UI languages, switch the tooltip position, rename a preset, and
      check that `Open` is reachable within the official card's grace period.
- [ ] Confirm the production profile is untouched: the plugin must be absent
      until you decide to install it.

### pnpm version skew on an existing profile

If `dsh plugin add` on a profile that already has plugins fails with
`ERR_PNPM_VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF` or `ERR_PNPM_UNEXPECTED_STORE`, the
profile's `node_modules` was created by a **different pnpm major** than the one
bundled with this DSH. Check `node_modules\.modules.yaml` → `packageManager`.
DSH 0.1.6-alpha.2 bundles pnpm 10, and pnpm 10 refuses to touch a pnpm 8 store
(and vice versa). Either align the pnpm versions first, or install the plugin
into a fresh profile — mixing the two leaves the tree in a half-linked state.

## Uninstall

```bash
dsh plugin --profile web remove dsh-session-suspend
```

After a restart the slots, highlight, routes and tools are all gone; delete
`~/.dsh/storages/session-suspend/` if you do not want the data.

## License

MIT
