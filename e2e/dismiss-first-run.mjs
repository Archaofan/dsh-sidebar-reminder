/**
 * Shared helper: dismiss DSH's first-run onboarding so the sidebar is
 * clickable.
 *
 * DSH 0.1.7 added a first-run flow that 0.1.6 did not have: a closed-beta
 * announcement followed by an "add an API key" prompt. Both render as a modal
 * with a full-page `role="presentation"` mask (z-index 1000) that intercepts
 * pointer events, so NOTHING in the sidebar can be clicked until they are gone.
 *
 * The API-key prompt is the one that matters. It is NOT persisted as "skipped"
 * -- a profile with no credentials sees it again on every page load, so this
 * has to run after the GUI has settled, on every visit, rather than once.
 *
 * A profile that already has credentials never sees it, which is why the whole
 * thing is conditional: the same code is a no-op on 0.1.6 and on an onboarded
 * profile, so one e2e drives both sandboxes.
 *
 * Two traps this avoids, both of which cost real debugging time:
 *
 *   1. `hasText: '继续'` also matches "保存并继续", whose button is disabled
 *      until a key is typed. Clicking a disabled button times out with a log
 *      that says nothing about why. Every locator here is `exact: true`.
 *   2. Dismissing before the GUI has settled finds no dialog and returns --
 *      then the dialog appears during the activation wait and the next click
 *      fails on the mask. So the caller waits first, then dismisses.
 *
 * Lives in `e2e/`, not in the gitignored `.sandbox/`: a committed test must not
 * import a file the repository does not ship, or a fresh clone cannot run it.
 *
 * Returns true when no dialog is covering the page.
 */
export async function dismissFirstRun(page, { rounds = 6, settleMs = 1500 } = {}) {
  for (let round = 0; round < rounds; round += 1) {
    const dialog = page.locator('[role="dialog"]').first()
    if ((await dialog.count()) === 0) return true
    const enabled = await page.evaluate(() => {
      const node = document.querySelector('[role="dialog"]')
      if (!node) return []
      return [...node.querySelectorAll('button')]
        .filter((b) => !b.disabled && (b.textContent || '').trim())
        .map((b) => (b.textContent || '').trim())
    })
    if (enabled.length === 0) return false
    /* The dismiss action is the LAST enabled button: 继续 on the announcement,
       稍后配置 on the API-key prompt. Taking the last one rather than the
       first avoids "保存并继续", which is enabled only after a key is typed. */
    const label = enabled[enabled.length - 1]
    await page
      .getByRole('button', { name: label, exact: true })
      .first()
      .click({ timeout: 8000 })
      .catch(() => {})
    await page.waitForTimeout(settleMs)
  }
  return (await page.locator('[role="dialog"]').count()) === 0
}
