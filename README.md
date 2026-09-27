# Improved Workspaces

Show or hide any workspace folder, including auto-detected Lerna, Yarn, Pnpm and Rush monorepo packages.

## Features

All **Improved Workspaces** functionality can be found in the command palette. Available commands:

![Commands](images/animation.gif)

Selecting workspace folders:
![Select](images/select.png)

Selecting one package:
![Commands](images/list.png)

* `Improved Workspaces: Select Workspace Folders`: show or hide folders in your workspace, including packages from a detected monorepo - hiding excludes a folder from Explorer/search without removing it as a workspace root
* `Improved Workspaces: Open Package (Current Window)`: open a package from your repository in the current window
* `Improved Workspaces: Open Package (New Window)`: open a package from your repository in a new window
* `Improved Workspaces: Open Package (Workspace Folder)`: add a package from your repository as a workspace folder

You can also create workspace folders for all your repository packages with `Improved Workspaces: Sync Workspace Folders`:
![Commands](images/explorer.png)

## Extension Settings

**Improved Workspaces** tries to detect the type of package (library, application or tool) based on configurable regexes.

The workspace folder prefix containing the emoji is also configurable.

You can also configure custom types with a prefix in your JSON settings:

```json
{
  "improvedWorkspaces.folders.custom": [
    {"regex":"app1", "prefix": "🔥"},
    {"regex":"app2", "prefix": "📚"}
  ]
}
```

You can find all options under "Improved Workspaces" in your configurtion.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
