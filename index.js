/**
 * dsh-session-suspend — host face.
 *
 * Parks a session with a natural-language reminder note:
 *   - three model tools (suspend_session / resume_session / list_suspended),
 *   - three same-origin HTTP routes the browser half polls and mutates,
 *   - one JSON file under the DSH home storages directory (atomic write).
 *
 * Everything is intentionally small: no session-log events, no projections,
 * no workspace writes. The browser half owns all presentation.
 *
 * @module dsh-session-suspend
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Cordis function-plugin name. */
export const name = 'session-suspend'
/** Services required before this plugin loads. */
export const inject = ['agents', 'tools']

/** Stable identity used for the storage directory and the HTTP route prefix. */
const PLUGIN_ID = 'session-suspend'
/** Route prefix; every path below is exact under it. */
const ROUTE_PREFIX = '/session-suspend'
/** Hard cap on one note; longer input is truncated with an ellipsis. */
const MAX_NOTE_LENGTH = 2000
/** Request-body cap for the two POST routes. */
const MAX_BODY_BYTES = 64 * 1024

/** The three tool names this plugin owns (used by logs only). */
const TOOL_NAMES = ['suspend_session', 'resume_session', 'list_suspended']

/* ------------------------------------------------------------------ *
 * Durable storage: one JSON file, atomic replace, in-memory mirror.
 * ------------------------------------------------------------------ */

/** @type {Map<string, { note: string, createdAt: string }>} */
let notes = new Map()
/** Serializes read-modify-write cycles so concurrent mutations cannot interleave. */
let queue = Promise.resolve()

function storageFile() {
  return dshHomePath('storages', PLUGIN_ID, 'suspended.json')
}

async function loadNotes() {
  let parsed
  try {
    parsed = JSON.parse(await readFile(storageFile(), 'utf8'))
  } catch {
    return // missing or unreadable: treat as empty
  }
  const raw = parsed && typeof parsed === 'object' ? parsed.notes : undefined
  const next = new Map()
  if (raw && typeof raw === 'object') {
    for (const [sessionId, value] of Object.entries(raw)) {
      if (typeof sessionId === 'string' && sessionId && value && typeof value.note === 'string') {
        next.set(sessionId, {
          note: value.note,
          createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
          presetId: typeof value.presetId === 'string' ? value.presetId : '',
        })
      }
    }
  }
  notes = next
}

async function persistNotes() {
  const file = storageFile()
  await mkdir(dirname(file), { recursive: true })
  const sorted = [...notes.entries()].sort(([left], [right]) => left.localeCompare(right))
  const payload = `${JSON.stringify({ version: 1, notes: Object.fromEntries(sorted) }, null, 2)}\n`
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, payload, 'utf8')
  await rename(temp, file)
}

/** Run one read-modify-write cycle under the serial queue. */
function mutate(change) {
  const run = queue.then(async () => {
    await loadNotes()
    const result = change(notes)
    await persistNotes()
    return result
  })
  queue = run.then(
    () => {},
    () => {},
  )
  return run
}

/** Apply a preset-state change and persist it (presets have their own file). */
async function mutatePresets(change) {
  const run = queue.then(async () => {
    await loadPresets()
    change(presetState)
    await persistPresets()
  })
  queue = run.then(
    () => {},
    () => {},
  )
  return run
}

/** Trim and cap one model- or browser-supplied note. */
function normalizeNote(raw) {
  if (typeof raw !== 'string') return null
  const note = raw.trim()
  if (!note) return null
  return note.length > MAX_NOTE_LENGTH ? `${note.slice(0, MAX_NOTE_LENGTH - 1)}…` : note
}

function normalizeSessionId(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim()
}

function snapshotNotes() {
  return Object.fromEntries([...notes.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

/* ------------------------------------------------------------------ *
 * Presets: user-configurable highlight styles for parked rows.
 *
 * A preset is { id, name, style, color, opacity }. The browser half owns
 * the editor UI; the host owns validation and durability so both the tools
 * and the routes accept the same presetId vocabulary.
 * ------------------------------------------------------------------ */

/** Every highlight style the browser half knows how to paint. */
export const PRESET_STYLES = ['bar', 'bar-wide', 'tint', 'dot', 'text', 'line', 'glow']

/**
 * Language-neutral names for the built-in presets. The browser half translates
 * these through its own i18n table, so the same stored preset reads correctly in
 * either UI language. Kept here (not only in client.js) so the host can validate
 * and re-emit the key when presets are saved from the settings panel.
 */
export const PRESET_NAME_KEYS = ['default', 'waiting', 'later']
/**
 * Where the note tooltip hangs relative to DSH's own session hover card.
 *   right — beside it, past its 244px width (never needs to be measured)
 *   below — under it, at the same left edge (shorter pointer trip)
 */
export const TIP_PLACEMENTS = ['right', 'below']
const DEFAULT_TIP_PLACEMENT = 'below'
/** Upper bound so the settings UI cannot grow without limit. */
const MAX_PRESETS = 12
/** Name length bound (the sidebar row is narrow). */
const MAX_PRESET_NAME = 24

/**
 * The three presets every install starts with. `nameKey` is language-neutral:
 * the browser half resolves it through its own i18n table so an English UI shows
 * "Default" rather than a Chinese label. `name` stays as the stored fallback and
 * as the label once the user renames the preset (renaming drops `nameKey`).
 */
const DEFAULT_PRESETS = [
  { id: 'p-default', nameKey: 'default', name: '默认样式', style: 'bar', color: '#e8a33d', opacity: 1 },
  { id: 'p-wait', nameKey: 'waiting', name: '等待中', style: 'tint', color: '#4a9eff', opacity: 0.16 },
  { id: 'p-later', nameKey: 'later', name: '稍后', style: 'dot', color: '#9b8cff', opacity: 1 },
]

/** @type {{ askOnPark: boolean, defaultPresetId: string, tipPlacement: string, projectBadge: boolean, panelStyles: boolean, timeChip: boolean, presets: Array<{id,name,style,color,opacity}> }} */
let presetState = {
  askOnPark: true,
  defaultPresetId: DEFAULT_PRESETS[0].id,
  tipPlacement: DEFAULT_TIP_PLACEMENT,
  projectBadge: true,
  panelStyles: true,
  timeChip: true,
  presets: DEFAULT_PRESETS.map((p) => ({ ...p })),
}

function presetsFile() {
  return dshHomePath('storages', PLUGIN_ID, 'presets.json')
}

async function loadPresets() {
  let parsed
  try {
    parsed = JSON.parse(await readFile(presetsFile(), 'utf8'))
  } catch {
    return // missing or unreadable: keep the defaults
  }
  if (!parsed || typeof parsed !== 'object') return
  const presets = Array.isArray(parsed.presets) ? parsed.presets.map(normalizePreset).filter(Boolean) : []
  if (presets.length === 0) return
  presetState = {
    askOnPark: parsed.askOnPark === true,
    defaultPresetId: presets.some((p) => p.id === parsed.defaultPresetId) ? parsed.defaultPresetId : presets[0].id,
    tipPlacement: TIP_PLACEMENTS.includes(parsed.tipPlacement) ? parsed.tipPlacement : DEFAULT_TIP_PLACEMENT,
    /* These three ship on, so an absent key must read as true — `=== true`
       would silently switch the feature off for every existing install. */
    projectBadge: parsed.projectBadge !== false,
    panelStyles: parsed.panelStyles !== false,
    timeChip: parsed.timeChip !== false,
    presets: presets.slice(0, MAX_PRESETS),
  }
}

async function persistPresets() {
  const file = presetsFile()
  await mkdir(dirname(file), { recursive: true })
  const payload = `${JSON.stringify(presetState, null, 2)}\n`
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, payload, 'utf8')
  await rename(temp, file)
}

/** Validate one preset; returns a normalized copy or null when unusable. */
function normalizePreset(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!id || !name) return null
  if (name.length > MAX_PRESET_NAME) return null
  if (!PRESET_STYLES.includes(raw.style)) return null
  if (typeof raw.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw.color)) return null
  const opacity = typeof raw.opacity === 'number' && Number.isFinite(raw.opacity) ? Math.min(1, Math.max(0, raw.opacity)) : 1
  /* nameKey survives only while it is a known language-neutral key; anything
     else (notably a user rename) drops it so the stored name wins. */
  const nameKey = PRESET_NAME_KEYS.includes(raw.nameKey) ? raw.nameKey : undefined
  const preset = { id, name, style: raw.style, color: raw.color.toLowerCase(), opacity }
  if (nameKey) preset.nameKey = nameKey
  return preset
}

/** Resolve a requested presetId against the current presets, falling back to the default. */
function resolvePresetId(raw) {
  if (typeof raw === 'string' && presetState.presets.some((p) => p.id === raw)) return raw
  return presetState.presets.some((p) => p.id === presetState.defaultPresetId)
    ? presetState.defaultPresetId
    : (presetState.presets[0] && presetState.presets[0].id) || ''
}

function snapshotPresets() {
  return {
    askOnPark: presetState.askOnPark,
    defaultPresetId: presetState.defaultPresetId,
    tipPlacement: presetState.tipPlacement,
    projectBadge: presetState.projectBadge,
    panelStyles: presetState.panelStyles,
    timeChip: presetState.timeChip,
    tipPlacements: TIP_PLACEMENTS,
    styles: PRESET_STYLES,
    presets: presetState.presets.map((p) => ({ ...p })),
  }
}

/* ------------------------------------------------------------------ *
 * HTTP routes (registered only when a webServer is composed).
 * ------------------------------------------------------------------ */

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Body-level failure carrying the HTTP status it deserves. */
class BodyError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new BodyError('payload too large', 413)
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BodyError('invalid_json', 400)
  }
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function sendError(res, error) {
  sendJson(res, error instanceof BodyError ? error.status : 500, { ok: false, error: describeError(error) })
}

/**
 * Register one route, tolerating a double mount: `webServer.register` throws on
 * a duplicate (kind, path), and two mounts of this plugin would otherwise fail
 * the whole plugin tree at boot. A duplicate means another instance already
 * owns the route, so this instance stands down instead of crashing the boot.
 */
function registerRoute(webServer, route, log) {
  try {
    return webServer.register(route)
  } catch (error) {
    const message = describeError(error)
    if (!/duplicate/i.test(message)) throw error
    log?.warn(`route ${route.path} is already registered by another instance; standing down`)
    return () => {}
  }
}

function registerRoutes(webServer, log) {
  const disposers = []

  disposers.push(
    registerRoute(
      webServer,
      {
        kind: 'exact',
        path: `${ROUTE_PREFIX}/list`,
        handler: async (_req, res) => {
          try {
            await loadNotes()
            sendJson(res, 200, { ok: true, notes: snapshotNotes() })
          } catch (error) {
            sendError(res, error)
          }
        },
      },
      log,
    ),
  )

  disposers.push(
    registerRoute(
      webServer,
      {
        kind: 'exact',
        path: `${ROUTE_PREFIX}/set`,
        handler: async (req, res) => {
          try {
            const body = await readJsonBody(req)
            const sessionId = normalizeSessionId(body.sessionId)
            const note = normalizeNote(body.note)
            if (!sessionId || !note) {
              sendJson(res, 400, { ok: false, error: 'invalid_input' })
              return
            }
            await loadPresets()
            const presetId = resolvePresetId(body.presetId)
            const result = await mutate((current) => {
              const replaced = current.has(sessionId)
              current.set(sessionId, { note, createdAt: new Date().toISOString(), presetId })
              return { replaced }
            })
            sendJson(res, 200, { ok: true, sessionId, note, presetId, replaced: result.replaced, total: notes.size })
          } catch (error) {
            sendError(res, error)
          }
        },
      },
      log,
    ),
  )

  disposers.push(
    registerRoute(
      webServer,
      {
        kind: 'exact',
        path: `${ROUTE_PREFIX}/clear`,
        handler: async (req, res) => {
          try {
            const body = await readJsonBody(req)
            const sessionId = normalizeSessionId(body.sessionId)
            if (!sessionId) {
              sendJson(res, 400, { ok: false, error: 'invalid_input' })
              return
            }
            const removed = await mutate((current) => current.delete(sessionId))
            sendJson(res, 200, { ok: true, sessionId, removed, total: notes.size })
          } catch (error) {
            sendError(res, error)
          }
        },
      },
      log,
    ),
  )

  disposers.push(
    registerRoute(
      webServer,
      {
        kind: 'exact',
        path: `${ROUTE_PREFIX}/presets`,
        handler: async (req, res) => {
          try {
            if (req.method === 'GET') {
              await loadPresets()
              sendJson(res, 200, { ok: true, ...snapshotPresets() })
              return
            }
            if (req.method !== 'POST') {
              sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
              return
            }
            const body = await readJsonBody(req)
            const presets = Array.isArray(body.presets) ? body.presets.map(normalizePreset).filter(Boolean) : null
            if (!presets || presets.length === 0) {
              sendJson(res, 400, { ok: false, error: 'invalid_input' })
              return
            }
            const ids = new Set(presets.map((p) => p.id))
            if (ids.size !== presets.length) {
              sendJson(res, 400, { ok: false, error: 'duplicate_id' })
              return
            }
            await mutatePresets(() => {
              presetState = {
                askOnPark: body.askOnPark === true,
                defaultPresetId: ids.has(body.defaultPresetId) ? body.defaultPresetId : presets[0].id,
                tipPlacement: TIP_PLACEMENTS.includes(body.tipPlacement) ? body.tipPlacement : presetState.tipPlacement,
                /* Default-on: an absent key keeps the feature on rather than
                   silently disabling it for an older client. */
                projectBadge: body.projectBadge !== false,
                panelStyles: body.panelStyles !== false,
                timeChip: body.timeChip !== false,
                presets: presets.slice(0, MAX_PRESETS),
              }
            })
            sendJson(res, 200, { ok: true, ...snapshotPresets() })
          } catch (error) {
            sendError(res, error)
          }
        },
      },
      log,
    ),
  )

  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error)
}

/* ------------------------------------------------------------------ *
 * Model tools.
 * ------------------------------------------------------------------ */

const SUSPEND_DESCRIPTION = [
  'Park the current conversation with a reminder note so the user sees it highlighted in the web sidebar later.',
  'Call this when the user wants to pause or leave this session while something is still pending — e.g. waiting for a reply,',
  'a review, a scheduled event, a decision, or any follow-up they might forget among many sessions.',
  'The note is stored per session and shown in full when the user hovers the highlighted sidebar row; calling again replaces the note.',
  'Keep the note in the user\'s own words: concise but complete enough to act on later.',
  'The user may phrase this in either language. Chinese examples:',
  '"先挂起，晚点再继续" / "挂起：等对方回复后再继续" / "这事先放着，下午回来接着弄" / "帮我记一下，下次开会前搞定".',
  'English examples:',
  '"park this, remind me later" / "suspend this session until the build finishes" / "hold this, I will be back tonight"',
  '/ "remind me to revisit this after the meeting".',
].join(' ')

const RESUME_DESCRIPTION = [
  'Remove the park note from the current conversation (or from session_id).',
  'Call this when the user says the pending matter is finished or no longer needs a reminder.',
  'Triggers in either language: "取消挂起" / "这事结了，不用提醒了" / "done, unpark" / "clear the reminder".',
  'The sidebar highlight and hover note disappear. Succeed quietly when nothing was parked.',
].join(' ')

const LIST_DESCRIPTION = [
  'List every session currently parked with a reminder note, newest first.',
  'Call this when the user asks what is still pending, parked, suspended, or waiting.',
  'Triggers in either language: "我还有哪些事没做完" / "列出挂起的会话" / "what is still parked?" / "list my suspended sessions".',
].join(' ')

/** Shared output shape for the two mutating tools. */
const MUTATION_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean', required: true },
      action: { type: 'string', required: true },
      sessionId: { type: 'string' },
      note: { type: 'string' },
      /* suspend_session echoes back which preset it stored. It MUST be declared
         here: the schema is additionalProperties:false, and dsh-tools treats any
         undeclared key in the returned value as a schema violation, which the
         model sees as a serialization warning on every park. */
      presetId: { type: 'string' },
      replaced: { type: 'boolean' },
      removed: { type: 'boolean' },
      total: { type: 'integer' },
      error: { type: 'string' },
    },
  },
  render: (_args, value) => [
    {
      type: 'text',
      text: value.ok
        ? `${value.action === 'unpark' ? 'Unparked' : 'Parked'} session ${value.sessionId}` +
          (value.action === 'unpark' && !value.removed ? ' (it was not parked)' : '') +
          ` — ${value.total} parked in total.`
        : `Failed: ${value.error ?? 'unknown_error'}`,
    },
  ],
}

const LIST_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      total: { type: 'integer', required: true },
      sessions: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sessionId: { type: 'string', required: true },
            note: { type: 'string', required: true },
            createdAt: { type: 'string', required: true },
          },
        },
      },
    },
  },
  render: (_args, value) => [
    {
      type: 'text',
      text:
        value.total === 0
          ? 'No sessions are parked.'
          : `${value.total} parked session(s):\n${value.sessions
              .map((entry) => `- ${entry.sessionId}: ${entry.note} (parked ${entry.createdAt})`)
              .join('\n')}`,
    },
  ],
}

/**
 * Register one model tool, tolerating a double mount: the tool registry throws
 * on a duplicate name, and two mounts of this plugin would otherwise fail the
 * whole plugin tree at boot. A duplicate means another instance already owns
 * the name, so this instance stands down instead of crashing the boot.
 */
function registerTool(ctx, tool, log) {
  try {
    return ctx.tools.register(tool)
  } catch (error) {
    const message = describeError(error)
    if (!/already registered/i.test(message)) throw error
    log?.warn(`tool ${tool.name} is already registered by another instance; standing down`)
    return () => {}
  }
}

function registerTools(ctx) {
  const log = ctx.logger(PLUGIN_ID)
  const disposers = []

  disposers.push(
    registerTool(
      ctx,
      defineTool({
        name: 'suspend_session',
        description: SUSPEND_DESCRIPTION,
        parameters: {
          note: {
            type: 'string',
            required: true,
            description:
              'The reminder text, in the user\'s own words. Shown verbatim in the sidebar hover tooltip.',
          },
          session_id: {
            type: 'string',
            description: 'Optional session id to park instead of the current one. Defaults to the current session.',
          },
          preset_id: {
            type: 'string',
            description:
              'Optional style preset id for this park. Omit to use the default preset; list the available ids with list_suspended.',
          },
        },
        output: MUTATION_OUTPUT,
        async execute(args, exec) {
          const target = await resolveTargetSession(ctx, exec, args.session_id)
          if (target.error) return { ok: false, action: 'park', error: target.error }
          const note = normalizeNote(args.note)
          if (!note) return { ok: false, action: 'park', error: 'empty_note' }
          await loadPresets()
          const presetId = resolvePresetId(args.preset_id)
          const { replaced } = await mutate((current) => {
            const wasParked = current.has(target.sessionId)
            current.set(target.sessionId, { note, createdAt: new Date().toISOString(), presetId })
            return { replaced: wasParked }
          })
          return { ok: true, action: 'park', sessionId: target.sessionId, note, presetId, replaced, total: notes.size }
        },
        presentCall: (args) => ({
          card: 'generic',
          title: 'Park session',
          kind: 'other',
          rawInput: { note: args.note },
        }),
      }),
      log,
    ),
  )

  disposers.push(
    registerTool(
      ctx,
      defineTool({
        name: 'resume_session',
        description: RESUME_DESCRIPTION,
        parameters: {
          session_id: {
            type: 'string',
            description: 'Optional session id to unpark instead of the current one. Defaults to the current session.',
          },
        },
        output: MUTATION_OUTPUT,
        async execute(args, exec) {
          const target = await resolveTargetSession(ctx, exec, args.session_id)
          if (target.error) return { ok: false, action: 'unpark', error: target.error }
          const removed = await mutate((current) => current.delete(target.sessionId))
          return { ok: true, action: 'unpark', sessionId: target.sessionId, removed, total: notes.size }
        },
        presentCall: () => ({
          card: 'generic',
          title: 'Resume session',
          kind: 'other',
          rawInput: {},
        }),
      }),
      log,
    ),
  )

  disposers.push(
    registerTool(
      ctx,
      defineTool({
        name: 'list_suspended',
        description: LIST_DESCRIPTION,
        parameters: {},
        output: LIST_OUTPUT,
        async execute() {
          await loadNotes()
          const sessions = [...notes.entries()]
            .map(([sessionId, entry]) => ({ sessionId, note: entry.note, createdAt: entry.createdAt }))
            .sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''))
          return { total: sessions.length, sessions }
        },
        presentCall: () => ({
          card: 'generic',
          title: 'List parked sessions',
          kind: 'read',
          rawInput: {},
        }),
      }),
      log,
    ),
  )

  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}

/**
 * Resolve which session a tool call targets: the explicit id, else the caller's
 * own session. Only root (main-conversation) agents may park their own session.
 * @returns `{ sessionId }`, or `{ error }` with a stable error code.
 */
async function resolveTargetSession(ctx, exec, requested) {
  const explicit = normalizeSessionId(requested)
  const agent = exec.agent
  if (!agent) {
    return explicit ? { sessionId: explicit } : { error: 'no_owning_agent' }
  }
  if (!ctx.agents.roots().includes(agent)) {
    return explicit ? { sessionId: explicit } : { error: 'not_a_root_session' }
  }
  if (explicit) return { sessionId: explicit }
  const own = agent.session.id
  if (typeof own === 'string' && own) return { sessionId: own }
  return { error: 'no_session_id' }
}

/* ------------------------------------------------------------------ *
 * Plugin entry.
 * ------------------------------------------------------------------ */

/**
 * Counts applies so a double mount gets distinct effect names: cordis keys
 * effects by name, so two applies sharing one name would let the second
 * instance replace — and thereby dispose — the first instance's registrations.
 */
let applySeq = 0

/**
 * Install the tools, and the browser routes whenever a webServer exists.
 * @param ctx - host context.
 */
export function apply(ctx) {
  const seq = ++applySeq
  const log = ctx.logger(PLUGIN_ID)

  ctx.effect(() => {
    const dispose = registerTools(ctx)
    log.info(`tools registered: ${TOOL_NAMES.join(', ')}`)
    return dispose
  }, `session-suspend.tools(${seq})`)

  // The webServer is absent in non-web compositions; registerRoutes then never runs.
  ctx.inject(['webServer'], (webCtx) => {
    const webLog = webCtx.logger(PLUGIN_ID)
    webCtx.effect(() => {
      const dispose = registerRoutes(webCtx.webServer, webLog)
      webLog.info(`routes registered under ${ROUTE_PREFIX}`)
      return dispose
    }, `session-suspend.routes(${seq})`)
  })
}
