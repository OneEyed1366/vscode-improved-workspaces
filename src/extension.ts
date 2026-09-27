// eslint-disable-next-line unicorn/import-style
import path from "path"
import { getWorkspace } from "ultra-runner"
import { planFolderUpdate, resolveExcludeGlob } from "./workspace-folders"
import {
  commands,
  ConfigurationTarget,
  ExtensionContext,
  QuickPickItem,
  QuickPickItemKind,
  Uri,
  window,
  workspace as vscodeWorkspace,
} from "vscode"

interface WorkspaceFolderItem extends QuickPickItem {
  root: Uri
  isRoot: boolean
  description: string
  isPackage?: boolean
}

function getFolderEmoji(root: string, pkgRoot: string) {
  const config = vscodeWorkspace.getConfiguration("improvedWorkspaces.folders")
  if (root == pkgRoot) return config.get<string>("prefix.root") || ""
  const dir = path.relative(root, pkgRoot)

  // Use custom prefixes first
  const custom = config.get<{ regex: string; prefix: string }[]>("custom")
  for (const c of custom || []) {
    if (c.prefix && c.regex && new RegExp(c.regex, "u").test(dir))
      return c.prefix
  }

  for (const type of ["apps", "libs", "tools"]) {
    const regex = config.get<string>(`regex.${type}`)
    const prefix = config.get<string>(`prefix.${type}`)
    if (regex && prefix && new RegExp(regex, "u").test(dir)) return prefix
  }
  return config.get<string>("prefix.unknown") || ""
}

async function getPackageFolders(
  includeRoot = true
): Promise<WorkspaceFolderItem[] | undefined> {
  const cwd = vscodeWorkspace.workspaceFolders?.[0].uri.fsPath
  if (!cwd) return
  const workspace = await getWorkspace({
    cwd,
    includeRoot: true,
  })
  if (!workspace) return

  const ret: WorkspaceFolderItem[] = []
  if (includeRoot)
    ret.push({
      label: `${getFolderEmoji(workspace.root, workspace.root)}${
        workspace.getPackageForRoot(workspace.root) || "root"
      }`,
      description: `${
        workspace.type[0].toUpperCase() + workspace.type.slice(1)
      } Workspace Root`,
      root: Uri.file(workspace.root),
      isRoot: true,
    })
  ret.push(
    ...workspace
      .getPackages()
      .filter((p) => p.root !== workspace.root)
      .map((p) => {
        return {
          label: `${getFolderEmoji(workspace.root, p.root)}${p.name}`,
          description: `at ${path.relative(workspace.root, p.root)}`,
          root: Uri.file(p.root),
          isRoot: false,
        }
      })
      .sort((a, b) => a.root.fsPath.localeCompare(b.root.fsPath))
  )
  return ret
}

enum PackageAction {
  newWindow,
  currentWindow,
  workspaceFolder,
}

function addWorkspaceFolder(item: WorkspaceFolderItem) {
  const folders = vscodeWorkspace.workspaceFolders || []
  const plan = planFolderUpdate(
    folders.map((f) => ({ fsPath: f.uri.fsPath, name: f.name })),
    { fsPath: item.root.fsPath, name: item.label }
  )
  if (!plan) return
  vscodeWorkspace.updateWorkspaceFolders(plan.start, plan.deleteCount, {
    name: item.label,
    uri: item.root,
  })
}

async function updateAll(items?: WorkspaceFolderItem[], clean = false) {
  const config = vscodeWorkspace.getConfiguration("improvedWorkspaces")
  if (!items) items = await getPackageFolders(config.get("includeRoot"))
  if (!items) return
  const itemsSet = new Set(items.map((item) => item.root.fsPath))
  const folders = vscodeWorkspace.workspaceFolders
  const adds: { name: string; uri: Uri }[] = []
  if (folders && !clean) {
    adds.push(...folders.filter((f) => !itemsSet.has(f.uri.fsPath)))
  }
  adds.push(
    ...items.map((item) => ({
      name: item.label,
      uri: item.root,
    }))
  )
  vscodeWorkspace.updateWorkspaceFolders(0, folders?.length, ...adds)
}

// Live workspace folders plus every detected monorepo package, so a plain
// multi-root workspace (no monorepo tooling) can still be shown/hidden too.
async function getAllFolders(): Promise<WorkspaceFolderItem[]> {
  const items = new Map<string, WorkspaceFolderItem>()
  for (const folder of vscodeWorkspace.workspaceFolders || [])
    items.set(folder.uri.fsPath, {
      label: folder.name,
      description: "",
      root: folder.uri,
      isRoot: false,
    })

  const packages = await getPackageFolders()
  for (const pkg of packages || [])
    items.set(pkg.root.fsPath, { ...pkg, isPackage: true })

  return [...items.values()]
}

// Resolves which root a folder's visibility settings live in: itself if it
// is a root, otherwise the root that contains it. Undefined if it's outside
// every open folder (shouldn't happen for anything getAllFolders returns).
function resolveExcludeTarget(item: WorkspaceFolderItem) {
  const owner = vscodeWorkspace.getWorkspaceFolder(item.root)
  if (!owner) return
  return { owner, glob: resolveExcludeGlob(owner.uri.fsPath, item.root.fsPath) }
}

function isFolderHidden(item: WorkspaceFolderItem): boolean {
  const target = resolveExcludeTarget(item)
  if (!target) return false
  const exclude = vscodeWorkspace
    .getConfiguration("files", target.owner.uri)
    .get<Record<string, boolean>>("exclude", {})
  return exclude[target.glob] === true
}

// Hides/shows a folder via files.exclude + search.exclude on its owning
// root, so the root itself stays open (git/IntelliSense/watchers keep running).
async function setFolderHidden(item: WorkspaceFolderItem, hidden: boolean) {
  const target = resolveExcludeTarget(item)
  if (!target) return
  for (const section of ["files", "search"]) {
    const config = vscodeWorkspace.getConfiguration(section, target.owner.uri)
    const exclude = { ...config.get<Record<string, boolean>>("exclude", {}) }
    if (hidden) exclude[target.glob] = true
    else delete exclude[target.glob]
    await config.update("exclude", exclude, ConfigurationTarget.WorkspaceFolder)
  }
}

function groupByPackage(items: WorkspaceFolderItem[]): WorkspaceFolderItem[] {
  const workspaceItems = items.filter((item) => !item.isPackage)
  const packageItems = items.filter((item) => item.isPackage)
  const separator = (label: string): WorkspaceFolderItem => ({
    label,
    kind: QuickPickItemKind.Separator,
    root: Uri.file(""),
    isRoot: false,
    description: "",
  })

  const grouped: WorkspaceFolderItem[] = []
  if (workspaceItems.length)
    grouped.push(separator("Workspace"), ...workspaceItems)
  if (packageItems.length) grouped.push(separator("Monorepo"), ...packageItems)
  return grouped
}

async function select() {
  const items = groupByPackage(await getAllFolders())
  for (const item of items) {
    if (item.kind !== QuickPickItemKind.Separator)
      item.picked = !isFolderHidden(item)
  }

  const picked = await window.showQuickPick(items, {
    canPickMany: true,
    matchOnDescription: true,
  })
  if (!picked) return

  const pickedPaths = new Set(picked.map((item) => item.root.fsPath))
  for (const item of items) {
    if (item.kind === QuickPickItemKind.Separator) continue
    await setFolderHidden(item, !pickedPaths.has(item.root.fsPath))
  }
}

async function openPackage(action: PackageAction) {
  const items = await getPackageFolders()
  if (items) {
    const item = await window.showQuickPick(items, {
      canPickMany: false,
      matchOnDescription: true,
    })
    if (item) {
      switch (action) {
        case PackageAction.currentWindow:
          return commands.executeCommand("vscode.openFolder", item.root)
        case PackageAction.newWindow:
          return commands.executeCommand("vscode.openFolder", item.root, true)
        case PackageAction.workspaceFolder:
          addWorkspaceFolder(item)
          break
      }
    }
  }
}
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand(
      "improvedWorkspaces.openPackageCurrentWindow",
      () => openPackage(PackageAction.currentWindow)
    ),
    commands.registerCommand("improvedWorkspaces.openPackageNewWindow", () =>
      openPackage(PackageAction.newWindow)
    ),
    commands.registerCommand(
      "improvedWorkspaces.openPackageWorkspaceFolder",
      () => openPackage(PackageAction.workspaceFolder)
    ),
    commands.registerCommand("improvedWorkspaces.updateAll", () => updateAll()),
    commands.registerCommand("improvedWorkspaces.select", () => select())
  )
}

// this method is called when your extension is deactivated
export function deactivate() {
  true
}
