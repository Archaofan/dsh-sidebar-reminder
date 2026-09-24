/* End-to-end verification of the CLIENT half in a real browser.
 *
 * The other harnesses only prove the host face, or the browser face against a
 * fake DOM. This drives the real GUI: real React, real slot registry, real
 * official HoverCard — which is the only way to check that our tooltip does not
 * overlap the official card, and that the row actually gets painted.
 *
 * Requires a running DSH that already has this plugin installed, at least one
 * session with a title, and one parked note (park one with the suspend_session
 * tool, or POST /session-suspend/set). Playwright is a devDependency; the
 * Chromium it drives does not have to be the build Playwright pins — set
 * E2E_CHROMIUM to any chrome.exe.
 *
 * Usage: node e2e/client.mjs <guiUrl>
 *   <guiUrl>  the token URL DSH prints at boot, e.g. http://127.0.0.1:12996/?token=...
 */
import { chromium } from 'playwright'
import { dismissFirstRun } from './dismiss-first-run.mjs'

const url = process.argv[2]
if (!url) {
  console.log('usage: node e2e/client.mjs <guiUrl>')
  process.exit(2)
}

const problems = []
const notes = []
function check(ok, label, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) problems.push(label)
}

/* Use the Chromium already on this machine rather than downloading a matching
 * build: Playwright pins a browser build per version, and the installed one
 * (chromium-1234) predates playwright 1.63's pin (1243). Any recent Chromium
 * drives the page the same way for our purposes. */
const CHROMIUM = process.env.E2E_CHROMIUM
  || (process.env.LOCALAPPDATA || '') + '\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe'
const fs = await import('node:fs')
if (!fs.existsSync(CHROMIUM)) {
  console.log(`no Chromium at ${CHROMIUM} — set E2E_CHROMIUM to a chrome.exe`)
  process.exit(2)
}

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

console.log('— loading the real GUI —')
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })

/* 1. the plugin's own surfaces must exist in the real slot registry */
console.log('— plugin surfaces —')
await page.waitForTimeout(6000)

/* 0.7 dismiss the first-run onboarding, if the GUI is showing it.
   AFTER the settle above, not before: the dialogs appear once the app has
   booted, and a mask left behind intercepts every later click. */
console.log('— first-run onboarding —')
const onboardingClear = await dismissFirstRun(page)
check(onboardingClear, 'the first-run onboarding is dismissed',
  'a modal is still covering the page, so the sidebar cannot be clicked')

const footer = page.locator('button', { hasText: /挂起提醒|Parked/ }).first()
const footerCount = await footer.count()
check(footerCount > 0, 'sidebar footer button renders', footerCount ? '' : 'not found')

/* 2. no activation failure — the exact symptom of a dead client bundle */
console.log('— activation —')
const activationError = consoleErrors.find((t) => /did not activate|Failed to load plugins/i.test(t))
check(!activationError, 'no "did not activate" error', activationError || '')

/* 3. the session rows must exist, and our parked row must be painted */
console.log('— rows —')
const rows = page.locator('[role="treeitem"]')
const rowCount = await rows.count()
check(rowCount > 0, 'sidebar session rows render', `${rowCount} rows`)

/* Park one session through the host route, then look for the paint. */
const listRes = await page.request.get(new URL('/session-suspend/list', url).toString())
const listJson = await listRes.json().catch(() => null)
const parkedIds = listJson && listJson.notes ? Object.keys(listJson.notes) : []
console.log(`  parked on the host: ${parkedIds.length ? parkedIds.join(', ') : '(none)'}`)

/* 4. hover a parked row and measure BOTH cards against each other */
if (parkedIds.length && rowCount) {
  console.log('— tooltip vs the official HoverCard —')
  /* The host has no row title map we can read from here, so find a painted row:
     the plugin writes data-dsh-suspend onto matching rows. */
  await page.waitForTimeout(3000)
  const painted = page.locator('[data-dsh-suspend]')
  const paintedCount = await painted.count()
  check(paintedCount > 0, 'a row carries the highlight attribute', `${paintedCount} row(s)`)

  if (paintedCount > 0) {
    const target = painted.first()
    const title = (await target.innerText().catch(() => '')).split('\n')[0]
    console.log(`  hovering: "${title}"`)
    await target.hover()
    await page.waitForTimeout(900) // past the 500ms open delay

    const geom = await page.evaluate(() => {
      const ours = document.querySelector('.dsh-suspend-tip, [class*="suspend-tip"]')
      const row = document.querySelector('[data-dsh-suspend]')
      const rowRect = row ? row.getBoundingClientRect() : null
      /* The official card is portalled to body, 200..280px wide, near the row. */
      let official = null
      for (const el of document.body.children) {
        const r = el.getBoundingClientRect()
        if (r.width >= 200 && r.width <= 280 && r.height > 20 && rowRect
          && Math.abs(r.left - (rowRect.right + 8)) <= 8) { official = el; break }
      }
      const oursRect = ours ? ours.getBoundingClientRect() : null
      const offRect = official ? official.getBoundingClientRect() : null
      return {
        ours: oursRect ? { left: Math.round(oursRect.left), top: Math.round(oursRect.top), right: Math.round(oursRect.right), bottom: Math.round(oursRect.bottom) } : null,
        official: offRect ? { left: Math.round(offRect.left), top: Math.round(offRect.top), right: Math.round(offRect.right), bottom: Math.round(offRect.bottom) } : null,
        row: rowRect ? { right: Math.round(rowRect.right), top: Math.round(rowRect.top) } : null,
        viewport: { w: window.innerWidth, h: window.innerHeight },
      }
    })

    console.log(`  ours    : ${JSON.stringify(geom.ours)}`)
    console.log(`  official: ${JSON.stringify(geom.official)}`)
    console.log(`  row     : ${JSON.stringify(geom.row)}`)

    check(!!geom.ours, 'our tooltip appeared on hover')
    if (geom.ours && geom.official) {
      const overlaps = geom.ours.right > geom.official.left && geom.ours.left < geom.official.right
        && geom.ours.bottom > geom.official.top && geom.ours.top < geom.official.bottom
      check(!overlaps, 'our tooltip does not overlap the official card')
      const belowOfficial = geom.ours.top >= geom.official.bottom - 2
      const rightOfOfficial = geom.ours.left >= geom.official.right - 2
      check(belowOfficial || rightOfOfficial, 'our tooltip is below-left or right of the official card',
        `below=${belowOfficial} right=${rightOfOfficial}`)
      const offSidebar = geom.ours.left >= (geom.row ? geom.row.right : 0)
      check(offSidebar, 'our tooltip does not hang over the sidebar band',
        `left=${geom.ours.left} sidebarRight=${geom.row && geom.row.right}`)
    }

    /* 5. it must not MOVE after being drawn (the "jump" the user reported) */
    const before = await page.evaluate(() => {
      const t = document.querySelector('.dsh-suspend-tip, [class*="suspend-tip"]')
      if (!t) return null
      const r = t.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top) }
    })
    await page.waitForTimeout(700)
    const after = await page.evaluate(() => {
      const t = document.querySelector('.dsh-suspend-tip, [class*="suspend-tip"]')
      if (!t) return null
      const r = t.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top) }
    })
    check(!!before && !!after && before.left === after.left && before.top === after.top,
      'the tooltip does not move after being drawn',
      before && after ? `${before.left},${before.top} -> ${after.left},${after.top}` : 'missing')

    /* 6. the buttons must be reachable */
    const openBtn = page.locator('.dsh-suspend-tip button, [class*="suspend-tip"] button').first()
    const openCount = await openBtn.count()
    check(openCount > 0, 'the tooltip has action buttons', `${openCount} button(s)`)
    if (openCount > 0) {
      const btnBox = await openBtn.boundingBox()
      const tipBox = await page.evaluate(() => {
        const t = document.querySelector('.dsh-suspend-tip, [class*="suspend-tip"]')
        if (!t) return null
        const r = t.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      })
      check(!!btnBox && !!tipBox && btnBox.x >= tipBox.left - 1 && btnBox.x + btnBox.width <= tipBox.right + 1,
        'the action button is inside the tooltip box')
    }
  }
} else {
  notes.push('no parked session on the host, so the hover chain was skipped')
}

/* 7. the settings panel must open and expose the placement control.
 *     NOTE: the plugin's gear lives INSIDE its own footer panel, and it is a
 *     different element from DSH's official settings gear — an aria-label glob
 *     finds the official one first and opens the wrong panel entirely. */
console.log('— settings panel —')
const parkBtn = page.locator('button', { hasText: /挂起提醒|Parked/ }).first()
let gearCount = 0
if (await parkBtn.count()) {
  await parkBtn.click()
  await page.waitForTimeout(900)
  const gear = page.locator('.dsh-suspend-panel-gear')
  gearCount = await gear.count()
  if (gearCount) {
    await gear.click()
    await page.waitForTimeout(900)
  }
}
check(gearCount > 0, 'the plugin settings gear renders inside its own panel')
if (gearCount > 0) {
  const placement = page.locator('select').filter({ hasText: /官方卡片|official card|左下|below/i }).first()
  const pCount = await placement.count()
  check(pCount > 0, 'the tooltip-position select renders')
  if (pCount > 0) {
    const options = await placement.locator('option').allTextContents()
    console.log(`  options: ${options.join(' | ')}`)
    check(options.length === 2, 'the position select offers exactly two placements')

    /* The real proof that the setting is live: switch it, and watch the tooltip
       actually move. nth(1) happens to be the default, so drive it explicitly. */
    const shotDir = process.env.E2E_SHOTS || ''
    async function closeTip() {
      /* Move the pointer somewhere neutral so the card closes. Without this the
         card stays open from the previous hover and is never re-placed — which
         is not a bug, it is what any user does implicitly by reaching for the
         settings gear in the first place. */
      await page.mouse.move(700, 650)
      await page.waitForTimeout(600)
    }
    async function measureAt(label) {
      await closeTip()
      const row = page.locator('[data-dsh-suspend]').first()
      await row.hover()
      await page.waitForTimeout(1000)
      const g = await page.evaluate(() => {
        const ours = document.querySelector('.dsh-suspend-tip')
        const rowEl = document.querySelector('[data-dsh-suspend]')
        const rowRect = rowEl ? rowEl.getBoundingClientRect() : null
        let official = null
        for (const el of document.body.children) {
          const r = el.getBoundingClientRect()
          if (r.width >= 200 && r.width <= 280 && r.height > 20 && rowRect
            && Math.abs(r.left - (rowRect.right + 8)) <= 8) { official = el; break }
        }
        const o = ours ? ours.getBoundingClientRect() : null
        const f = official ? official.getBoundingClientRect() : null
        return {
          ours: o ? { left: Math.round(o.left), top: Math.round(o.top) } : null,
          officialBottom: f ? Math.round(f.bottom) : null,
          rowRight: rowRect ? Math.round(rowRect.right) : null,
        }
      })
      console.log(`  [${label}] ours=${JSON.stringify(g.ours)} officialBottom=${g.officialBottom} rowRight=${g.rowRight}`)
      if (shotDir) {
        await page.screenshot({ path: `${shotDir}/tip-${label}.png` }).catch(() => {})
      }
      return g
    }

    const belowGeom = await measureAt('below')

    await placement.selectOption('right')
    await page.waitForTimeout(1500)
    const hostRight = await page.evaluate(async () => {
      const r = await fetch('/session-suspend/presets')
      return (await r.json()).tipPlacement
    })
    check(hostRight === 'right', 'switching to "right" persists to the host', `host=${hostRight}`)
    const rightGeom = await measureAt('right')

    await placement.selectOption('below')
    await page.waitForTimeout(1500)
    const hostBelow = await page.evaluate(async () => {
      const r = await fetch('/session-suspend/presets')
      return (await r.json()).tipPlacement
    })
    check(hostBelow === 'below', 'switching back to "below" persists to the host', `host=${hostBelow}`)

    /* the two placements must land in genuinely different spots */
    if (belowGeom.ours && rightGeom.ours) {
      const moved = belowGeom.ours.left !== rightGeom.ours.left || belowGeom.ours.top !== rightGeom.ours.top
      check(moved, 'the tooltip actually moves when the placement changes',
        `below=${belowGeom.ours.left},${belowGeom.ours.top} right=${rightGeom.ours.left},${rightGeom.ours.top}`)
      check(rightGeom.ours.left > (rightGeom.rowRight || 0) + 200,
        '"right" placement sits clear of the official card', `left=${rightGeom.ours.left} rowRight=${rightGeom.rowRight}`)
    }
  }
}

await browser.close()

console.log('')
if (problems.length) {
  console.log(`E2E FAIL — ${problems.length} problem(s):`)
  for (const p of problems) console.log(`  - ${p}`)
  process.exit(1)
}
console.log('E2E OK — real-browser client verification passed')
for (const n of notes) console.log(`note: ${n}`)
