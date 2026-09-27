import path from "path"

export interface IPlainFolder {
  fsPath: string
  name: string
}

export interface IFolderUpdatePlan {
  start: number
  deleteCount: number
}

// Same path+name -> no-op, same path+new name -> replace in place, else append.
export function planFolderUpdate(
  existing: IPlainFolder[],
  target: IPlainFolder
): IFolderUpdatePlan | undefined {
  let start = 0
  for (const folder of existing) {
    if (folder.fsPath !== target.fsPath) {
      start++
      continue
    }
    if (folder.name === target.name) return
    return { start, deleteCount: 1 }
  }
  return { start, deleteCount: 0 }
}

// A relative glob for files.exclude/search.exclude, scoped to the owning
// root's own settings; "**" when target IS that root (hide its whole tree).
export function resolveExcludeGlob(ownerFsPath: string, targetFsPath: string) {
  return path.relative(ownerFsPath, targetFsPath) || "**"
}
