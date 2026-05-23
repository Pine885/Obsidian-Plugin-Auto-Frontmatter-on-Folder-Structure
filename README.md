# Auto Frontmatter on Folder Structure

A powerful Obsidian plugin that transforms your folder hierarchy into a rich network of automated tags and structural links within your note frontmatter.

## 🌟 Overview

Instead of manually managing tags and links, this plugin treats your folder structure as a source of truth. It automatically generates metadata that describes where a note lives, who its neighbors are, and how it relates to the broader vault architecture.

## ✨ Key Features

### 🏷️ Automatic Path-based Tagging
Convert your folder paths into a clean set of tags.
- **Dynamic Hierarchy**: Automatically generates tags based on the folder path.
- **Configurable Depth**: Use `Tag Depth` to control how many levels of the hierarchy are converted into tags (e.g., `1` for the immediate parent, `2+` for a deeper ancestral chain).

### 🔗 Multi-Depth Structural Linking
Create a web of relationships between notes based on their physical location in the vault.
- **Parents**: Links to notes in parent folders.
- **Siblings**: Links to other notes in the same folder.
- **Children**: Links to notes in subfolders.
- **Cousins (Dynamic Relationships)**: Define custom relationships by adding a `FolderName-[R]` key. The plugin will find all folders with that name across your entire vault and link the notes within them.
- **Strict Sorting**: Keys are always organized in a logical order: `Parents` $\rightarrow$ `Siblings` $\rightarrow$ `Children` $\rightarrow$ `Cousins`.

### 📝 Intelligent Folder Summaries
Bring folder-level context directly into your notes.
- **Automatic Extraction**: The plugin looks for a `summary.md` file (or similar) in a folder and extracts its content.
- **Smart Detection**: Uses a priority-based search: `Exact Match` $\rightarrow$ `Starts With` $\rightarrow$ `Ends With` $\rightarrow$ `Contains`.
- **Clean Text**: Automatically strips YAML frontmatter and markdown formatting to provide a clean, plain-text summary.
- **Comprehensive Coverage**: Summaries are available for Parents, Siblings, Children, and Cousins.

### ⚡ High-Performance Automation
Designed for large vaults and seamless workflows.
- **Real-time Triggers**: Updates are triggered automatically when notes are **moved, renamed, deleted, or opened**.
- **Pro Queue Architecture**: Uses a debounced batch processing system to prevent UI lag and avoid sync loops with cloud services (iCloud/Dropbox).
- **Configurable Delay**: Adjust the `Update Delay` to balance responsiveness and CPU usage.
- **Dirty Checking**: Only writes to the file if the calculated metadata actually differs from the current frontmatter, minimizing disk I/O.

### 🧹 Maintenance & Safety
- **Ghost Key Removal**: Automatically detects and deletes obsolete structural keys when folders are renamed or moved.
- **Excluded Folders**: Completely ignore specific directories (e.g., `Archive`, `Templates`) to keep your metadata clean.
- **Vault-Wide Wipe**: A "Clear All Frontmatter" utility for a fresh start.

## ⚙️ Configuration Guide

### Automation Settings
- **Enable Automation**: Toggle real-time updates.
- **Update Delay**: Time (ms) to wait before processing the queue. Lower = faster, Higher = lighter on CPU.

### Auto Tag Settings
- **Enable Tagging**: Toggle path-to-tag conversion.
- **Tag Depth**: `0` = Clear tags, `1` = Immediate parent, `2+` = Hierarchy.

### Auto Link Settings
- **Enable Linking**: Toggle structural linking.
- **Link Depth**: `0` = Cousins only, `1` = Siblings + Cousins, `2+` = Hierarchy + Siblings + Cousins.
- **Cousin Links**: Add `FolderName-[R]:` to your properties to link all notes in any folder named `FolderName` across your vault.

### Summary Settings
- **Enable Summary**: Toggle folder summary extraction.
- **Full Text**: If disabled, only the first paragraph is used.
- **Strict Summary Name**: If enabled, only files named exactly "summary" are used.
- **Detection Priority**: The fixed hierarchy used to find summary files.

## 📖 Frontmatter Reference

| Suffix | Meaning | Description |
| :--- | :--- | :--- |
| `-[P n]` | Parent (Level n) | Link to the note in the parent folder at depth `n`. |
| `-[TP n]` | Parent Summary | Summary of the parent folder at depth `n`. |
| `-[S]` | Siblings | Links to other notes in the same folder. |
| `-[TS]` | Sibling Summary | Summary of the current folder. |
| `-[C n]` | Child (Level n) | Links to notes in subfolders at depth `n`. |
| `-[TC n]` | Child Summary | Summary of the subfolder at depth `n`. |
| `-[R]` | Cousins | Links to notes in any folder with the specified name. |
| `-[TR]` | Cousin Summary | Summary of the cousin folder. |

## 📝 Example

**Scenario**: A note located at `Projects/Active/Work/Task.md`
- **Tag Depth**: 2
- **Link Depth**: 2
- **Cousin Key**: `Resources-[R]` added manually.

**Resulting Frontmatter**:
```yaml
tags:
  - #Active
  - #Work
Projects-[P2]: [[Project Root]]
Projects-[TP2]: "The main project hub."
Active-[P1]: [[Active Folder Note]]
Active-[TP1]: "Current active projects."
Work-[S]: [[Note A], [Note B]]
Work-[TS]: "Work-related tasks and notes."
Work-[C1]: [[Sub-task 1], [Sub-task 2]]
Work-[TC1]: "Detailed sub-task breakdown."
Resources-[TR]: "Global resource library."
Resources-[R]: [[Resource A], [Resource B]]
```

## 🚀 Installation

### Manual Installation
1. Download `main.js` and `manifest.json`.
2. Create a folder `.obsidian/plugins/obsidian-auto-tagger` in your vault.
3. Place the files inside and restart Obsidian.

### For Developers
1. Clone the repository.
2. Run `npm install`.
3. Run `npm run build` to compile TypeScript to `main.js`.
