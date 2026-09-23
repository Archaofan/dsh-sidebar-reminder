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

> The hover card deliberately sits **below** the row: DSH itself draws a session
> status card to the right of the row (`left = row right + 8`, 244px wide,
> z-index 100). Placing ours to the right would cover it and block the pointer
> path, so the official card would vanish after its 200ms grace. Staying inside
> the 200px sidebar band lets both cards coexist.
>
> The position is configurable — right of the official card, or below-left of it
> — and it never slides after being drawn (see *Tooltip placement* below).

## Style presets

Sidebar footer → gear → **Style settings**:

- **Ask for a style when parking** (master switch, on by default): on, every park
  opens a dropdown of your presets; off, the default preset is used.
- **Preset list**: name / style / color / strength (5%–100%); add, edit, delete;
  up to 12 presets.
- Three built-in presets: *Default* (left bar, amber), *Waiting* (row tint 16%,
  blue), *Later* (leading dot, violet). Their names follow the UI language; once
  you rename one, your name wins.
- A natural-language park can also name one: `suspend_session` takes a
  `preset_id` argument (`list_suspended` lists the available ids).

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

### By hand

Click `📌 Park note` in the session page header, type the reminder and save
(`Ctrl/Cmd + Enter`).

## Install

Needs a DSH ≥ 0.1.6-alpha.1 web profile. The two `@deepseek-ai/*` dependencies
(`dsh-home-paths`, `dsh-tools`) are declared as **peerDependencies** (the
ecosystem convention, same as `dsh-better-sidebar`): when installed from a
tarball they land in the plugin's own `node_modules` inside the profile and do
not touch the profile's dependency tree.

### A. Tarball (recommended, self-contained)

```bash
# in the plugin directory (6 delivered files, see package.json "files")
pnpm pack --pack-destination .

# install into the production profile
dsh plugin --profile web add dsh-session-suspend-0.1.0.tgz
```

Self-contained: once installed, moving or deleting the plugin directory does not
affect production. To upgrade, repack and `add` again. Dependencies are
installed into the plugin's own `node_modules` inside the profile, at the same
version as the harness.

### B. Directory link (for iterating)

```bash
dsh plugin --profile web add /path/to/dsh-session-suspend
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
dsh plugin --profile web add dsh-session-suspend
dsh plugin --profile web add github:Archaofan/dsh-sidebar-reminder
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
index.js   host face: 3 model tools + 3 local HTTP routes + JSON persistence
client.js  browser face: polling / panel / badge / row highlight / hover card (single file, no build)
```

- **Storage**: `~/.dsh/storages/session-suspend/suspended.json`
  (`{ sessionId: { note, createdAt } }`), written via temp file + atomic rename.
- **Data flow**: the browser polls `GET /session-suspend/list` every 2.5s; save
  and clear go through `POST /session-suspend/set|clear`. The host is the single
  source of truth.
- **Model tools**: `suspend_session` / `resume_session` / `list_suspended`,
  registered per DSH's `defineTool` convention; only a root agent may park its
  own session.
- **UI**: official slots only (`sidebar.footer.action`, `sidebar.toggle.badge`,
  `conversation.session.header.actions`); no official component is shadowed.
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
- Browser language comes from `document.documentElement.lang`; only Chinese and
  English strings are built in.
- Presets live in the plugin's own `presets.json` and are not wired into DSH's
  official settings page (that would need `ctx.settings` / `settings.section`).
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
moves from one place to another. `Below-left` also waits a few animation frames
for the official card to lay out before drawing once, rather than drawing at the
fallback and correcting later (that correction is what made the card visibly
slide).

Timings mirror the official `HoverCard` exactly — open 500ms (`openDelayMs`),
close 200ms (`usePointerGrace`) — because two cards that disagree look broken
even when each is individually correct.

## Development and sandbox verification

Changing a production DSH directly is genuinely risky: a bad patch or manifest
fails the **whole plugin tree** and DSH will not boot. This repo's workflow is
"sandbox first", and the sandbox is already set up and verified:

```
.sandbox/
├── dsh/          a full DSH install at the same version as production (0.1.6-alpha.2)
├── home/         an isolated DSH_HOME (profiles/sandbox, storages live here)
├── node_modules/ pnpm for the sandbox only
└── boot-*.log    boot logs
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
& .sandbox\node_modules\.bin\pnpm.cmd pack --pack-destination .sandbox
node .sandbox\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js plugin --profile sandbox remove dsh-session-suspend
node .sandbox\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js plugin --profile sandbox add .sandbox\dsh-session-suspend-0.1.0.tgz

# 2. boot the sandbox (isolated port 12991, loopback only, isolated home — never touches production)
node .sandbox\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js --profile sandbox --no-open --port 12991 --host 127.0.0.1

# 3. verify (another terminal)
curl http://127.0.0.1:12991/session-suspend/list
curl -X POST http://127.0.0.1:12991/session-suspend/set -H "content-type: application/json" -d '{"sessionId":"t","note":"n"}'
# open the http://127.0.0.1:12991/?token=... URL from the boot log to see the UI
```

> When a port is taken, find the PID with `netstat -ano | Select-String '12991'`
> (`Get-NetTCPConnection` is unreliable on this machine) and kill only the
> sandbox process — **production listens on 12931 and must never be touched**.
> (Production binds `0.0.0.0:12931`, so do not grep for `127.0.0.1:12931` or you
> will wrongly conclude it is not running.)

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
being composed and delivered, all three slots registering, the tarball install
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

It checks eight things: no throw at module scope, `apply()` completing with all
three slots registered, `inject` listing only reachable services, the **paint
chain** (the `presetId` stored on the note really decides the row's style class
instead of always falling back to the default preset), **preset name
localization** (a built-in preset reads in the UI's language, and a renamed one
keeps its stored name), **tooltip placement** (both configured positions leave
the sidebar band, neither covers the official card, and neither moves once
drawn), **wait behaviour** (`below-left` waits for the official card instead of
drawing first and correcting later, which is what made the card visibly jump),
and **timing parity** (open 500ms / close 200ms, exactly the official
`HoverCard`'s `openDelayMs = 500` and `usePointerGrace`'s 200ms).

`.sandbox/tool-schema.cjs` is the host face's counterpart: it registers the real
tools, calls each one, and recursively checks that every field of the returned
value is declared in the output schema (with `additionalProperties: false` an
undeclared field is a violation — see pitfall 4 below).

`.sandbox/gate.cjs` is the overall regression gate: both faces run the good build
plus broken builds — seven client variants (`inject` naming an unreachable
service; a `noteByTitle` shape mismatch; the tooltip hung back over the sidebar;
`below-left` guessing the official card's height; `showTipWhenReady` no longer
waiting; the open delay drifting from 500; the close grace drifting from 200) and
one host variant (`suspend_session` returning an undeclared `presetId`). All must
be rejected (exit 1) while both good builds pass (exit 0).

> Pitfall 1 — `inject` listed a service this plugin's fiber cannot reach
> (`uiWorkspace` is provided by `dsh-client-ui-workspace`'s own fiber, a sibling
> rather than an ancestor). cordis waits for it forever, so the plugin never
> activates (the GUI reports "1 entry did not activate"). Keep `inject` to
> `['slots']` and read services opportunistically at the call site with
> fallbacks.
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

## Release checklist

Before publishing the first release:

- [x] Replace the `repository.url` placeholder in `package.json` with the real
      repository address — now `https://github.com/Archaofan/dsh-sidebar-reminder`.
- [ ] After publishing, verify the "after publishing" install path above
      (`dsh plugin --profile web add github:Archaofan/dsh-sidebar-reminder`) on the
      **sandbox profile** before touching production.
- [ ] Bump `version` and re-pack for the next release; the tarball name carries
      the version.
- [ ] Confirm the interactive UI once more in a normal terminal: park a session
      in both UI languages, switch the tooltip position, rename a preset, and
      check that `Open` is reachable within the official card's grace period.
- [ ] Confirm the production profile is untouched: the plugin must be absent
      until you decide to install it.

## Uninstall

```bash
dsh plugin --profile web remove dsh-session-suspend
```

After a restart the slots, highlight, routes and tools are all gone; delete
`~/.dsh/storages/session-suspend/` if you do not want the data.

## License

MIT
