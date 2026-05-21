# Auto Tag & Link Notes to Folder Structure

An Obsidian plugin that automatically manages your note tags and structural relationships based on your folder hierarchy.

## ✨ Features

- **Automatic Path-based Tagging**: Generates tags based on the folder hierarchy of your notes.
    - **Tag Depth**: Control how many levels of the folder path are converted into tags.
- **Multi-Depth Structural Linking**: Automatically creates links to related notes in the same folder (Siblings), parent folders (Parents), and subfolders (Children).
- **Cousin Links (Dynamic Relationships)**: Create custom links to any folder in your vault by adding a key like `FolderName-[R]:` to your frontmatter. The plugin will automatically find all folders with that name and link the notes inside them.
    - **Link Depth**: Control how many levels of parents and children the plugin should search for.
- **Organized Frontmatter**: Uses a compressed naming convention (e.g., `FolderName-[S]`, `FolderName-[P1]`, `FolderName-[C1]`) to keep your properties clean and sorted.
- **Real-time Automation (v2)**: 
    - Automatically updates tags and links when notes or folders are **moved, renamed, or deleted**.
    - Uses a "Targeted Update" strategy to ensure high performance even in large vaults.
- **Smart Cleanup**:
    - **Ghost Key Removal**: Automatically detects and removes obsolete structural keys when folders are renamed.
    - **Vault-Wide Wipe**: Built-in "Clear All Frontmatter" functionality to remove all properties from all notes.
- **Flexible Filtering**:
    - **Excluded Folders**: Completely ignore specific folders (e.g., `Archive`, `Templates`) for both tagging and linking.

## ⚠️ Warnings

- **Tag Overwriting**: This plugin will **overwrite** the existing `tags` property in your frontmatter with the tags generated from the folder path if enabled. If disabled, it will remove the generated tags.
- **Destructive Cleanup**: The "Clear All Frontmatter" command is **destructive** and will remove all properties from all notes in your vault. This action cannot be undone.

## 🚀 Installation

### Manual Installation
1. Download the `main.js` and `manifest.json` files from this repository.
2. Create a folder named `obsidian-auto-tagger` in your vault's plugin folder: `.obsidian/plugins/obsidian-auto-tagger`.
3. Place `main.js` and `manifest.json` into that folder.
4. Restart Obsidian or go to **Settings** $\rightarrow$ **Community Plugins** and enable **Auto Tag & Link**.

### For Developers
1. Clone the repository.
2. Run `npm install`.
3. Run `npm run build` to compile the TypeScript code into `main.js`.

## ⚙️ Settings

### Automation
- **Enable Automation**: When enabled, the plugin will automatically update affected notes in real-time during rename or delete events.

### Auto Tag Settings
- **Enable Tagging**: Toggle to turn path-based tagging on/off.
- **Tag Depth**: Number of folder levels to convert into tags (e.g., `2` will tag the immediate parent and its parent).

### Auto Link Settings
- **Enable Linking**: Toggle to turn sibling/parent/child linking on/off.
- **Link Depth**: Number of levels of parents and children to link (0 = siblings only).
- **Cousin Links**: User-defined links. Add `FolderName-[R]:` to your note's properties to link all notes in any folder named `FolderName` across your vault.

### Exclude Settings
- **Excluded Folders**: Comma-separated list of folders to be completely ignored by the plugin.


## 📝 Example Frontmatter

### Full Structural Linking
If a note is located in `Projects/Active/Work/Note.md` with **Tag Depth: 2** and **Link Depth: 2**, and you have manually added a `Resources-[R]` key, the plugin will generate:

```yaml
tags:
  - #Active
  - #Work
Projects-[P2]: [[Project Root]]
Active-[P1]: [[Active Folder Note]]
Work-[S]: [[Note A], [Note B]]
Work-[C1]: [[Sub-task 1], [Sub-task 2]]
Resources-[R]: [[Resource A], [Resource B]]
```

### Cousins Only Mode
If you set **Link Depth: 0**, only the dynamic Cousin links are processed:

```yaml
tags:
  - #Active
  - #Work
Resources-[R]: [[Resource A], [Resource B]]
```

### Disabled Linking
If **Enable Linking** is turned off, structural links are removed, but your manually created Cousin keys are preserved (with empty values):

```yaml
tags:
  - #Active
  - #Work
Resources-[R]: []
``` 
