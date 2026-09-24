/**
 * dsh-session-suspend — browser face (no build step, no dependencies).
 *
 * Served as a dynamic client bundle through window.__ModuleLoader__. Only the
 * baseline seeds (react / react-dom) are required; every icon, style and copy
 * string is inlined so the plugin stays a single lightweight file.
 *
 * What it does:
 *   1. polls the host routes for the parked-session notes,
 *   2. renders a sidebar footer button + panel and a collapsed-rail badge,
 *   3. renders a "park note" button in the session header,
 *   4. highlights matching sidebar rows (DOM augmentation — official rows have
 *      no per-row slot) and shows the note in a hover tooltip.
 *
 * @module dsh-session-suspend/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-session-suspend',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const createElement = React.createElement
    const { createPortal } = require('react-dom')

    /** Plugin identity shared with the host half. */
    const PLUGIN_ID = 'dsh-session-suspend'
    /** Host route prefix (must match index.js). */
    const ROUTE = '/session-suspend'
    /** Browser poll cadence for the note list. */
    const POLL_MS = 2500
    /** Hover dwell before the row tooltip appears. This is a FLOOR, not the
     *  host's value: DSH's own HoverCard dwell is not a published contract and
     *  it has already moved once — the session-row card passed openDelayMs
     *  800 in 0.1.7 (0.1.6 used the 500 default). Waiting for the card to
     *  actually become measurable (TIP_CARD_WAIT_MS below) is what keeps the
     *  two cards together, so this only has to be "not before the host". */
    const TIP_DELAY_MS = 500
    /** Row attribute written by the DOM highlighter. */
    const ROW_ATTR = 'data-dsh-suspend'
    /** Class written by the DOM highlighter (styled by the injected CSS). */
    const ROW_CLASS = 'dsh-suspend-row'
    /**
     * Left edge beyond which tree rows are not considered sidebar rows.
     * The official sidebar is a fixed 200px wide (rail mode 28/36px), so this
     * leaves headroom while still excluding trees in the main content area.
     */
    const SIDEBAR_MAX_LEFT = 360
    /**
     * Attribute + class for the collapsed-group count badge.
     *
     * The official grouping entity is a *Workspace* (the UI says 工作区);
     * `ProjectRowItem` / `YDXeBa_projectRow` are legacy names only. A group row
     * is `div[role="treeitem"][aria-expanded]`, and — critically — its session
     * rows are not rendered at all while it is folded (deriveGroups maps
     * `sessions: expanded ? … : []`), so the count cannot be read off the DOM.
     * It is computed from the Workspace Controller snapshot instead, which the
     * footer slot already receives as the global `useWorkspaces` prop.
     */
    const PROJECT_ATTR = 'data-dsh-suspend-project'
    const PROJECT_COUNT_CLASS = 'dsh-suspend-project-count'

    /**
     * Workspace membership, refreshed by the footer slot's `useWorkspaces`
     * hook. Each entry is `{ key, sessionIds }` where `key` is the group key
     * the row's fiber carries (workspaceId, or '' for the ungrouped bucket).
     */
    let workspaceMembers = []
    /** Session ids the live list knows about; empty means "unknown, trust all". */
    let knownSessionIds = new Set()

    /* ---------------------------------------------------------------- *
     * Highlight presets: the vocabulary shared with the host half.
     * ---------------------------------------------------------------- */

    /** Every style the host accepts (must match PRESET_STYLES in index.js). */
    const STYLE_IDS = ['bar', 'bar-wide', 'tint', 'dot', 'text', 'line', 'glow']

    /**
     * Where the note tooltip lives.
     *
     * The sidebar's rows span the full sidebar width, so any card anchored to a
     * row and growing DOWNWARD lands on the sessions below it — that is what
     * made the note card block the list. DSH's own hover card is already parked
     * in the main content area (left = rowRect.right + 8, top = rowRect.top,
     * width 244px, z-index 100), so we leave the sidebar band entirely and hang
     * directly UNDER that card, at the same left edge. Nothing in the session
     * list is ever covered, the official card stays fully visible, and the
     * pointer only has to travel out of the sidebar and down a little.
     */
    const TIP_MAX_WIDTH = 196
    /** Clearance past the official hover card: 8 (its left gap) + 244 (its
     *  width) + 8 (our gap). Used only as the fallback when DSH's card cannot
     *  be measured, so we never end up sitting on top of it. */
    const TIP_CARD_CLEARANCE = 260
    /**
     * Grace before hiding once the pointer leaves the row. Mirrors DSH's own
     * HoverCard (usePointerGrace -> setTimeout(..., 200)): a longer grace made
     * ours visibly outlast the official card, which reads as a bug. The short
     * pointer trip to the card — it hangs just under DSH's — is what makes
     * 200ms enough to still reach the buttons.
     */
    const TIP_HIDE_GRACE_MS = 200
    /**
     * Tooltip placement, mirrored from the host's TIP_PLACEMENTS.
     *   right — beside DSH's hover card, past its 244px width
     *   below — under it, at the same left edge
     */
    const TIP_PLACEMENTS = ['right', 'below']
    /**
     * How long to keep waiting for DSH's hover card to lay out before giving up
     * and placing at the deterministic spot.
     *
     * This used to be a FRAME COUNT (6 frames, ~100ms), which assumed the host
     * card commits within a frame or two of our own dwell. That held while both
     * cards opened at 500ms; it broke the moment DSH raised the session-row
     * card's openDelayMs to 800 in 0.1.7 — our card opened at 500ms, the
     * official card was still 300ms away, the wait expired, and the tooltip
     * landed at the fallback spot beside the row instead of under the card.
     *
     * A TIME budget fixes that without hardcoding either host value: we open no
     * earlier than TIP_DELAY_MS, then keep checking until the card is
     * measurable or this budget runs out. 700ms covers an 800ms host dwell
     * (300ms past our floor) with room to spare, and a host that dwells at
     * 500ms resolves on the first check.
     *
     * Waiting (instead of placing first and correcting later) is what keeps the
     * card from visibly jumping from beside the official card to underneath it.
     */
    const TIP_CARD_WAIT_MS = 700

    function EMPTY_PRESETS() {
      return {
        askOnPark: true,
        defaultPresetId: '',
        tipPlacement: 'below',
        tipPlacements: TIP_PLACEMENTS,
        styles: STYLE_IDS,
        projectBadge: true,
        panelStyles: true,
        timeChip: true,
        presets: [],
      }
    }

    function samePresets(left, right) {
      if (left.askOnPark !== right.askOnPark) return false
      if (left.defaultPresetId !== right.defaultPresetId) return false
      if (left.tipPlacement !== right.tipPlacement) return false
      if (!!left.projectBadge !== !!right.projectBadge) return false
      if (!!left.panelStyles !== !!right.panelStyles) return false
      if (!!left.timeChip !== !!right.timeChip) return false
      if (left.presets.length !== right.presets.length) return false
      return left.presets.every((p, index) => {
        const q = right.presets[index]
        /* nameKey matters: it decides whether the row label is translated. */
        return (
          p.id === q.id &&
          p.name === q.name &&
          (p.nameKey || '') === (q.nameKey || '') &&
          p.style === q.style &&
          p.color === q.color &&
          p.opacity === q.opacity
        )
      })
    }

    /* ---------------------------------------------------------------- *
     * Inline i18n. `document language` seeds the tables below so the
     * bundle is usable before the locale face answers; once apply() runs,
     * the dictionaries are published under ctx.locale and the active one
     * follows the framework's language (see the locale effect).
     * ---------------------------------------------------------------- */

    const ZH = {
      footer: '挂起提醒',
      panelTitle: '挂起的会话',
      empty: '暂无挂起的会话',
      emptyHint: '在对话里直接说，比如「先挂起，晚点再继续」',
      open: '打开',
      clear: '清除',
      parked: '已挂起',
      header: '挂起备注',
      headerParked: '已挂起',
      placeholder: '提醒事项，例如：等对方回复后再继续……',
      save: '保存',
      cancel: '取消',
      errorEmpty: '提醒内容不能为空',
      errorFailed: '操作失败，请重试',
      errorOpen: '无法自动打开，请在左侧点击该会话',
      justNow: '刚刚',
      minutesAgo: '分钟前',
      hoursAgo: '小时前',
      daysAgo: '天前',
      parkAction: '挂起会话',
      settings: '样式设置',
      settingsNav: '挂起提醒',
      settingsNavHint: '这里和侧边栏「挂起提醒」面板里的齿轮是同一份配置，改任何一处都会立即生效。',
      askOnPark: '挂起时选择样式',
      askOnParkHint: '打开后，每次挂起都会弹出下拉框让你选预设；关闭则直接用默认预设。',
      tipPlacement: '悬停框位置',
      tipPlacementHint: '官方悬停卡片右侧：并排显示，不随官方卡片高度变化。左下：紧贴官方卡片下方，离侧边栏更近、按钮更好点。',
      tipPlacements: { right: '官方卡片右侧', below: '官方卡片左下' },
      projectBadge: '折叠项目显示挂起数',
      projectBadgeHint: '打开后，侧边栏里折叠起来的项目会在行尾显示其下有多少个会话被挂起；展开时隐藏（展开状态下子项本就可见，计数是冗余的）。',
      panelStyles: '总览中按预设样式区分',
      panelStylesHint: '打开后，「挂起的会话」列表里每一行都带自己预设的视觉样式（色条 / 底色 / 圆点等），和侧边栏一致；关闭则所有行同一个样子。',
      timeChip: '时间加上底色框',
      timeChipHint: '打开后，列表里的挂起时间带一个浅色小框，不再和背景糊在一起；关闭则为纯文字。',
      sessionsParkedSuffix: '个会话已挂起',
      preset: '样式',
      presetName: '预设名称',
      presetStyle: '样式',
      presetColor: '颜色',
      presetOpacity: '浓度',
      addPreset: '新增预设',
      edit: '编辑',
      delete: '删除',
      styleLabels: {
        bar: '左侧细条',
        'bar-wide': '左侧粗条',
        tint: '整行底色',
        dot: '前置圆点',
        text: '标题着色',
        line: '底部细线',
        glow: '外发光',
      },
      /* Language-neutral names of the three built-in presets. */
      presetNames: {
        default: '默认样式',
        waiting: '等待中',
        later: '稍后',
      },
    }

    const EN = {
      footer: 'Parked',
      panelTitle: 'Parked sessions',
      empty: 'No parked sessions',
      emptyHint: 'Just say it in chat, e.g. "park this, remind me later"',
      open: 'Open',
      clear: 'Clear',
      parked: 'Parked',
      header: 'Park note',
      headerParked: 'Parked',
      placeholder: 'Reminder, e.g. continue after the reply comes back…',
      save: 'Save',
      cancel: 'Cancel',
      errorEmpty: 'The note cannot be empty',
      errorFailed: 'Failed, please retry',
      errorOpen: 'Cannot open automatically — click that session in the sidebar',
      justNow: 'just now',
      minutesAgo: 'min ago',
      hoursAgo: 'h ago',
      daysAgo: 'd ago',
      parkAction: 'Park session',
      settings: 'Style settings',
      settingsNav: 'Parked Sessions',
      settingsNavHint: 'The same preferences as the gear inside the "Parked" sidebar panel — one configuration, and a change in either place takes effect immediately.',
      askOnPark: 'Ask for a style when parking',
      askOnParkHint: 'On: every park opens a dropdown of your presets. Off: the default preset is used.',
      tipPlacement: 'Note card position',
      tipPlacementHint: 'Right of the official card: side by side, independent of its height. Below-left: tucked under the official card, closer to the sidebar and easier to click.',
      tipPlacements: { right: 'Right of official card', below: 'Below-left of official card' },
      projectBadge: 'Show parked count on collapsed projects',
      projectBadgeHint: 'On: a collapsed project row shows how many of its sessions are parked. Hidden while expanded — the children are visible then, so the count is redundant.',
      panelStyles: 'Differentiate presets in the overview',
      panelStylesHint: 'On: every row of the parked list carries its own preset look (bar / tint / dot …), matching the sidebar. Off: all rows look the same.',
      timeChip: 'Put the timestamp in a chip',
      timeChipHint: 'On: the parked time gets a subtle filled chip so it stops blending into the background. Off: plain text.',
      sessionsParkedSuffix: 'sessions parked',
      preset: 'Style',
      presetName: 'Preset name',
      presetStyle: 'Style',
      presetColor: 'Color',
      presetOpacity: 'Strength',
      addPreset: 'Add preset',
      edit: 'Edit',
      delete: 'Delete',
      styleLabels: {
        bar: 'Left bar',
        'bar-wide': 'Left bar (thick)',
        tint: 'Row tint',
        dot: 'Leading dot',
        text: 'Title color',
        line: 'Bottom line',
        glow: 'Glow',
      },
      /* Language-neutral names of the three built-in presets. */
      presetNames: {
        default: 'Default',
        waiting: 'Waiting',
        later: 'Later',
      },
    }

    /**
     * Display name of a preset.
     *
     * The three built-in presets carry a language-neutral `nameKey`, so an
     * English UI reads "Default" instead of the stored Chinese fallback. A
     * renamed preset has no key, and its stored name wins.
     */
    function presetLabel(preset) {
      if (preset && preset.nameKey && t.presetNames[preset.nameKey]) return t.presetNames[preset.nameKey]
      return preset ? preset.name : ''
    }

    /**
     * The active dictionary — a mutable module binding on purpose.
     *
     * Every read site (`t.footer`, `t.styleLabels[…]`, …) resolves the CURRENT
     * dictionary at call time, so a runtime language switch only has to rebind
     * this one name: React surfaces re-render through the store (apply()
     * subscribes to `locale/change`), and the plain-DOM ones (hover tooltip,
     * park popover) read `t` when they are next built.
     *
     * Seeded from the document language so the bundle also works before — and
     * in compositions without — the locale face; apply() then aligns it to the
     * framework's active locale, which is the one the user actually picked
     * (document.documentElement.lang goes stale after an in-app language
     * switch, because the page never reloads).
     */
    let t = (document.documentElement.lang || navigator.language || 'en').toLowerCase().startsWith('zh') ? ZH : EN

    /** Locale namespace this plugin's dictionaries are published under. */
    const LOCALE_NS = 'dsh-session-suspend'

    /** Dictionary for one locale id ('zh', 'en', 'zh-CN', …; unknown reads as English). */
    function dictFor(localeId) {
      return String(localeId || '').toLowerCase().startsWith('zh') ? ZH : EN
    }

    /* ---------------------------------------------------------------- *
     * Inline CSS (design tokens only — no hard-coded colors).
     * ---------------------------------------------------------------- */

    const CSS = [
      '.dsh-suspend-footer{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;min-height:32px;padding:0 8px;border:0;border-radius:8px;background:0 0;color:var(--dsw-alias-label-secondary,#61666b);font:inherit;font-size:13px;line-height:1;cursor:pointer}',
      '.dsh-suspend-footer:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}',
      '.dsh-suspend-footer:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4176e6);outline-offset:-2px}',
      '.dsh-suspend-footer[data-rail=true]{position:relative;justify-content:center;width:32px;margin:0 auto;padding:0}',
      '.dsh-suspend-footer-label{flex:1;min-width:0;overflow:hidden;text-align:left;text-overflow:ellipsis;white-space:nowrap}',
      /* Count badge: a filled warn chip.
         DSH's own amber pair is warn-tertiary (fill) + warn-label (text): the
         fill flips per theme but the text stays amber-600 (#dd8629), which is
         only ~2.5:1 on the light surface — exactly the "not prominent" case.
         Filling with warn-primary (amber-500, a static token, byte-identical in
         both themes) and pairing it with neutral-1000 gives ~9.8:1 in both,
         the same solid-fill-plus-contrast-text recipe DSH uses for its error
         badge. `corner-shape: round` pairs with the radius so the pill's
         corners match DSH's global superellipse. */
      '.dsh-suspend-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:17px;padding:0 6px;border-radius:999px;corner-shape:round;background:var(--dsw-alias-state-warn-primary,#f59e0b);color:var(--dsw-static-neutral-1000,#000);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;line-height:17px;white-space:nowrap}',
      '.dsh-suspend-rail-dot{position:absolute;top:2px;right:2px;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-warn-primary,#f59e0b)}',
      '.dsh-suspend-row{--dsh-suspend-c:var(--dsw-alias-state-warn-primary,#f59e0b);--dsh-suspend-a:1}',
      /* Seven preset styles. Each reads the per-row custom properties set by the
         DOM highlighter (--dsh-suspend-c = colour, --dsh-suspend-a = strength),
         so one row can look different from the next. */
      '.dsh-suspend-row.dsh-suspend-s-bar{box-shadow:inset 3px 0 0 0 var(--dsh-suspend-c)}',
      '.dsh-suspend-row.dsh-suspend-s-bar-wide{box-shadow:inset 6px 0 0 0 var(--dsh-suspend-c)}',
      '.dsh-suspend-row.dsh-suspend-s-tint{background:color-mix(in srgb, var(--dsh-suspend-c) calc(var(--dsh-suspend-a) * 100%), transparent)}',
      '.dsh-suspend-row.dsh-suspend-s-dot{position:relative}',
      '.dsh-suspend-row.dsh-suspend-s-dot::before{content:"";position:absolute;left:4px;top:50%;width:6px;height:6px;margin-top:-3px;border-radius:50%;background:var(--dsh-suspend-c);opacity:var(--dsh-suspend-a)}',
      '.dsh-suspend-row.dsh-suspend-s-text .dsh-suspend-text,.dsh-suspend-row.dsh-suspend-s-text span[class*="title"]{color:var(--dsh-suspend-c)!important}',
      '.dsh-suspend-row.dsh-suspend-s-line{box-shadow:inset 0 -1px 0 0 var(--dsh-suspend-c)}',
      '.dsh-suspend-row.dsh-suspend-s-glow{box-shadow:0 0 0 1px color-mix(in srgb, var(--dsh-suspend-c) calc(var(--dsh-suspend-a) * 100%), transparent),0 0 8px 0 color-mix(in srgb, var(--dsh-suspend-c) calc(var(--dsh-suspend-a) * 60%), transparent)}',
      '.dsh-suspend-row{border-radius:8px}',
      /* Injected row park button: hidden until the row is hovered, exactly like
         the official "..." it sits beside. */
      '.dsh-suspend-park{display:none;flex:none;align-items:center;justify-content:center;width:16px;height:16px;margin:0;padding:0;border:0;border-radius:4px;background:0 0;color:var(--dsw-alias-label-tertiary,#81858c);font:inherit;cursor:pointer}',
      '[role="treeitem"]:hover .dsh-suspend-park{display:inline-flex}',
      '.dsh-suspend-park:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}',
      /* Settings view inside the parked-session panel. */
      '.dsh-suspend-panel-head-actions{display:flex;align-items:center;gap:6px}',
      '.dsh-suspend-panel-gear{width:22px;height:22px;border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-tertiary,#81858c);font:inherit;font-size:13px;line-height:1;cursor:pointer}',
      '.dsh-suspend-panel-gear:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}',
      '.dsh-suspend-panel-back{border:0;background:0 0;color:var(--dsw-alias-label-secondary,#61666b);font:inherit;font-size:12px;cursor:pointer;padding:2px 4px}',
      '.dsh-suspend-panel-back:hover{color:var(--dsw-alias-label-primary,#0f1115)}',
      '.dsh-suspend-settings{display:flex;flex-direction:column;gap:8px;padding:2px 4px 4px}',
      /* The official Settings window is far wider than the sidebar panel, so
         the same editor is capped and re-titled there (see SettingsSection). */
      '.dsh-suspend-page{display:flex;flex-direction:column;gap:10px;max-width:560px}',
      '.dsh-suspend-page-title{color:var(--dsw-alias-label-primary,#0f1115);font-size:13px;font-weight:600}',
      '.dsh-suspend-settings-toggle{display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer}',
      '.dsh-suspend-settings-hint{color:var(--dsw-alias-label-tertiary,#81858c);font-size:11px;line-height:15px}',
      '.dsh-suspend-settings-label{margin-top:2px;color:var(--dsw-alias-label-secondary,#4b4f56);font-size:12px;font-weight:500}',
      '.dsh-suspend-settings-list{display:flex;flex-direction:column;gap:2px}',
      '.dsh-suspend-settings-row{display:flex;align-items:center;gap:6px;padding:4px 2px}',
      '.dsh-suspend-settings-row:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);border-radius:8px}',
      '.dsh-suspend-swatch{width:18px;height:18px;flex:none;border-radius:5px}',
      '.dsh-suspend-settings-name{flex:1;min-width:0;overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-suspend-settings-meta{color:var(--dsw-alias-label-tertiary,#81858c);font-size:11px}',
      '.dsh-suspend-editor{display:flex;flex-direction:column;gap:8px;margin-top:4px;padding:8px;border-radius:10px;background:var(--dsw-alias-interactive-bg-hover,#2631480f)}',
      '.dsh-suspend-editor-color{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.dsh-suspend-editor-color input{width:28px;height:22px;padding:0;border:0;background:0 0;cursor:pointer}',
      '.dsh-suspend-editor-opacity{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.dsh-suspend-editor-opacity input{width:100%}',
      /* Native form controls. DSH never declares `color-scheme` on the element,
         and the only other native <select> in the wild (agent-team's owner
         picker) is completely unstyled — the option list then paints with the
         browser default light scheme and vanishes against our dark surface.
         Two fixes: (1) an opaque token background with a literal fallback, in
         the shape DSH's own settings select uses, and (2) `color-scheme`
         declared per theme. DSH's theme attribute is body[data-ds-dark-theme]
         (light is its absence) — a media query would be wrong because the
         preference is user-chosen, not OS-driven. */
      '.dsh-suspend-select{width:100%;min-height:28px;padding:0 30px 0 10px;border:.5px solid var(--dsw-alias-border-l4,#00000029);border-radius:8px;background-color:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base,#fff));color:var(--dsw-alias-label-primary,#0f1115);font:inherit;font-size:12px;line-height:22px;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\' fill=\'none\'%3E%3Cpath d=\'M3 4.5L6 7.5L9 4.5\' stroke=\'%2381858C\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:12px 12px;color-scheme:light}',
      '.dsh-suspend-select:focus{border-color:var(--dsw-alias-brand-primary,#0f1115);outline:none}',
      'body[data-ds-dark-theme] .dsh-suspend-select{color-scheme:dark}',
      '.dsh-suspend-editor-color input,.dsh-suspend-editor-opacity input{color-scheme:light}',
      'body[data-ds-dark-theme] .dsh-suspend-editor-color input,body[data-ds-dark-theme] .dsh-suspend-editor-opacity input{color-scheme:dark}',
      '.dsh-suspend-pop-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#61666b)}',
      '.dsh-suspend-panel{position:fixed;z-index:1000;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;width:300px;max-width:calc(100vw - 24px);max-height:min(420px,100vh - 120px);padding:8px;border-radius:16px;background:var(--dsw-specific-menu,#fff);color:var(--dsw-alias-label-primary,#0f1115);box-shadow:var(--dsw-elevation-prominent,0 0 0 .5px #0000000a,0 3px 8px 0 #00000008,0 0 20px 0 #0000000d);font-size:12px;overflow:auto}',
      '.dsh-suspend-panel-head{display:flex;align-items:center;justify-content:space-between;padding:2px 6px 6px}',
      '.dsh-suspend-panel-title{font-size:13px;font-weight:600}',
      '.dsh-suspend-panel-count{color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.dsh-suspend-panel-empty{display:flex;flex-direction:column;gap:6px;padding:14px 8px;color:var(--dsw-alias-label-tertiary,#81858c);text-align:center}',
      '.dsh-suspend-panel-hint{font-size:11px;line-height:16px}',
      '.dsh-suspend-panel-list{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none}',
      '.dsh-suspend-panel-row{display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:10px}',
      '.dsh-suspend-panel-row:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}',
      '.dsh-suspend-panel-row-title{overflow:hidden;font-size:13px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-suspend-panel-row-note{color:var(--dsw-alias-label-secondary,#61666b);line-height:17px;white-space:pre-wrap;word-break:break-word}',
      '.dsh-suspend-panel-row-foot{display:flex;align-items:center;justify-content:space-between;margin-top:2px}',
      '.dsh-suspend-panel-row-time{color:var(--dsw-alias-label-tertiary,#81858c);font-size:11px}',
      '.dsh-suspend-panel-row-actions{display:flex;gap:6px}',
      /* Panel rows carry the preset's signature, so a preset is recognisable in
         the overview without cross-referencing the sidebar. The seven rules
         mirror the sidebar ones exactly; only the scope differs. The row keeps
         `position:relative` unconditionally so the dot's containing block does
         not change when a style is applied or removed. */
      '.dsh-suspend-panel-row{position:relative}',
      '.dsh-suspend-panel-row.dsh-suspend-s-bar{box-shadow:inset 3px 0 0 0 var(--dsh-suspend-c)}',
      '.dsh-suspend-panel-row.dsh-suspend-s-bar-wide{box-shadow:inset 6px 0 0 0 var(--dsh-suspend-c)}',
      '.dsh-suspend-panel-row.dsh-suspend-s-tint{background:color-mix(in srgb, var(--dsh-suspend-c) calc(var(--dsh-suspend-a) * 100%), transparent)}',
      '.dsh-suspend-panel-row.dsh-suspend-s-dot::before{content:"";position:absolute;left:6px;top:14px;width:6px;height:6px;border-radius:50%;background:var(--dsh-suspend-c);opacity:var(--dsh-suspend-a)}',
      '.dsh-suspend-panel-row.dsh-suspend-s-dot{padding-left:18px}',
      '.dsh-suspend-panel-row.dsh-suspend-s-text .dsh-suspend-panel-row-title{color:var(--dsh-suspend-c)}',
      '.dsh-suspend-panel-row.dsh-suspend-s-line{box-shadow:inset 0 -1px 0 0 var(--dsh-suspend-c)}',
      '.dsh-suspend-panel-row.dsh-suspend-s-glow{box-shadow:0 0 0 1px color-mix(in srgb, var(--dsh-suspend-c) calc(var(--dsh-suspend-a) * 100%), transparent),0 0 8px 0 color-mix(in srgb, var(--dsh-suspend-c) calc(var(--dsh-suspend-a) * 60%), transparent)}',
      /* The parked-time stamp, as a chip.
         The bare 11px tertiary label sat at roughly 3.4:1 against the panel
         surface and had no container, so it read as noise rather than as data.
         A chip gives it the containment Material specifies for compact
         metadata — filled container, 1px stroke, 8px radius, tight padding —
         using DSH's own tokens so it follows both themes. The stroke uses
         border-l4 (the same hairline DSH uses for input borders) rather than
         the label colour, which would be far too heavy at 1px. */
      '.dsh-suspend-time-chip{display:inline-flex;align-items:center;height:18px;padding:0 6px;border:.5px solid var(--dsw-alias-border-l4,#00000029);border-radius:8px;corner-shape:round;background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-secondary,#61666b);font-size:11px;font-variant-numeric:tabular-nums;line-height:16px;white-space:nowrap}',
      /* Collapsed-group count badge.
         Quiet on purpose: the amber chip is reserved for the parked session
         rows themselves, so an aggregate on a folder row must not compete with
         them. Secondary label on the interactive tint clears ~4.6:1 in both
         themes, and tabular-nums keeps the width from twitching as the count
         changes. `flex:none` because the official row is a flex container
         whose title span is flex:1 — appending lands the badge on the right
         edge without disturbing the official layout. */
      '.dsh-suspend-project-count{display:inline-flex;align-items:center;justify-content:center;flex:none;min-width:16px;height:16px;padding:0 5px;border-radius:999px;corner-shape:round;background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-secondary,#61666b);font-size:10px;font-weight:600;font-variant-numeric:tabular-nums;line-height:16px;white-space:nowrap;pointer-events:none}',
      '.dsh-suspend-btn{min-height:24px;padding:2px 8px;border:0;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115);font:inherit;font-size:12px;cursor:pointer}',
      '.dsh-suspend-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f)}',
      '.dsh-suspend-btn-danger{color:var(--dsw-alias-state-warn-label,#dd8629)}',
      '.dsh-suspend-panel-status{padding:2px 6px;color:var(--dsw-alias-state-warn-label,#dd8629);font-size:11px}',
      '.dsh-suspend-tip{position:fixed;z-index:1000;display:none;flex-direction:column;gap:6px;box-sizing:border-box;width:max-content;max-width:' + TIP_MAX_WIDTH + 'px;padding:10px 12px;border-radius:12px;background:var(--dsw-specific-menu,#fff);color:var(--dsw-alias-label-primary,#0f1115);box-shadow:var(--dsw-elevation-prominent,0 0 0 .5px #0000000a,0 3px 8px 0 #00000008,0 0 20px 0 #0000000d);font-size:12px;line-height:17px}',
      '.dsh-suspend-tip-head{display:flex;align-items:center;gap:8px}',
      /* Tooltip "已挂起" label: amber-600 text is ~2.5:1 on the light sidebar,
         so it gets the same filled chip as the count badge. */
      '.dsh-suspend-tip-label{display:inline-flex;align-items:center;height:17px;padding:0 6px;border-radius:999px;corner-shape:round;background:var(--dsw-alias-state-warn-primary,#f59e0b);color:var(--dsw-static-neutral-1000,#000);font-size:11px;font-weight:600;line-height:17px;white-space:nowrap}',
      '.dsh-suspend-tip-time{color:var(--dsw-alias-label-tertiary,#81858c);font-size:11px}',
      '.dsh-suspend-tip-note{white-space:pre-wrap;word-break:break-word}',
      '.dsh-suspend-tip-actions{display:flex;gap:6px;margin-top:2px}',
      '.dsh-suspend-header{display:inline-flex;align-items:center;gap:4px;min-height:24px;padding:2px 8px;border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-tertiary,#81858c);font:inherit;font-size:12px;cursor:pointer}',
      '.dsh-suspend-header:hover{background:var(--dsw-alias-interactive-bg-hover,#2631480f);color:var(--dsw-alias-label-primary,#0f1115)}',
      /* Parked header button: the same filled warn chip, so "已挂起" reads at a
         glance in both themes instead of a low-contrast amber word. */
      '.dsh-suspend-header[data-parked=true]{background:var(--dsw-alias-state-warn-primary,#f59e0b);color:var(--dsw-static-neutral-1000,#000);font-weight:600}',
      '.dsh-suspend-pop{position:fixed;z-index:1000;display:flex;flex-direction:column;gap:8px;box-sizing:border-box;width:272px;max-width:calc(100vw - 24px);padding:12px;border-radius:16px;background:var(--dsw-specific-menu,#fff);color:var(--dsw-alias-label-primary,#0f1115);box-shadow:var(--dsw-elevation-prominent,0 0 0 .5px #0000000a,0 3px 8px 0 #00000008,0 0 20px 0 #0000000d);font-size:12px}',
      '.dsh-suspend-input{box-sizing:border-box;width:100%;min-height:64px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1,#0000000a);border-radius:8px;background:0 0;color:var(--dsw-alias-label-primary,#0f1115);font:inherit;font-size:12px;line-height:17px;resize:vertical}',
      '.dsh-suspend-input:focus{border-color:var(--dsw-alias-state-business-primary,#4176e6);outline:none}',
      '.dsh-suspend-pop-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px}',
      '.dsh-suspend-pop-status{margin-right:auto;color:var(--dsw-alias-state-warn-label,#dd8629);font-size:11px}',
    ].join('')

    const STYLE_ID = `${PLUGIN_ID}:styles`

    function injectCss() {
      if (document.getElementById(STYLE_ID)) return null
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.dataset.plugin = PLUGIN_ID
      style.dataset.pluginCss = PLUGIN_ID
      style.textContent = CSS
      document.head.appendChild(style)
      return style
    }

    /* ---------------------------------------------------------------- *
     * Module store: notes (from host), titles (from the session list),
     * one immutable snapshot for useSyncExternalStore.
     * ---------------------------------------------------------------- */

     /** @type {{ notes: Record<string, { note: string, createdAt: string, presetId: string }>, titles: Record<string, string>, presets: PresetState }} */
    const store = {
      notes: {},
      titles: {},
      presets: EMPTY_PRESETS(),
      snapshot: { notes: {}, titles: {}, presets: EMPTY_PRESETS() },
      listeners: new Set(),
    }

    function emitChange() {
      store.snapshot = { notes: { ...store.notes }, titles: { ...store.titles }, presets: store.presets }
      for (const listener of store.listeners) listener()
    }

    function subscribe(listener) {
      store.listeners.add(listener)
      return () => store.listeners.delete(listener)
    }

    function getSnapshot() {
      return store.snapshot
    }

    function useSuspendStore() {
      return React.useSyncExternalStore(subscribe, getSnapshot)
    }

    function sameNotes(left, right) {
      const leftKeys = Object.keys(left)
      if (leftKeys.length !== Object.keys(right).length) return false
      for (const key of leftKeys) {
        const a = left[key]
        const b = right[key]
        if (!b || a.note !== b.note || a.createdAt !== b.createdAt || a.presetId !== b.presetId) return false
      }
      return true
    }

    function sameStringMap(left, right) {
      const leftKeys = Object.keys(left)
      if (leftKeys.length !== Object.keys(right).length) return false
      return leftKeys.every((key) => left[key] === right[key])
    }

    /* ---------------------------------------------------------------- *
     * Host client.
     * ---------------------------------------------------------------- */

    async function requestJson(path, options) {
      const response = await fetch(path, options)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    }

    async function pullNotes() {
      const data = await requestJson(`${ROUTE}/list`, { headers: { accept: 'application/json' } })
      const raw = data && data.ok && data.notes && typeof data.notes === 'object' ? data.notes : {}
      const next = {}
      for (const [sessionId, value] of Object.entries(raw)) {
        if (value && typeof value.note === 'string') {
          next[sessionId] = {
            note: value.note,
            createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
            presetId: typeof value.presetId === 'string' ? value.presetId : '',
          }
        }
      }
      if (sameNotes(store.notes, next)) return
      store.notes = next
      emitChange()
      scheduleRowSync(0)
    }

    /** Normalize one host preset, dropping anything malformed. */
    function normalizePreset(raw) {
      if (!raw || typeof raw !== 'object') return null
      const id = typeof raw.id === 'string' ? raw.id : ''
      const name = typeof raw.name === 'string' ? raw.name : ''
      if (!id || !name || !STYLE_IDS.includes(raw.style)) return null
      const color = typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : '#e8a33d'
      const opacity = typeof raw.opacity === 'number' && Number.isFinite(raw.opacity) ? Math.min(1, Math.max(0, raw.opacity)) : 1
      const preset = { id, name, style: raw.style, color, opacity }
      /* nameKey is language-neutral; the host only re-emits known keys. */
      if (typeof raw.nameKey === 'string' && raw.nameKey) preset.nameKey = raw.nameKey
      return preset
    }

    async function pullPresets() {
      let data
      try {
        data = await requestJson(`${ROUTE}/presets`, { headers: { accept: 'application/json' } })
      } catch {
        return // host without the presets route (older build): keep the last state
      }
      if (!data || !data.ok) return
      const presets = (Array.isArray(data.presets) ? data.presets : []).map(normalizePreset).filter(Boolean)
      const next = {
        askOnPark: data.askOnPark === true,
        defaultPresetId: typeof data.defaultPresetId === 'string' ? data.defaultPresetId : '',
        tipPlacement: TIP_PLACEMENTS.includes(data.tipPlacement) ? data.tipPlacement : 'below',
        tipPlacements: Array.isArray(data.tipPlacements) && data.tipPlacements.length ? data.tipPlacements : TIP_PLACEMENTS,
        styles: Array.isArray(data.styles) && data.styles.length ? data.styles : STYLE_IDS,
        /* Default-on toggles: `!== false` so a host that predates the key
           (or an absent field) keeps the feature enabled. */
        projectBadge: data.projectBadge !== false,
        panelStyles: data.panelStyles !== false,
        timeChip: data.timeChip !== false,
        presets,
      }
      if (samePresets(store.presets, next)) return
      store.presets = next
      emitChange()
      scheduleRowSync(0)
    }

    async function savePresets(next) {
      const body = {
        askOnPark: next.askOnPark === true,
        defaultPresetId: next.defaultPresetId,
        tipPlacement: next.tipPlacement,
        projectBadge: next.projectBadge !== false,
        panelStyles: next.panelStyles !== false,
        timeChip: next.timeChip !== false,
        presets: next.presets.map((p) => ({
          id: p.id,
          name: p.name,
          /* Round-trip the language-neutral key so a rename can be undone by
             re-selecting the built-in label; the host drops unknown keys. */
          nameKey: p.nameKey,
          style: p.style,
          color: p.color,
          opacity: p.opacity,
        })),
      }
      const data = await requestJson(`${ROUTE}/presets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      })
      if (data && data.ok) {
        store.presets = {
          askOnPark: data.askOnPark === true,
          defaultPresetId: typeof data.defaultPresetId === 'string' ? data.defaultPresetId : '',
          tipPlacement: TIP_PLACEMENTS.includes(data.tipPlacement) ? data.tipPlacement : 'below',
          tipPlacements: Array.isArray(data.tipPlacements) && data.tipPlacements.length ? data.tipPlacements : TIP_PLACEMENTS,
          styles: Array.isArray(data.styles) && data.styles.length ? data.styles : STYLE_IDS,
          projectBadge: data.projectBadge !== false,
          panelStyles: data.panelStyles !== false,
          timeChip: data.timeChip !== false,
          presets: (data.presets || []).map(normalizePreset).filter(Boolean),
        }
        emitChange()
        scheduleRowSync(0)
      }
      return data
    }

    /** The preset a parked session should paint with (falls back to the first). */
    function presetFor(note) {
      const list = store.presets.presets
      if (!list.length) return null
      const wanted = note && note.presetId
      return list.find((p) => p.id === wanted) || list.find((p) => p.id === store.presets.defaultPresetId) || list[0]
    }

    async function setNote(sessionId, note, presetId) {
      await requestJson(`${ROUTE}/set`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sessionId, note, presetId: presetId || undefined }),
      })
      await pullNotes()
    }

    async function clearNote(sessionId) {
      await requestJson(`${ROUTE}/clear`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      await pullNotes()
    }

    /* ---------------------------------------------------------------- *
     * Sidebar row highlighter (DOM augmentation).
     *
     * Official session rows expose no per-row slot and only read the
     * built-in `schedule` projection, so the highlight is written straight
     * onto the row element: an attribute (stable across re-renders) plus a
     * class (re-applied after React re-renders via observer + interval).
     *
     * A row is matched when ANY of its leaf texts equals a parked session
     * title — the official row renders `span.title` first, then a schedule
     * indicator, a relative time label and the row menu, so keying off the
     * first leaf text alone would be fragile.
     * ---------------------------------------------------------------- */

    let rowSyncTimer = 0

    function scheduleRowSync(delay) {
      if (rowSyncTimer) return
      rowSyncTimer = setTimeout(() => {
        rowSyncTimer = 0
        syncRows()
      }, delay)
    }

    /**
     * First suspended note per row title (duplicate titles stay ambiguous by design).
     *
     * The value carries BOTH the note fields (note/createdAt/presetId) and the
     * sessionId, because the same object is handed to paintRow()/presetFor()
     * (which read the note fields) and to the row-attribute/injection code
     * (which reads sessionId). Returning a nested `{sessionId, entry}` shape
     * here would leave presetFor() reading undefined and silently falling back
     * to the default preset for every row.
     */
    function noteByTitle() {
      const map = new Map()
      for (const [sessionId, entry] of Object.entries(store.notes)) {
        const title = store.titles[sessionId]
        if (!title) continue
        if (!map.has(title)) map.set(title, { ...entry, sessionId })
      }
      return map
    }

    /** Every non-empty leaf text of a row: title, time label, status, … *
     * Matching accepts any of them, so a badge or time label rendered before
     * the title cannot break the lookup (official rows put `span.title` first,
     * followed by a schedule indicator, a time label and the row menu). */
    function rowTexts(row) {
      const texts = []
      for (const span of row.querySelectorAll('span')) {
        if (span.children.length !== 0) continue
        const text = (span.textContent || '').trim()
        if (text) texts.push(text)
      }
      return texts
    }

    function isSidebarRow(row) {
      const rect = row.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && rect.left < SIDEBAR_MAX_LEFT
    }

    /**
     * Is this tree row a Workspace group header rather than a session?
     *
     * Session rows carry `aria-selected`; group rows carry `aria-expanded`.
     * Neither has an id or data-*, so the attribute is the only DOM signal.
     * Search results are `<button>`s, hence the tag check.
     */
    function isProjectRow(row) {
      return row.tagName === 'DIV' && row.hasAttribute('aria-expanded') && !row.hasAttribute('aria-selected')
    }

    /**
     * The group key a project row represents, read from its React fiber.
     *
     * ProjectRowItem receives `group` (a GroupNode) while SessionNodeItem
     * receives `node`, so probing for `group` cleanly separates the two. The
     * key matches what `workspaceMembers` is indexed by: a workspaceId, or ''
     * for the ungrouped bucket. Returns null when the fiber is unreachable.
     */
    function projectGroupKey(row) {
      try {
        const key = Object.keys(row).find((name) => name.startsWith('__reactFiber$'))
        let fiber = key ? row[key] : null
        for (let depth = 0; fiber && depth < 12; depth += 1) {
          const group = fiber.memoizedProps && fiber.memoizedProps.group
          if (group && typeof group === 'object') {
            if (typeof group.key === 'string') return group.key
            if (typeof group.workspaceId === 'string') return group.workspaceId
            return ''
          }
          fiber = fiber.return
        }
      } catch {
        // React internals are not a contract.
      }
      return null
    }

    /**
     * Parked-session count per group key.
     *
     * Membership comes from the Workspace Controller snapshot, not from the
     * DOM, precisely because a folded group renders no session rows. The
     * ungrouped bucket is derived: a parked session that no workspace claims
     * and that the live list still knows about.
     */
    function parkedCountsByGroup() {
      const counts = new Map()
      const claimed = new Set()
      const known = knownSessionIds.size ? knownSessionIds : null
      for (const group of workspaceMembers) {
        let total = 0
        for (const id of group.sessionIds || []) {
          claimed.add(id)
          if (store.notes[id] && (!known || known.has(id))) total += 1
        }
        if (total > 0) counts.set(group.key, total)
      }
      let ungrouped = 0
      for (const id of Object.keys(store.notes)) {
        if (claimed.has(id)) continue
        if (known && !known.has(id)) continue
        ungrouped += 1
      }
      if (ungrouped > 0) counts.set('', ungrouped)
      return counts
    }

    /**
     * Draw (or clear) the count badge on one group row.
     *
     * Shown only while the group is FOLDED and it actually has parked
     * sessions. While expanded the children are visible, so a count is
     * redundant — the badge is removed from the DOM rather than hidden, which
     * is what the reference implementation does and keeps the hover/click
     * geometry of the row honest.
     */
    function paintProjectBadge(row, counts) {
      const existing = row.querySelector(`.${PROJECT_COUNT_CLASS}`)
      const drop = () => {
        if (existing && existing.isConnected) existing.remove()
        row.removeAttribute(PROJECT_ATTR)
      }
      if (!counts || row.getAttribute('aria-expanded') === 'true') {
        drop()
        return
      }
      const groupKey = projectGroupKey(row)
      if (groupKey === null) {
        drop()
        return
      }
      const count = counts.get(groupKey) || 0
      if (count <= 0) {
        drop()
        return
      }
      let badge = existing
      if (!badge || !badge.isConnected) {
        badge = document.createElement('span')
        badge.className = PROJECT_COUNT_CLASS
        /* Appended last: the row is a flex container whose title span is
           flex:1, so anything after it lands on the right edge. */
        row.appendChild(badge)
      }
      const text = String(count)
      if (badge.textContent !== text) badge.textContent = text
      badge.title = `${count} ${t.sessionsParkedSuffix}`
      row.setAttribute(PROJECT_ATTR, groupKey)
    }

    function clearRowPaint(row) {
      row.classList.remove(ROW_CLASS)
      for (const style of STYLE_IDS) row.classList.remove(`dsh-suspend-s-${style}`)
      row.style.removeProperty('--dsh-suspend-c')
      row.style.removeProperty('--dsh-suspend-a')
    }

    function syncRows() {
      const byTitle = noteByTitle()
      /* Computed once per pass, and only when the feature is on. */
      const counts = store.presets.projectBadge !== false ? parkedCountsByGroup() : null
      for (const row of document.querySelectorAll('[role="treeitem"]')) {
        /* One malformed row must never abort the pass: syncRows runs from a
           MutationObserver and a timer, so a throw here would silently stop
           EVERY row from being painted until the next unrelated mutation.
           Fail-closed per row — the rest of the list still highlights. */
        try {
          if (!isSidebarRow(row)) continue
          /* Group rows are handled here and never fall through to the session
             logic. This is also what stops a workspace label that happens to
             equal a parked session's title from stamping the group row: the
             title lookup below can no longer see project rows at all. */
          if (isProjectRow(row)) {
            paintProjectBadge(row, counts)
            continue
          }
          let hit
          for (const text of rowTexts(row)) {
            hit = byTitle.get(text)
            if (hit) break
          }
          if (hit) {
            row.setAttribute(ROW_ATTR, hit.sessionId)
            paintRow(row, hit)
            injectRowAction(row, hit.sessionId)
            continue
          }
          if (row.hasAttribute(ROW_ATTR)) {
            row.removeAttribute(ROW_ATTR)
            clearRowPaint(row)
            removeRowAction(row)
            continue
          }
          // Not parked: still offer the park button when the row resolves to a session.
          if (rowSessionId(row)) injectRowAction(row, '')
        } catch (error) {
          console.warn('[dsh-session-suspend] skipped one sidebar row:', error)
        }
      }
    }

    /**
     * Apply one preset's visual signature to any element.
     *
     * Shared by the sidebar row highlighter and the parked-list panel, so a
     * preset looks the same wherever it appears. The element needs no prior
     * class: the style class carries the look and the two custom properties
     * carry the colour and strength, which is why the CSS rules are written
     * against the class alone rather than against `.dsh-suspend-row`.
     *
     * DOM elements only. A React element from createElement() is NOT one — it
     * has no classList — and the throw that used to escape here took the whole
     * slot registration down with it, so the guard is deliberate: a wrong
     * argument costs a missing highlight, never the sidebar.
     */
    function applyPresetStyle(el, preset) {
      if (!el || !preset) return
      if (!el.classList || typeof el.classList.add !== 'function') return
      for (const style of STYLE_IDS) el.classList.remove(`dsh-suspend-s-${style}`)
      el.classList.add(`dsh-suspend-s-${preset.style}`)
      el.style.setProperty('--dsh-suspend-c', preset.color)
      el.style.setProperty('--dsh-suspend-a', String(preset.opacity))
    }

    /** Apply one note's preset to its row: a style class plus two custom props. */
    function paintRow(row, hit) {
      row.classList.add(ROW_CLASS)
      applyPresetStyle(row, presetFor(hit))
    }

    /* ---------------------------------------------------------------- *
     * Row park button (DOM augmentation).
     *
     * The official three-dot session menu is a hardcoded item array with no
     * slot (verified in dsh-client-ui-workspace), so a fourth menu item is not
     * reachable through the slot registry. The closest equivalent is a button
     * in the row's own action cluster, revealed on row hover exactly like the
     * official "...". The row DOM carries no session id, so it is recovered
     * from the React fiber above the row, with a title lookup as fallback.
     * ---------------------------------------------------------------- */

    /** Class written on the injected park button. */
    const PARK_BTN_CLASS = 'dsh-suspend-park'
    /** sessionId by title, filled from the useSessions hook when the sidebar provides it. */
    const sessionsByTitle = new Map()

    /** 16x16 pin glyph, inlined so the client half keeps zero dependencies. */
    const PIN_SVG =
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M9.5 1.8 14.2 6.5l-2.3.7-2.1 2.1.5 3.1-1.6 1.6-2-4.4-3.4-3.4 4.4-2 1.6-1.6z"/></svg>'

    /**
     * Recover the session id behind a row.
     * @returns the session id, or '' when it cannot be determined.
     */
    function rowSessionId(row) {
      // 1. React fiber: the row's parent component owns `node` with the id.
      try {
        const key = Object.keys(row).find((name) => name.startsWith('__reactFiber$'))
        let fiber = key ? row[key] : null
        for (let depth = 0; fiber && depth < 12; depth += 1) {
          const node = fiber.memoizedProps && fiber.memoizedProps.node
          if (node && typeof node.id === 'string' && node.id && ('blank' in node || 'updatedAt' in node)) return node.id
          fiber = fiber.return
        }
      } catch {
        // React internals are not a contract: fall through to the heuristics.
      }
      // 2. Title lookup against the live session list.
      for (const text of rowTexts(row)) {
        const id = sessionsByTitle.get(text)
        if (id) return id
      }
      // 3. Already parked: the highlighter wrote the id itself.
      return row.getAttribute(ROW_ATTR) || ''
    }

    function injectRowAction(row, sessionId) {
      const host = row.lastElementChild
      if (!host || host === row) return
      let button = host.querySelector(`.${PARK_BTN_CLASS}`)
      if (!button) {
        button = document.createElement('button')
        button.type = 'button'
        button.className = PARK_BTN_CLASS
        button.innerHTML = PIN_SVG
        // Never let the row's own click handler open the session.
        button.addEventListener('pointerdown', (event) => event.stopPropagation())
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          const id = rowSessionId(row)
          if (id) openParkPopover(button, id)
        })
        host.appendChild(button)
      }
      /* Refreshed on EVERY call, not only at creation.

         syncRows runs from a MutationObserver and a timer, and a language
         switch rebinds `t` without rebuilding the row -- React keeps the same
         DOM node, so injectRowAction takes the "button already exists" branch
         and a title captured once would keep the OLD language's tooltip and
         aria-label until React happens to replace the row. The locale effect's
         comment claims the plain-DOM surfaces "read `t` when they are next
         built"; this one is never rebuilt, so it has to be re-read here. */
      button.title = t.parkAction
      button.setAttribute('aria-label', t.parkAction)
      if (sessionId) button.setAttribute('data-session', sessionId)
    }

    function removeRowAction(row) {
      const button = row.querySelector(`.${PARK_BTN_CLASS}`)
      if (button) button.remove()
    }

    function unmarkAllRows() {
      for (const row of document.querySelectorAll(`[${ROW_ATTR}]`)) {
        row.removeAttribute(ROW_ATTR)
        clearRowPaint(row)
      }
      for (const button of document.querySelectorAll(`.${PARK_BTN_CLASS}`)) button.remove()
      for (const badge of document.querySelectorAll(`.${PROJECT_COUNT_CLASS}`)) badge.remove()
      for (const row of document.querySelectorAll(`[${PROJECT_ATTR}]`)) row.removeAttribute(PROJECT_ATTR)
    }

    /* ---------------------------------------------------------------- *
     * Hover tooltip (plain DOM, delegated once on document).
     * ---------------------------------------------------------------- */

    let tipRoot = null
    let tipTimer = 0
    let tipHideTimer = 0
    let hoveredRow = null
    /** Captured client context, used for uiWorkspace.openSession. */
    let rootCtx = null

    function ensureTipRoot() {
      if (tipRoot && tipRoot.isConnected) return tipRoot
      tipRoot = document.createElement('div')
      tipRoot.className = 'dsh-suspend-tip'
      tipRoot.setAttribute('role', 'tooltip')
      tipRoot.setAttribute('data-plugin', PLUGIN_ID)
      tipRoot.style.display = 'none'
      tipRoot.addEventListener('pointerdown', (event) => event.stopPropagation())
      document.body.appendChild(tipRoot)
      return tipRoot
    }

    function tipButton(label, onClick, danger) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = danger ? 'dsh-suspend-btn dsh-suspend-btn-danger' : 'dsh-suspend-btn'
      button.textContent = label
      button.addEventListener('click', () => {
        hideTip()
        onClick()
      })
      return button
    }

    function buildTipContent(sessionId, entry) {
      const root = ensureTipRoot()
      root.textContent = ''

      const head = document.createElement('div')
      head.className = 'dsh-suspend-tip-head'
      const label = document.createElement('span')
      label.className = 'dsh-suspend-tip-label'
      label.textContent = t.parked
      const time = document.createElement('span')
      time.className = 'dsh-suspend-tip-time'
      time.textContent = relativeTime(entry.createdAt)
      head.append(label, time)

      const note = document.createElement('div')
      note.className = 'dsh-suspend-tip-note'
      note.textContent = entry.note

      const actions = document.createElement('div')
      actions.className = 'dsh-suspend-tip-actions'
      actions.append(
        tipButton(t.open, () => {
          if (!openSession(sessionId)) {
            const hint = document.createElement('span')
            hint.className = 'dsh-suspend-tip-time'
            hint.textContent = t.errorOpen
            actions.append(hint)
          }
        }),
        tipButton(t.clear, () => {
          clearNote(sessionId).catch(() => {})
        }, true),
      )

      root.append(head, note, actions)
    }

    /**
     * Bottom edge of DSH's own hover card, or 0 when it cannot be found.
     *
     * The card is portaled to document.body at left = rowRect.right + 8 and
     * top = rowRect.top, with a 244px width. That triple is specific enough to
     * identify it by geometry without depending on any internal class name.
     * The walk is depth-limited because it runs on every placement.
     */
    function officialCardBottom(rowRect) {
      const targetLeft = rowRect.right + 8
      let bottom = 0
      const walk = (node, depth) => {
        if (depth > 4 || !node.children) return
        for (const child of node.children) {
          if (typeof child.getBoundingClientRect === 'function') {
            const r = child.getBoundingClientRect()
            if (
              r.width >= 200 && r.width <= 280 && r.height > 20 &&
              Math.abs(r.left - targetLeft) <= 8 &&
              r.top >= rowRect.top - 8 && r.top <= rowRect.top + 8 &&
              r.bottom > bottom
            ) {
              bottom = r.bottom
            }
          }
          walk(child, depth + 1)
        }
      }
      walk(document.body, 0)
      return bottom
    }

    /**
     * Place the tooltip per the user's configured placement.
     *
     *   right — beside DSH's hover card, past its 244px width. Deterministic,
     *           needs no measurement, so it can never jump; the pointer trip
     *           is long (~385px) but the card is clearly separate from DSH's.
     *   below — under DSH's card at the same left edge. Nothing in the sidebar
     *           is covered, DSH's card stays fully visible, and the pointer
     *           trip is short (~162px) so its buttons stay reachable inside
     *           DSH's own 200ms grace.
     *
     * Either way the card leaves the sidebar band: anchoring it to the row and
     * growing downward is what used to cover the sessions below it.
     */
    function placeTip(row) {
      if (!tipRoot || tipRoot.style.display === 'none') return
      const rect = row.getBoundingClientRect()
      const box = tipRoot.getBoundingClientRect()
      const gutter = 8
      const maxLeft = window.innerWidth - box.width - gutter
      let left
      let top
      if (store.presets.tipPlacement === 'below') {
        const cardBottom = officialCardBottom(rect)
        if (cardBottom > 0) {
          left = rect.right + gutter
          top = cardBottom + gutter
        } else {
          /* DSH's card is not measurable right now (it commits on the same
             500ms dwell). Use the deterministic spot rather than guessing a
             height and ending up on top of it. */
          left = rect.right + TIP_CARD_CLEARANCE
          top = rect.top
        }
      } else {
        left = rect.right + TIP_CARD_CLEARANCE
        top = rect.top
      }
      if (left > maxLeft) left = maxLeft
      if (top + box.height > window.innerHeight - gutter) {
        top = Math.max(gutter, window.innerHeight - box.height - gutter)
      }
      tipRoot.style.left = `${Math.round(left)}px`
      tipRoot.style.top = `${Math.round(top)}px`
    }

    function showTip(row, sessionId) {
      const entry = store.notes[sessionId]
      if (!entry) {
        hideTip()
        return
      }
      const root = ensureTipRoot()
      buildTipContent(sessionId, entry)
      root.style.display = 'flex'
      placeTip(row)
    }

    /**
     * Show the tooltip, but first give DSH's own card time to lay out.
     *
     * Our dwell is a floor and DSH's is not a contract — it was 500ms in 0.1.6
     * and 800ms for the session-row card in 0.1.7 — so the wait has to be a
     * time budget rather than a frame count. Placing immediately and
     * correcting later made the card visibly slide from beside DSH's card to
     * underneath it, so instead we wait until the card is measurable (or the
     * budget runs out) and place once. Nothing is displayed until then, so a
     * late host card costs latency, never a jump.
     *
     * 'right' placement needs no measurement, so it never waits.
     *
     * A MISSING deadline is treated as "no budget", not as "wait forever". The
     * wait ends when the card is measurable or when the budget runs out; with
     * no deadline there is no budget to run out of, and the guard that reads as
     * defensive (`typeof deadline === 'number'`) inverts the safe default --
     * outOfTime stays false, the frame callback re-enters, and the tooltip
     * never appears at all. The deterministic fallback is what a host that
     * shows no card is supposed to get, so "no budget" means "place now".
     */
    function showTipWhenReady(row, sessionId, deadline) {
      if (hoveredRow !== row || !row.isConnected) return
      if (store.presets.tipPlacement === 'below') {
        const hasBudget = typeof deadline === 'number' && Number.isFinite(deadline)
        const outOfTime = !hasBudget || Date.now() >= deadline
        if (!outOfTime && officialCardBottom(row.getBoundingClientRect()) === 0) {
          requestAnimationFrame(() => showTipWhenReady(row, sessionId, deadline))
          return
        }
      }
      showTip(row, sessionId)
    }

    function hideTip() {
      if (tipTimer) {
        clearTimeout(tipTimer)
        tipTimer = 0
      }
      if (tipHideTimer) {
        clearTimeout(tipHideTimer)
        tipHideTimer = 0
      }
      hoveredRow = null
      if (tipRoot) tipRoot.style.display = 'none'
    }

    /** Delay hiding so the pointer can travel from the row onto the tooltip. */
    function armTipHide() {
      if (tipHideTimer) clearTimeout(tipHideTimer)
      tipHideTimer = setTimeout(() => {
        tipHideTimer = 0
        hideTip()
      }, TIP_HIDE_GRACE_MS)
    }

    function onPointerOver(event) {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (tipRoot && tipRoot.contains(target)) {
        if (tipTimer) {
          clearTimeout(tipTimer)
          tipTimer = 0
        }
        if (tipHideTimer) {
          clearTimeout(tipHideTimer)
          tipHideTimer = 0
        }
        return
      }
      const row = target.closest(`[${ROW_ATTR}]`)
      if (!row) {
        // Left the row: give the pointer time to reach the tooltip before hiding.
        if (tipRoot && tipRoot.style.display !== 'none') armTipHide()
        return
      }
      if (row === hoveredRow) return
      hoveredRow = row
      if (tipHideTimer) {
        clearTimeout(tipHideTimer)
        tipHideTimer = 0
      }
      if (tipTimer) clearTimeout(tipTimer)
      const sessionId = row.getAttribute(ROW_ATTR)
      /* The budget starts when our own dwell elapses, so the total wait is
         TIP_DELAY_MS + TIP_CARD_WAIT_MS — enough to absorb a slower host
         dwell without ever showing the card in the wrong place. */
      tipTimer = setTimeout(() => {
        tipTimer = 0
        if (hoveredRow === row && row.isConnected) {
          showTipWhenReady(row, sessionId, Date.now() + TIP_CARD_WAIT_MS)
        }
      }, TIP_DELAY_MS)
    }

    function onPointerDown(event) {
      const target = event.target instanceof Element ? event.target : null
      if (tipRoot && target && tipRoot.contains(target)) return
      if (parkRoot && target && parkRoot.contains(target)) return
      hideTip()
      closeParkPopover()
    }

    /* ---------------------------------------------------------------- *
     * Park popover for the injected row button (plain DOM, like the tip).
     * ---------------------------------------------------------------- */

    let parkRoot = null
    let parkSessionId = ''

    function ensureParkRoot() {
      if (parkRoot && parkRoot.isConnected) return parkRoot
      parkRoot = document.createElement('div')
      parkRoot.className = 'dsh-suspend-pop'
      parkRoot.setAttribute('role', 'dialog')
      parkRoot.style.display = 'none'
      document.body.append(parkRoot)
      return parkRoot
    }

    function closeParkPopover() {
      parkSessionId = ''
      if (parkRoot) {
        parkRoot.style.display = 'none'
        parkRoot.textContent = ''
      }
    }

    function openParkPopover(anchor, sessionId) {
      hideTip()
      parkSessionId = sessionId
      const root = ensureParkRoot()
      root.textContent = ''

      const label = document.createElement('div')
      label.className = 'dsh-suspend-pop-label'
      label.textContent = t.header

      const input = document.createElement('textarea')
      input.className = 'dsh-suspend-input'
      input.placeholder = t.placeholder
      input.setAttribute('aria-label', t.placeholder)

      // Preset picker: only when the user turned the "ask on park" switch on.
      let select = null
      const presets = store.presets.presets
      if (store.presets.askOnPark && presets.length) {
        select = document.createElement('select')
        select.className = 'dsh-suspend-select'
        select.setAttribute('aria-label', t.preset)
        for (const preset of presets) {
          const option = document.createElement('option')
          option.value = preset.id
          option.textContent = presetLabel(preset)
          if (preset.id === store.presets.defaultPresetId) option.selected = true
          select.append(option)
        }
      }

      const actions = document.createElement('div')
      actions.className = 'dsh-suspend-pop-actions'

      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = 'dsh-suspend-btn'
      cancel.textContent = t.cancel
      cancel.addEventListener('click', closeParkPopover)

      const save = document.createElement('button')
      save.type = 'button'
      save.className = 'dsh-suspend-btn'
      save.textContent = t.save
      save.addEventListener('click', () => {
        const note = input.value.trim()
        if (!note) {
          status.textContent = t.errorEmpty
          return
        }
        save.disabled = true
        setNote(parkSessionId, note, select ? select.value : '')
          .then(() => closeParkPopover())
          .catch(() => {
            status.textContent = t.errorFailed
            save.disabled = false
          })
      })

      const status = document.createElement('span')
      status.className = 'dsh-suspend-pop-status'
      actions.append(status, cancel, save)

      root.append(label, input)
      if (select) root.append(select)
      root.append(actions)
      root.style.display = 'flex'

      const rect = anchor.getBoundingClientRect()
      const box = root.getBoundingClientRect()
      let left = Math.max(8, Math.min(rect.left, window.innerWidth - box.width - 8))
      let top = rect.bottom + 6
      if (top + box.height > window.innerHeight - 8) top = Math.max(8, rect.top - box.height - 6)
      root.style.left = `${Math.round(left)}px`
      root.style.top = `${Math.round(top)}px`
      input.focus()
    }

    /**
     * Open a parked session.
     *
     * `uiWorkspace.openSession` is the sanctioned path (the service is listed in
     * `inject`, and DSH's own sidebar uses it for every session click). Two
     * fallbacks keep the button useful even if the service is unavailable:
     * clicking the sidebar row, then (last resort) reporting the session id.
     * @returns true when a navigation was actually triggered.
     */
    function openSession(sessionId) {
      if (!sessionId) return false
      try {
        const workspace = rootCtx && rootCtx.uiWorkspace
        if (workspace && typeof workspace.openSession === 'function') {
          workspace.openSession(sessionId)
          return true
        }
      } catch (error) {
        console.warn('[dsh-session-suspend] openSession via uiWorkspace failed:', error)
      }
      // Fallback: click the row the way the user would.
      const row = document.querySelector(`[${ROW_ATTR}="${escapeAttr(sessionId)}"]`) || rowBySessionId(sessionId)
      if (row) {
        row.click()
        return true
      }
      return false
    }

    /** Escape a value for use inside a double-quoted attribute selector. */
    function escapeAttr(value) {
      return String(value).replace(/["\\]/g, '\\$&')
    }

    /** Find a sidebar row that resolves to this session id (used by the fallback). */
    function rowBySessionId(sessionId) {
      for (const row of document.querySelectorAll('[role="treeitem"]')) {
        if (rowSessionId(row) === sessionId) return row
      }
      return null
    }

    /* ---------------------------------------------------------------- *
     * Small helpers.
     * ---------------------------------------------------------------- */

    function relativeTime(iso) {
      const time = Date.parse(iso)
      if (!Number.isFinite(time)) return ''
      const diff = Date.now() - time
      if (diff < 60_000) return t.justNow
      const minutes = Math.floor(diff / 60_000)
      if (minutes < 60) return `${minutes} ${t.minutesAgo}`
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return `${hours} ${t.hoursAgo}`
      const days = Math.floor(hours / 24)
      if (days <= 30) return `${days} ${t.daysAgo}`
      return new Date(time).toLocaleDateString()
    }

    function updateTitles(titles) {
      if (sameStringMap(store.titles, titles)) return
      store.titles = titles
      emitChange()
      scheduleRowSync(0)
    }

    function orderEntries(snapshot) {
      return Object.entries(snapshot.notes)
        .map(([sessionId, entry]) => ({
          id: sessionId,
          note: entry.note,
          createdAt: entry.createdAt,
          /* presetId must survive the trip: the panel resolves a preset from
             it, and without it every row would read as "no preset". */
          presetId: entry.presetId,
          title: snapshot.titles[sessionId] || sessionId,
        }))
        .sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''))
    }

    /** Position a floating panel under (or above) its anchor. */
    function useAnchoredPosition(open, anchorRef, panelRef) {
      const [position, setPosition] = React.useState(null)
      React.useEffect(() => {
        if (!open) {
          setPosition(null)
          return
        }
        const place = () => {
          const anchor = anchorRef.current
          const panel = panelRef.current
          if (!anchor || !panel) return
          const anchorBox = anchor.getBoundingClientRect()
          const panelBox = panel.getBoundingClientRect()
          const width = panelBox.width || 272
          const height = panelBox.height || 160
          let left = anchorBox.left
          left = Math.max(8, Math.min(left, Math.max(8, window.innerWidth - width - 8)))
          let top = anchorBox.bottom + 6
          if (top + height > window.innerHeight - 8) top = Math.max(8, anchorBox.top - height - 6)
          setPosition({ left: Math.round(left), top: Math.round(top) })
        }
        place()
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null
        if (observer && panelRef.current) observer.observe(panelRef.current)
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
          if (observer) observer.disconnect()
          window.removeEventListener('resize', place)
          window.removeEventListener('scroll', place, true)
        }
      }, [open])
      return position
    }

    /** Escape + outside-pointer dismiss for an open floating panel. */
    function usePanelDismiss(open, anchorRef, panelRef, onDismiss) {
      React.useEffect(() => {
        if (!open) return
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          onDismiss()
          if (anchorRef.current && typeof anchorRef.current.focus === 'function') anchorRef.current.focus()
        }
        const onPointerDown = (event) => {
          const target = event.target
          if (panelRef.current && panelRef.current.contains(target)) return
          if (anchorRef.current && anchorRef.current.contains(target)) return
          onDismiss()
        }
        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('pointerdown', onPointerDown)
        return () => {
          document.removeEventListener('keydown', onKeyDown)
          document.removeEventListener('pointerdown', onPointerDown)
        }
      }, [open])
    }

    /* ---------------------------------------------------------------- *
     * Icons (inline 16px line icons).
     * ---------------------------------------------------------------- */

    function Svg({ size, children }) {
      return createElement(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        children,
      )
    }

    function ClockIcon({ size }) {
      return createElement(
        Svg,
        { size },
        createElement('path', {
          d: 'M8 1.9a6.1 6.1 0 1 0 0 12.2A6.1 6.1 0 0 0 8 1.9Z',
          stroke: 'currentColor',
          strokeWidth: '1.3',
        }),
        createElement('path', { d: 'M8 4.6V8l2.6 1.6', stroke: 'currentColor', strokeWidth: '1.3', strokeLinecap: 'round' }),
      )
    }

    function PinIcon({ size }) {
      return createElement(
        Svg,
        { size },
        createElement('path', {
          d: 'M8 1.8l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 10.7l-3.4 1.6.7-3.8L2.5 5.8l3.8-.5L8 1.8Z',
          stroke: 'currentColor',
          strokeWidth: '1.3',
          strokeLinejoin: 'round',
        }),
      )
    }

    /* ---------------------------------------------------------------- *
     * Preset settings (rendered inside the parked-session panel).
     * ---------------------------------------------------------------- */

    /** Localized label for one style id. */
    function styleLabel(style) {
      return t.styleLabels[style] || style
    }

    function PresetSettings({ snapshot }) {
      const prefs = snapshot.presets
      const [draft, setDraft] = React.useState(null)
      const [status, setStatus] = React.useState('')

      const commit = async (next) => {
        setStatus('')
        try {
          await savePresets(next)
        } catch {
          setStatus(t.errorFailed)
        }
      }

      const upsert = (preset) => {
        const rest = prefs.presets.filter((p) => p.id !== preset.id)
        commit({
          askOnPark: prefs.askOnPark,
          defaultPresetId: prefs.defaultPresetId,
          tipPlacement: prefs.tipPlacement,
          projectBadge: prefs.projectBadge,
          panelStyles: prefs.panelStyles,
          timeChip: prefs.timeChip,
          presets: [...rest, preset].slice(0, 12),
        })
      }

      const remove = (id) => {
        const rest = prefs.presets.filter((p) => p.id !== id)
        if (!rest.length) return
        commit({
          askOnPark: prefs.askOnPark,
          defaultPresetId: prefs.defaultPresetId === id ? rest[0].id : prefs.defaultPresetId,
          tipPlacement: prefs.tipPlacement,
          projectBadge: prefs.projectBadge,
          panelStyles: prefs.panelStyles,
          timeChip: prefs.timeChip,
          presets: rest,
        })
      }

      const setPlacement = (value) => {
        if (!TIP_PLACEMENTS.includes(value) || value === prefs.tipPlacement) return
        commit({
          askOnPark: prefs.askOnPark,
          defaultPresetId: prefs.defaultPresetId,
          tipPlacement: value,
          projectBadge: prefs.projectBadge,
          panelStyles: prefs.panelStyles,
          timeChip: prefs.timeChip,
          presets: prefs.presets,
        })
      }

      return createElement(
        'div',
        { className: 'dsh-suspend-settings' },
        createElement(
          'label',
          { className: 'dsh-suspend-settings-toggle' },
          createElement('input', {
            type: 'checkbox',
            checked: prefs.askOnPark,
            onChange: (event) =>
              commit({
                askOnPark: event.target.checked,
                defaultPresetId: prefs.defaultPresetId,
                tipPlacement: prefs.tipPlacement,
                projectBadge: prefs.projectBadge,
                panelStyles: prefs.panelStyles,
                timeChip: prefs.timeChip,
                presets: prefs.presets,
              }),
          }),
          createElement('span', null, t.askOnPark),
        ),
        createElement('div', { className: 'dsh-suspend-settings-hint' }, t.askOnParkHint),
        /* Collapsed-project count badge. */
        createElement(
          'label',
          { className: 'dsh-suspend-settings-toggle' },
          createElement('input', {
            type: 'checkbox',
            checked: prefs.projectBadge !== false,
            onChange: (event) =>
              commit({
                askOnPark: prefs.askOnPark,
                defaultPresetId: prefs.defaultPresetId,
                tipPlacement: prefs.tipPlacement,
                projectBadge: event.target.checked,
                panelStyles: prefs.panelStyles,
                timeChip: prefs.timeChip,
                presets: prefs.presets,
              }),
          }),
          createElement('span', null, t.projectBadge),
        ),
        createElement('div', { className: 'dsh-suspend-settings-hint' }, t.projectBadgeHint),
        /* Preset signature inside the parked list. */
        createElement(
          'label',
          { className: 'dsh-suspend-settings-toggle' },
          createElement('input', {
            type: 'checkbox',
            checked: prefs.panelStyles !== false,
            onChange: (event) =>
              commit({
                askOnPark: prefs.askOnPark,
                defaultPresetId: prefs.defaultPresetId,
                tipPlacement: prefs.tipPlacement,
                projectBadge: prefs.projectBadge,
                panelStyles: event.target.checked,
                timeChip: prefs.timeChip,
                presets: prefs.presets,
              }),
          }),
          createElement('span', null, t.panelStyles),
        ),
        createElement('div', { className: 'dsh-suspend-settings-hint' }, t.panelStylesHint),
        /* Timestamp chip. */
        createElement(
          'label',
          { className: 'dsh-suspend-settings-toggle' },
          createElement('input', {
            type: 'checkbox',
            checked: prefs.timeChip !== false,
            onChange: (event) =>
              commit({
                askOnPark: prefs.askOnPark,
                defaultPresetId: prefs.defaultPresetId,
                tipPlacement: prefs.tipPlacement,
                projectBadge: prefs.projectBadge,
                panelStyles: prefs.panelStyles,
                timeChip: event.target.checked,
                presets: prefs.presets,
              }),
          }),
          createElement('span', null, t.timeChip),
        ),
        createElement('div', { className: 'dsh-suspend-settings-hint' }, t.timeChipHint),
        /* Where the hover note hangs relative to DSH's own session card. */
        createElement('div', { className: 'dsh-suspend-settings-label' }, t.tipPlacement),
        createElement(
          'select',
          {
            className: 'dsh-suspend-select',
            value: prefs.tipPlacement,
            'aria-label': t.tipPlacement,
            onChange: (event) => setPlacement(event.target.value),
          },
          (prefs.tipPlacements || TIP_PLACEMENTS).map((value) =>
            createElement('option', { key: value, value }, t.tipPlacements[value] || value),
          ),
        ),
        createElement('div', { className: 'dsh-suspend-settings-hint' }, t.tipPlacementHint),
        createElement(
          'div',
          { className: 'dsh-suspend-settings-list' },
          prefs.presets.map((preset) =>
            createElement(
              'div',
              { key: preset.id, className: 'dsh-suspend-settings-row' },
              createElement('span', {
                className: 'dsh-suspend-swatch',
                style: {
                  background: preset.color,
                  opacity: String(Math.max(0.25, preset.opacity)),
                  boxShadow: `inset 3px 0 0 0 ${preset.color}`,
                },
              }),
              createElement(
                'span',
                { className: 'dsh-suspend-settings-name', title: presetLabel(preset) },
                presetLabel(preset),
              ),
              createElement('span', { className: 'dsh-suspend-settings-meta' }, styleLabel(preset.style)),
              createElement('button', {
                type: 'button',
                className: 'dsh-suspend-btn',
                title: t.edit,
                onClick: () => setDraft({ ...preset }),
              }, t.edit),
              createElement('button', {
                type: 'button',
                className: 'dsh-suspend-btn dsh-suspend-btn-danger',
                title: t.delete,
                disabled: prefs.presets.length <= 1,
                onClick: () => remove(preset.id),
              }, t.delete),
            ),
          ),
        ),
        createElement(
          'button',
          {
            type: 'button',
            className: 'dsh-suspend-btn',
            disabled: prefs.presets.length >= 12,
            onClick: () =>
              setDraft({
                id: `p-${Date.now().toString(36)}`,
                name: `${t.preset} ${prefs.presets.length + 1}`,
                style: 'bar',
                color: '#e8a33d',
                opacity: 1,
              }),
          },
          t.addPreset,
        ),
        status ? createElement('div', { className: 'dsh-suspend-panel-status' }, status) : null,
        draft
          ? createElement(
              'div',
              { className: 'dsh-suspend-editor' },
              createElement('input', {
                className: 'dsh-suspend-input',
                value: draft.name,
                maxLength: 24,
                'aria-label': t.presetName,
                onChange: (event) => setDraft({ ...draft, name: event.target.value }),
              }),
              createElement(
                'select',
                {
                  className: 'dsh-suspend-select',
                  value: draft.style,
                  'aria-label': t.presetStyle,
                  onChange: (event) => setDraft({ ...draft, style: event.target.value }),
                },
                prefs.styles.map((style) =>
                  createElement('option', { key: style, value: style }, styleLabel(style)),
                ),
              ),
              createElement(
                'label',
                { className: 'dsh-suspend-editor-color' },
                createElement('input', {
                  type: 'color',
                  value: draft.color,
                  'aria-label': t.presetColor,
                  onChange: (event) => setDraft({ ...draft, color: event.target.value }),
                }),
                createElement('span', null, draft.color),
              ),
              createElement(
                'label',
                { className: 'dsh-suspend-editor-opacity' },
                createElement('span', null, `${t.presetOpacity} ${Math.round(draft.opacity * 100)}%`),
                createElement('input', {
                  type: 'range',
                  min: '5',
                  max: '100',
                  value: String(Math.round(draft.opacity * 100)),
                  'aria-label': t.presetOpacity,
                  onChange: (event) => setDraft({ ...draft, opacity: Number(event.target.value) / 100 }),
                }),
              ),
              createElement(
                'div',
                { className: 'dsh-suspend-pop-actions' },
                createElement(
                  'button',
                  { type: 'button', className: 'dsh-suspend-btn', onClick: () => setDraft(null) },
                  t.cancel,
                ),
                createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-suspend-btn',
                    onClick: () => {
                      const name = draft.name.trim()
                      if (!name) return
                      /* Renaming (or any explicit edit) drops nameKey so the
                         stored name wins over the language-neutral label. */
                      const { nameKey, ...rest } = draft
                      upsert({ ...rest, name, color: draft.color.toLowerCase() })
                      setDraft(null)
                    },
                  },
                  t.save,
                ),
              ),
            )
          : null,
      )
    }

    /* ---------------------------------------------------------------- *
     * settings.section — DSH's own Settings window.
     *
     * The section reuses PresetSettings verbatim: the panel gear and the
     * settings page are two doors into one editor, so a preference changed
     * in either place is immediately visible in the other (both read the
     * same host route and the same store snapshot).
     * ---------------------------------------------------------------- */

    function SettingsSection() {
      const snapshot = useSuspendStore()
      return createElement(
        'div',
        { className: 'dsh-suspend-page' },
        createElement('div', { className: 'dsh-suspend-page-title' }, t.settingsNav),
        createElement('div', { className: 'dsh-suspend-settings-hint' }, t.settingsNavHint),
        createElement(PresetSettings, { snapshot }),
      )
    }

    /* ---------------------------------------------------------------- *
     * Slot components.
     * ---------------------------------------------------------------- */

    /** sidebar.footer.action — opens the parked-session panel. */
    function FooterAction({ wide, useSessions, useWorkspaces }) {
      const snapshot = useSuspendStore()
      const byId = useSessions((state) => state.byId)
      /* Workspace membership. This is a GlobalStandardProp merged in by
         dsh-client-ui-workspace, so it arrives with the same seat as
         useSessions and needs no inject. Read defensively: an older host
         that does not provide it simply leaves the counts at zero rather
         than breaking the component. */
      const workspaces = useWorkspaces ? useWorkspaces((state) => state.items) : null
      const [open, setOpen] = React.useState(false)
      const anchorRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const position = useAnchoredPosition(open, anchorRef, panelRef)
      usePanelDismiss(open, anchorRef, panelRef, () => setOpen(false))

      // Keep the row-highlighter indexes fresh (rows are matched by title, and
      // the injected park button resolves a row back to its session id).
      React.useEffect(() => {
        const titles = {}
        const byTitle = new Map()
        for (const [sessionId, summary] of Object.entries(byId || {})) {
          if (!summary || summary.blank) continue // blank rows render a generic "new session" label
          const title = typeof summary.displayTitle === 'string' ? summary.displayTitle.trim() : ''
          if (title) {
            titles[sessionId] = title
            /* First wins, matching noteByTitle()'s documented rule. The two
               indexes must agree: noteByTitle decides which note paints the
               row and what ROW_ATTR is set to, while this one answers
               rowSessionId()'s title fallback. With last-wins here a duplicate
               title paints as session A while the same row resolves back to
               session B -- reachable whenever the React fiber is not, which is
               exactly the fallback path this index exists for. */
            if (!byTitle.has(title)) byTitle.set(title, sessionId)
          }
        }
        updateTitles(titles)
        sessionsByTitle.clear()
        for (const [title, sessionId] of byTitle) sessionsByTitle.set(title, sessionId)
      }, [byId])

      /* Feed the two module-level indexes the row highlighter reads. They live
         outside React because syncRows() runs from an observer and a timer,
         not from a render. */
      React.useEffect(() => {
        const known = new Set()
        for (const sessionId of Object.keys(byId || {})) known.add(sessionId)
        knownSessionIds = known
        scheduleRowSync(0)
      }, [byId])

      React.useEffect(() => {
        const members = []
        for (const item of workspaces || []) {
          if (!item) continue
          const key = typeof item.workspaceId === 'string' ? item.workspaceId : ''
          const sessionIds = Array.isArray(item.sessionIds) ? item.sessionIds : []
          members.push({ key, sessionIds })
        }
        workspaceMembers = members
        scheduleRowSync(0)
      }, [workspaces])

      const entries = React.useMemo(() => orderEntries(snapshot), [snapshot])
      const count = entries.length
      const label = `${t.footer}${count > 0 ? ` (${count})` : ''}`
      const [view, setView] = React.useState('list')
      const [openFailed, setOpenFailed] = React.useState('')
      /* Panel-side presentation toggles. `!== false` so a snapshot that
         predates the key (or a host that never sends it) stays enabled. */
      const panelStyles = snapshot.presets.panelStyles !== false
      const timeChip = snapshot.presets.timeChip !== false

      const panel = open
        ? createPortal(
            createElement(
              'div',
              {
                ref: panelRef,
                className: 'dsh-suspend-panel',
                role: 'dialog',
                'aria-label': t.panelTitle,
                style: position ? { left: position.left, top: position.top } : { visibility: 'hidden', left: 0, top: 0 },
              },
              createElement(
                'div',
                { className: 'dsh-suspend-panel-head' },
                view === 'settings'
                  ? createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-suspend-panel-back',
                        onClick: () => setView('list'),
                      },
                      `← ${t.panelTitle}`,
                    )
                  : createElement('span', { className: 'dsh-suspend-panel-title' }, t.panelTitle),
                view === 'settings'
                  ? createElement('span', { className: 'dsh-suspend-panel-count' }, t.settings)
                  : createElement(
                      'span',
                      { className: 'dsh-suspend-panel-head-actions' },
                      createElement('span', { className: 'dsh-suspend-panel-count' }, String(count)),
                      createElement(
                        'button',
                        {
                          type: 'button',
                          className: 'dsh-suspend-panel-gear',
                          title: t.settings,
                          'aria-label': t.settings,
                          onClick: () => setView('settings'),
                        },
                        '⚙',
                      ),
                    ),
              ),
              view === 'settings'
                ? createElement(PresetSettings, { snapshot })
                : count === 0
                  ? createElement(
                      'div',
                      { className: 'dsh-suspend-panel-empty' },
                      createElement('span', null, t.empty),
                      createElement('span', { className: 'dsh-suspend-panel-hint' }, t.emptyHint),
                    )
                  : createElement(
                    'ul',
                    { className: 'dsh-suspend-panel-list' },
                    entries.map((entry) => {
                      const preset = panelStyles ? presetFor(entry) : null
                      const row = createElement(
                        'li',
                        {
                          key: entry.id,
                          className: 'dsh-suspend-panel-row' + (preset ? ` dsh-suspend-s-${preset.style}` : ''),
                          /* Same signature as the sidebar row, so a preset is
                             recognisable here without re-learning it. Written
                             straight into the element's own props: calling
                             applyPresetStyle() on the value createElement
                             returns would target a VIRTUAL element, which has
                             no classList — and throws, taking the whole slot
                             (and with it the sidebar footer) down with it. */
                          'data-preset': preset ? preset.id : '',
                          style: preset
                            ? { '--dsh-suspend-c': preset.color, '--dsh-suspend-a': String(preset.opacity) }
                            : undefined,
                        },
                        createElement('div', { className: 'dsh-suspend-panel-row-title', title: entry.title }, entry.title),
                        createElement('div', { className: 'dsh-suspend-panel-row-note' }, entry.note),
                        createElement(
                          'div',
                          { className: 'dsh-suspend-panel-row-foot' },
                          createElement(
                            'span',
                            { className: 'dsh-suspend-panel-row-time' + (timeChip ? ' dsh-suspend-time-chip' : '') },
                            relativeTime(entry.createdAt),
                          ),
                          createElement(
                            'span',
                            { className: 'dsh-suspend-panel-row-actions' },
                            createElement(
                              'button',
                              {
                                type: 'button',
                                className: 'dsh-suspend-btn',
                                onClick: () => {
                                  if (openSession(entry.id)) setOpen(false)
                                  else setOpenFailed(t.errorOpen)
                                },
                              },
                              t.open,
                            ),
                            createElement(
                              'button',
                              {
                                type: 'button',
                                className: 'dsh-suspend-btn dsh-suspend-btn-danger',
                                onClick: () => {
                                  clearNote(entry.id).catch(() => {})
                                },
                              },
                              t.clear,
                            ),
                          ),
                        ),
                      )
                      return row
                    }),
                  ),
              view === 'list' && openFailed
                ? createElement('div', { className: 'dsh-suspend-panel-status' }, openFailed)
                : null,
            ),
            document.body,
          )
        : null

      return createElement(
        React.Fragment,
        null,
        createElement(
          'button',
          {
            ref: anchorRef,
            type: 'button',
            className: 'dsh-suspend-footer',
            'data-rail': wide ? 'false' : 'true',
            'aria-expanded': open,
            'aria-label': label,
            title: label,
            onClick: () => setOpen((value) => !value),
          },
          createElement(ClockIcon, { size: 16 }),
          wide ? createElement('span', { className: 'dsh-suspend-footer-label' }, t.footer) : null,
          wide && count > 0 ? createElement('span', { className: 'dsh-suspend-count' }, String(count)) : null,
          !wide && count > 0 ? createElement('span', { className: 'dsh-suspend-rail-dot', 'aria-hidden': 'true' }) : null,
        ),
        panel,
      )
    }

    /* No `sidebar.toggle.badge` registration on purpose.
     *
     * That slot is `kind: "single"`, and dsh-client-ui-settings-general already
     * fills it with DesktopUpdateBadge (its "an update is available" hint) at
     * the default priority 0. Registering at the same priority used to throw
     * "single slot ... already has a registration at priority 0 (registered by
     * lc)" on every boot, and the only priority that would have made ours
     * render is one BELOW core's — i.e. shadowing the update badge, which is
     * not a trade worth making.
     *
     * Nothing is lost: `sidebar.footer.action` is rendered in rail mode too
     * (the foot area is built regardless of `wide`), and the footer button
     * already carries its own rail dot — see `.dsh-suspend-rail-dot` below. */

    /** conversation.session.header.actions — manual park-note editor. */
    function HeaderAction({ sessionId }) {
      const snapshot = useSuspendStore()
      const entry = sessionId ? snapshot.notes[sessionId] : undefined
      const [open, setOpen] = React.useState(false)
      const [draft, setDraft] = React.useState('')
      const [presetId, setPresetId] = React.useState('')
      const [status, setStatus] = React.useState('')
      const anchorRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const position = useAnchoredPosition(open, anchorRef, panelRef)
      usePanelDismiss(open, anchorRef, panelRef, () => setOpen(false))

      const presets = snapshot.presets.presets
      const askPreset = snapshot.presets.askOnPark && presets.length > 0

      React.useEffect(() => {
        if (!open) return
        setDraft(entry ? entry.note : '')
        setPresetId(entry && entry.presetId ? entry.presetId : snapshot.presets.defaultPresetId)
        setStatus('')
      }, [open])

      if (!sessionId) return null

      const save = async () => {
        const note = draft.trim()
        if (!note) {
          setStatus(t.errorEmpty)
          return
        }
        try {
          await setNote(sessionId, note, askPreset ? presetId : '')
          setStatus('')
          setOpen(false)
        } catch {
          setStatus(t.errorFailed)
        }
      }

      const clear = async () => {
        try {
          await clearNote(sessionId)
          setStatus('')
          setOpen(false)
        } catch {
          setStatus(t.errorFailed)
        }
      }

      const popover = open
        ? createPortal(
            createElement(
              'div',
              {
                ref: panelRef,
                className: 'dsh-suspend-pop',
                role: 'dialog',
                'aria-label': t.header,
                style: position ? { left: position.left, top: position.top } : { visibility: 'hidden', left: 0, top: 0 },
              },
              createElement('textarea', {
                className: 'dsh-suspend-input',
                value: draft,
                placeholder: t.placeholder,
                'aria-label': t.placeholder,
                onChange: (event) => setDraft(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault()
                    save()
                  }
                },
              }),
              askPreset
                ? createElement(
                    'select',
                    {
                      className: 'dsh-suspend-select',
                      value: presetId,
                      'aria-label': t.preset,
                      onChange: (event) => setPresetId(event.target.value),
                    },
                    presets.map((preset) =>
                      createElement('option', { key: preset.id, value: preset.id }, presetLabel(preset)),
                    ),
                  )
                : null,
              createElement(
                'div',
                { className: 'dsh-suspend-pop-actions' },
                status ? createElement('span', { className: 'dsh-suspend-pop-status' }, status) : null,
                entry
                  ? createElement(
                      'button',
                      { type: 'button', className: 'dsh-suspend-btn dsh-suspend-btn-danger', onClick: clear },
                      t.clear,
                    )
                  : null,
                createElement(
                  'button',
                  { type: 'button', className: 'dsh-suspend-btn', onClick: () => setOpen(false) },
                  t.cancel,
                ),
                createElement(
                  'button',
                  { type: 'button', className: 'dsh-suspend-btn', onClick: save },
                  t.save,
                ),
              ),
            ),
            document.body,
          )
        : null

      return createElement(
        React.Fragment,
        null,
        createElement(
          'button',
          {
            ref: anchorRef,
            type: 'button',
            className: 'dsh-suspend-header',
            'data-parked': entry ? 'true' : 'false',
            'aria-expanded': open,
            'aria-label': t.header,
            title: entry ? `${t.headerParked}：${entry.note}` : t.header,
            onClick: () => setOpen((value) => !value),
          },
          createElement(PinIcon, { size: 14 }),
          createElement('span', null, entry ? t.headerParked : t.header),
        ),
        popover,
      )
    }

    /* ---------------------------------------------------------------- *
     * Plugin entry.
     * ---------------------------------------------------------------- */

    /**
     * Install polling, the row highlighter and the slot registrations.
     * @param ctx - client context.
     */
    function apply(ctx) {
      rootCtx = ctx
      const style = injectCss()

      /* i18n: publish both dictionaries under our namespace, then follow the
         framework's active locale so a language switch inside DSH's own
         settings repaints this plugin without a reload. The document-language
         seed above covers compositions without a locale face. */
      ctx.effect(() => {
        /* `locale` is listed in exports.inject, so cordis has already waited for
           dsh-client-locale before this fiber activates. The client runner's ctx
           is fail-loud: touching a service that is NOT in inject throws
           "cannot get property X without inject" (that is what killed v0.1.5's
           first cut — the effect read ctx.locale while inject was ['slots']).
           The guard below stays for the same reason the unarchive-sessions
           plugin keeps one: a composition that somehow lacks the face should
           degrade to the document language, not kill the plugin tree. */
        const locale = ctx.locale
        if (!locale || typeof locale.register !== 'function') return () => {}
        const align = () => {
          const next = dictFor(locale.getLocale ? locale.getLocale().active : '')
          if (next !== t) {
            t = next
            /* Re-render every React surface. The plain-DOM surfaces split by
               whether they are REBUILT or REUSED, and only the rebuilt ones can
               rely on reading `t` at build time:

                 rebuilt -- the tooltip and the park popover clear their root
                           and construct fresh nodes, so they pick up the new
                           dictionary the next time they open.
                 reused  -- the row park button lives across syncRows passes
                           (MutationObserver + timer, and React keeps the same
                           DOM node), so injectRowAction re-reads t.parkAction
                           on EVERY call. Writing it only at creation is what
                           v0.2.1 shipped, and it left the button in the old
                           language until React replaced the row.

               The blanket claim that "plain-DOM surfaces read `t` when next
               built" is what hid that: it is true of two of the three. */
            emitChange()
          }
        }
        try {
          const disposeZh = locale.register(LOCALE_NS, 'zh', ZH)
          const disposeEn = locale.register(LOCALE_NS, 'en', EN)
          const unsubscribe = typeof locale.subscribe === 'function' ? locale.subscribe(align) : () => {}
          align()
          return () => {
            unsubscribe()
            disposeEn()
            disposeZh()
          }
        } catch (error) {
          console.warn('[dsh-session-suspend] locale registration failed; keeping the document language:', error)
          return () => {}
        }
      }, 'session-suspend.locale()')

      ctx.effect(() => {
        const timer = setInterval(() => {
          pullNotes().catch(() => {})
          pullPresets().catch(() => {})
        }, POLL_MS)
        pullNotes().catch(() => {})
        pullPresets().catch(() => {})

        const onVisibility = () => {
          if (!document.hidden) {
            pullNotes().catch(() => {})
            pullPresets().catch(() => {})
          }
        }
        document.addEventListener('visibilitychange', onVisibility)

        const rowSync = () => scheduleRowSync(200)
        const observer = typeof MutationObserver === 'function' ? new MutationObserver(rowSync) : null
        if (observer) {
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            /* `aria-expanded` is how a Workspace group row reports folded vs
               open, and React flips it in place on the same DOM node — so
               without it a fold/unfold alone would not re-run the sync and the
               count badge would lag one interaction behind. */
            attributeFilter: ['class', 'aria-expanded'],
          })
        }

        document.addEventListener('pointerover', onPointerOver)
        document.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('scroll', hideTip, true)

        return () => {
          clearInterval(timer)
          document.removeEventListener('visibilitychange', onVisibility)
          if (observer) observer.disconnect()
          document.removeEventListener('pointerover', onPointerOver)
          document.removeEventListener('pointerdown', onPointerDown)
          window.removeEventListener('scroll', hideTip, true)
          hideTip()
          closeParkPopover()
          if (parkRoot && parkRoot.isConnected) parkRoot.remove()
          parkRoot = null
          unmarkAllRows()
          if (tipRoot && tipRoot.isConnected) tipRoot.remove()
          tipRoot = null
          if (style && style.isConnected) style.remove()
          store.listeners.clear()
        }
      }, 'session-suspend.runtime()')

      // Each inject waits for the slot declaration, so load order never matters.
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register({ name: 'sidebar.footer.action', id: 'session-suspend-footer', order: 50 }, FooterAction),
      )
      ctx.slots.inject('conversation.session.header.actions', () =>
        ctx.slots.register(
          { name: 'conversation.session.header.actions', id: 'session-suspend-header', order: 50 },
          HeaderAction,
        ),
      )
      /* DSH's own Settings window: one nav entry reusing the very same
         preference editor the panel gear opens, so there is exactly one
         implementation. `label` is a thunk — the registry re-evaluates it per
         read, so the nav row follows the active locale without re-registering
         (SlotLabel = string | (() => string)). The owner share is just
         `{ close }`, which this section does not need. */
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          { name: 'settings.section', id: 'session-suspend', order: 40, label: () => t.settingsNav },
          SettingsSection,
        ),
      )
    }

    /**
     * Services required before this plugin loads.
     *
     * `slots` and `locale` — both are registered at root scope by bundles that
     * dsh-base itself composes (dsh-client-modules and dsh-client-locale), so
     * both are ancestors of this fiber and cordis always finds them.
     *
     * `uiWorkspace` is deliberately NOT listed: it is provided by
     * dsh-client-ui-workspace's own fiber, which is a sibling rather than an
     * ancestor of this plugin's fiber, so it is not reachable from here.
     * Declaring it in `inject` makes cordis wait for a service that never
     * arrives, and the whole plugin then never activates — DSH reports that as
     * "web boot: 1 entry did not activate". It is instead read opportunistically
     * at click time inside openSession(), with a DOM fallback behind it.
     *
     * The runner's ctx is fail-loud: reading a service that is not listed here
     * throws "cannot get property X without inject" during apply(), which also
     * kills the whole tree — so this list is the contract for every ctx.* read
     * in this file (effect/inject are cordis built-ins and always allowed).
     */
    const inject = ['slots', 'locale']

    exports.apply = apply
    exports.inject = inject

    /**
     * Test hook for `.sandbox/client-harness.cjs` (see its "paint path" section).
     * It is only populated when the page sets `window.__DSH_SUSPEND_TEST__`, which
     * the real GUI never does, so this costs nothing at runtime. It exists because
     * the note -> preset -> row-class chain lives entirely in closures and a shape
     * mismatch in it (noteByTitle returning {sessionId, entry} while presetFor
     * reads note.presetId) silently paints every row with the default preset.
     */
    if (typeof window !== 'undefined' && window.__DSH_SUSPEND_TEST__) {
      exports.__test__ = {
        /* The active dictionary, read through a getter so the harness observes
           a language switch instead of a snapshot taken at export time. */
        get t() {
          return t
        },
        store,
        noteByTitle,
        presetFor,
        presetLabel,
        paintRow,
        clearRowPaint,
        syncRows,
        injectRowAction,
        rowSessionId,
        sessionsByTitle,
        updateTitles,
        setNote,
        savePresets,
        pullNotes,
        pullPresets,
        ensureTipRoot,
        showTip,
        showTipWhenReady,
        placeTip,
        officialCardBottom,
        hideTip,
        setHovered: (row) => {
          hoveredRow = row
        },
        timing: { open: TIP_DELAY_MS, close: TIP_HIDE_GRACE_MS, cardWait: TIP_CARD_WAIT_MS },
        /* Panel + group-badge surface. */
        applyPresetStyle,
        isProjectRow,
        projectGroupKey,
        parkedCountsByGroup,
        paintProjectBadge,
        orderEntries,
        setWorkspaceMembers: (members) => {
          workspaceMembers = Array.isArray(members) ? members : []
        },
        setKnownSessionIds: (ids) => {
          knownSessionIds = new Set(Array.isArray(ids) ? ids : [])
        },
      }
    }

    return module.exports
  },
})
