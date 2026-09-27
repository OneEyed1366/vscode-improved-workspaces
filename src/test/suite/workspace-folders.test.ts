import * as assert from "assert"

import { planFolderUpdate, resolveExcludeGlob } from "../../workspace-folders"

suite("planFolderUpdate", () => {
  test("folder not present yet -> appends at the end", () => {
    // why: adding a package that isn't a workspace folder must not disturb
    // the existing folders, only add a new one after them
    const plan = planFolderUpdate([{ fsPath: "/repo/a", name: "a" }], {
      fsPath: "/repo/b",
      name: "b",
    })
    assert.deepStrictEqual(plan, { start: 1, deleteCount: 0 })
  })

  test("folder already present with the same name -> no-op", () => {
    // why: re-running "add as workspace folder" on an already-added,
    // unrenamed package must not touch the workspace folder list
    const plan = planFolderUpdate([{ fsPath: "/repo/a", name: "a" }], {
      fsPath: "/repo/a",
      name: "a",
    })
    assert.strictEqual(plan, undefined)
  })

  test("folder already present under a different name -> replaces it in place", () => {
    // why: the folder's display name (emoji prefix, custom label) can change
    // between calls; the existing entry must be renamed, not duplicated
    const plan = planFolderUpdate([{ fsPath: "/repo/a", name: "old-name" }], {
      fsPath: "/repo/a",
      name: "new-name",
    })
    assert.deepStrictEqual(plan, { start: 0, deleteCount: 1 })
  })

  test("no folders yet -> appends as the only folder", () => {
    const plan = planFolderUpdate([], { fsPath: "/repo/a", name: "a" })
    assert.deepStrictEqual(plan, { start: 0, deleteCount: 0 })
  })

  // no Negative group: planFolderUpdate has no throwing path, it always
  // returns a plan or undefined
})

suite("resolveExcludeGlob", () => {
  test("target is the owning root itself -> excludes everything under it", () => {
    // why: hiding a top-level workspace folder must not remove it as a root
    // (git/IntelliSense/watchers must stay), only hide its contents
    const glob = resolveExcludeGlob("/repo/pkg-a", "/repo/pkg-a")
    assert.strictEqual(glob, "**")
  })

  test("target is nested inside the owning root -> relative glob", () => {
    // why: a monorepo package living inside an already-open root can only be
    // hidden via files.exclude/search.exclude, not by removing a root
    const glob = resolveExcludeGlob("/repo", "/repo/packages/pkg-a")
    assert.strictEqual(glob, "packages/pkg-a")
  })

  // no Negative group: resolveExcludeGlob has no throwing path
})
