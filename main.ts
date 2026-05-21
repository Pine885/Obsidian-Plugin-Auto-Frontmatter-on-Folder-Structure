import { Plugin, TFile, TFolder, Notice, PluginSettingTab, Setting, App } from 'obsidian';

interface AutoTaggerSettings {
    enableTagging: boolean;
    enableLinking: boolean;
    includeTargetInTags: boolean;
    excludedFolders: string;
    tagDepth: number;
    linkDepth: number;
    enableAutomation: boolean;
}

const DEFAULT_SETTINGS: AutoTaggerSettings = {
    enableTagging: false,
    enableLinking: false,
    includeTargetInTags: true,
    excludedFolders: '',
    tagDepth: 99,
    linkDepth: 99,
    enableAutomation: false
}

export default class AutoTaggerPlugin extends Plugin {
    settings!: AutoTaggerSettings;

    async onload() {
        console.log('Auto Tag & Link Notes to Folder Structure plugin loaded');

        await this.loadSettings();

        this.addCommand({
            id: 'run-auto-tagger',
            name: 'Run Auto-Tagger',
            callback: async () => {
                await this.runAutoTagger();
            }
        });

        this.addCommand({
            id: 'clear-all-frontmatter',
            name: 'Clear All Frontmatter',
            callback: async () => {
                await this.clearAllFrontmatter();
            }
        });

        this.addRibbonIcon('tag', 'Run Auto-Tagger', async () => {
            await this.runAutoTagger();
        });

        this.addSettingTab(new AutoTaggerSettingTab(this.app, this));

        this.registerEvent(
            this.app.vault.on('rename', async (file, oldPath) => {
                if (!this.settings.enableAutomation) return;

                if (file instanceof TFile) {
                    // Update the moved file
                    await this.updateFileFrontmatter(file);

                    // Update old folder context
                    const oldFolderPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
                    const oldFolder = this.app.vault.getAbstractFileByPath(oldFolderPath);
                    if (oldFolder instanceof TFolder) {
                        await this.updateFolderAndChildren(oldFolder);
                    }

                    // Update new folder context
                    const newFolderPath = file.path.substring(0, file.path.lastIndexOf('/'));
                    const newFolder = this.app.vault.getAbstractFileByPath(newFolderPath);
                    if (newFolder instanceof TFolder) {
                        await this.updateFolderAndChildren(newFolder);
                    }
                } else if (file instanceof TFolder) {
                    // Update all files in the renamed folder
                    await this.updateFolderAndChildren(file);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('delete', async (file) => {
                if (!this.settings.enableAutomation) return;

                if (file instanceof TFile) {
                    // We can't get the folder from the file after it's deleted in some versions,
                    // but usually the file object still has the path.
                    const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
                    const folder = this.app.vault.getAbstractFileByPath(folderPath);
                    if (folder instanceof TFolder) {
                        await this.updateFolderAndChildren(folder);
                    }
                }
            })
        );
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private isPathInFolder(path: string, folder: string): boolean {
        if (!folder) return false;
        if (folder.includes('/')) {
            const normalizedFolder = folder.endsWith('/') ? folder : `${folder}/`;
            return path.startsWith(normalizedFolder);
        }
        const pathSegments = path.split('/');
        return pathSegments.includes(folder);
    }

    private isExcluded(file: TFile): boolean {
        const excludedFolders = this.settings.excludedFolders
            .split(',')
            .map(f => f.trim())
            .filter(f => f !== '');
        return excludedFolders.some(folder => this.isPathInFolder(file.path, folder));
    }

    private async updateFolderAndChildren(folder: TFolder) {
        const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder.path + '/'));
        for (const file of files) {
            if (!this.isExcluded(file)) {
                await this.updateFileFrontmatter(file);
            }
        }
    }

    async runAutoTagger() {
        const files = this.app.vault.getMarkdownFiles();
        
        const excludedFolders = this.settings.excludedFolders
            .split(',')
            .map(f => f.trim())
            .filter(f => f !== '');

        let processedCount = 0;

        for (const file of files) {
            const isExcluded = excludedFolders.some(folder => this.isPathInFolder(file.path, folder));
            if (isExcluded) continue;

            await this.updateFileFrontmatter(file);
            processedCount++;
        }

        new Notice(`Auto-Tagger processed ${processedCount} files.`);
    }

    async clearAllFrontmatter() {
        if (!confirm('⚠️ WARNING: This will remove ALL frontmatter properties from ALL notes in your vault. This action cannot be undone. Are you sure?')) {
            return;
        }

        const files = this.app.vault.getMarkdownFiles();
        let clearedCount = 0;

        for (const file of files) {
            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                Object.keys(frontmatter).forEach(key => {
                    delete frontmatter[key];
                });
            });
            clearedCount++;
        }

        new Notice(`Cleared frontmatter from ${clearedCount} files.`);
    }

    extractTagsFromPath(file: TFile): string[] {
        const pathParts = file.path.split('/');
        pathParts.pop();

        if (pathParts.length === 0) {
            return [];
        }

        let tags = pathParts.map(part => `#${part.replace(/\s+/g, '_')}`);
        
        if (this.settings.tagDepth === 0) {
            return []; // Signal to clear tags
        } else if (this.settings.tagDepth === 1) {
            return tags.slice(-1);
        } else if (this.settings.tagDepth >= 2) {
            tags = tags.slice(-this.settings.tagDepth);
        }
        
        return tags;
    }

    findSiblingNodes(file: TFile): string[] {
        const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
        if (!folderPath) {
            const allFiles = this.app.vault.getMarkdownFiles();
            return allFiles
                .filter(f => f !== file && f.path.indexOf('/') === -1 && !this.isExcluded(f))
                .map(f => `[[${f.basename}]]`);
        }

        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (folder instanceof TFolder) {
            return folder.children
                .filter(child => child instanceof TFile && child !== file && child.extension === 'md' && !this.isExcluded(child))
                .map(child => `[[${(child as TFile).basename}]]`);
        }

        return [];
    }

    findParentNodes(file: TFile, depth: number): { folderName: string, level: number, notes: string[] }[] {
        const results: { folderName: string, level: number, notes: string[] }[] = [];
        const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
        
        if (!folderPath) return [];

        let currentPath = folderPath.substring(0, folderPath.lastIndexOf('/'));
        
        for (let d = 1; d <= depth; d++) {
            if (!currentPath) {
                const rootFiles = this.app.vault.getMarkdownFiles().filter(f => f.path.indexOf('/') === -1 && !this.isExcluded(f));
                if (rootFiles.length > 0) {
                    results.push({ folderName: 'Root', level: d, notes: rootFiles.map(f => `[[${f.basename}]]`) });
                }
                break;
            }
            
            const folder = this.app.vault.getAbstractFileByPath(currentPath);
            if (folder instanceof TFolder) {
                const notes = folder.children
                    .filter(child => child instanceof TFile && child.extension === 'md' && !this.isExcluded(child))
                    .map(child => `[[${(child as TFile).basename}]]`);
                
                if (notes.length > 0) {
                    results.push({ folderName: folder.name, level: d, notes });
                }
                
                currentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
            } else {
                break;
            }
        }
        return results;
    }

    findChildrenNodes(file: TFile, depth: number): { folderName: string, level: number, notes: string[] }[] {
        const results: { folderName: string, level: number, notes: string[] }[] = [];
        const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
        const rootFolder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!(rootFolder instanceof TFolder)) return [];

        const traverse = (folder: TFolder, currentDepth: number) => {
            if (currentDepth > depth) return;

            folder.children.forEach(child => {
                if (child instanceof TFolder) {
                    const notes = child.children
                        .filter(gc => gc instanceof TFile && gc.extension === 'md' && !this.isExcluded(gc))
                        .map(gc => `[[${(gc as TFile).basename}]]`);
                    
                    if (notes.length > 0) {
                        results.push({ folderName: child.name, level: currentDepth, notes });
                    }
                    traverse(child, currentDepth + 1);
                }
            });
        };

        traverse(rootFolder, 1);
        return results;
    }

    findCousinNodes(folderName: string): string[] {
        const results: string[] = [];
        const allFolders = this.app.vault.getAbstractFileByPath('/');
        
        if (!(allFolders instanceof TFolder)) return [];

        const traverse = (folder: TFolder) => {
            folder.children.forEach(child => {
                if (child instanceof TFolder) {
                    if (child.name === folderName) {
                        const notes = child.children
                            .filter(c => c instanceof TFile && c.extension === 'md' && !this.isExcluded(c as TFile))
                            .map(c => `[[${(c as TFile).basename}]]`);
                        results.push(...notes);
                    }
                    traverse(child);
                }
            });
        };

        traverse(allFolders);
        return results;
    }

    async updateFileFrontmatter(file: TFile) {
        const folderName = file.path.split('/').slice(-2, -1)[0] || 'Root';

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            // 1. Handle Tags
            if (this.settings.enableTagging) {
                const tags = this.extractTagsFromPath(file);
                if (this.settings.tagDepth === 0) {
                    delete frontmatter['tags'];
                } else if (tags.length > 0) {
                    frontmatter['tags'] = tags;
                } else {
                    delete frontmatter['tags'];
                }
            }
            
            // 2. Handle Nodes
            if (this.settings.enableLinking) {
                // Capture Cousin keys before cleanup to prevent deletion
                const cousinKeys = Object.keys(frontmatter).filter(key => /^(.+)-\[R\]$/.test(key));

                // Clear existing node keys to ensure order P -> S -> C -> R
                Object.keys(frontmatter).forEach(key => {
                    if (/-\[(S|P\d+|C\d+|R)\]$/.test(key)) {
                        delete frontmatter[key];
                    }
                });

                // Parents (Far -> Near)
                if (this.settings.linkDepth >= 2) {
                    const parents = this.findParentNodes(file, this.settings.linkDepth - 1);
                    parents.sort((a, b) => b.level - a.level).forEach(p => {
                        frontmatter[`${p.folderName}-[P${p.level}]`] = p.notes;
                    });
                }

                // Siblings
                if (this.settings.linkDepth >= 1) {
                    const siblings = this.findSiblingNodes(file);
                    if (siblings.length > 0) {
                        frontmatter[`${folderName}-[S]`] = siblings;
                    }
                }

                // Children (Near -> Far)
                if (this.settings.linkDepth >= 2) {
                    const children = this.findChildrenNodes(file, this.settings.linkDepth - 1);
                    children.sort((a, b) => a.level - b.level).forEach(c => {
                        frontmatter[`${c.folderName}-[C${c.level}]`] = c.notes;
                    });
                }

                // Cousin Links (User-driven) - Always processed if enableLinking is true
                cousinKeys.forEach(key => {
                    const match = key.match(/^(.+)-\[R\]$/);
                    if (match) {
                        const folderName = match[1];
                        const cousins = this.findCousinNodes(folderName);
                        if (cousins.length > 0) {
                            frontmatter[key] = cousins;
                        } else {
                            frontmatter[key] = '[No matching folder found]';
                        }
                    }
                });
            } else {
                Object.keys(frontmatter).forEach(key => {
                    if (/^(.+)-\[R\]$/.test(key)) {
                        frontmatter[key] = [];
                    } else if (/-\[(S|P\d+|C\d+)\]$/.test(key)) {
                        delete frontmatter[key];
                    }
                });
            }
        });
    }
}

class AutoTaggerSettingTab extends PluginSettingTab {
    plugin: AutoTaggerPlugin;

    constructor(app: App, plugin: AutoTaggerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        const resetContainer = containerEl.createDiv({ cls: 'reset-settings-container' });
        resetContainer.style.display = 'flex';
        resetContainer.style.justifyContent = 'flex-end';
        resetContainer.style.marginBottom = '20px';

        const resetBtn = resetContainer.createEl('button', { 
            text: 'Reset Settings',
            cls: 'mod-cta' 
        ,});
        
        resetBtn.onclick = async () => {
            if (confirm('Are you sure you want to reset all Auto Tag & Link Notes to Folder Structure settings to default?')) {
                this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
                await this.plugin.saveSettings();
                this.display();
                new Notice('Settings reset to default.');
            }
        };

        new Setting(containerEl)
            .setName('Enable Automation')
            .setDesc('Automatically update tags and links when files are moved, renamed, or deleted.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutomation)
                .onChange(async (value) => {
                    this.plugin.settings.enableAutomation = value;
                    await this.plugin.saveSettings();
                }));


        containerEl.createEl('h2', { text: 'Auto Tag Settings' });

        new Setting(containerEl)
            .setName('Enable Tagging')
            .setDesc('Automatically add tags based on folder structure.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableTagging)
                .onChange(async (value) => {
                    this.plugin.settings.enableTagging = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Tag Depth')
            .setDesc('Tagging level: 0 = Clear tags, 1 = Immediate parent only, 2+ = Hierarchy (up to N levels).')
            .addText(text => text
                .setValue(this.plugin.settings.tagDepth.toString())
                .onChange(async (value) => {
                    this.plugin.settings.tagDepth = parseInt(value) || 0;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h2', { text: 'Auto Link Settings' });

        new Setting(containerEl)
            .setName('Enable Linking')
            .setDesc('Automatically link sibling, parent, child, and cousin notes. If disabled, structural links are removed, but Cousin keys are preserved (with empty values).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableLinking)
                .onChange(async (value) => {
                    this.plugin.settings.enableLinking = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Link Depth')
            .setDesc('Linking level: 0 = Cousins only, 1 = Siblings + Cousins, 2+ = Hierarchy + Siblings + Cousins (Depth = Value - 1).')
            .addText(text => text
                .setValue(this.plugin.settings.linkDepth.toString())
                .onChange(async (value) => {
                    this.plugin.settings.linkDepth = parseInt(value) || 0;
                    await this.plugin.saveSettings();
                }));

                new Setting(containerEl)
                    .setName('Cousin Links')
                    .setDesc('💡 Tip: You can create "Cousin Links" by adding a key like "FolderName-[R]:" to your note\'s frontmatter. The plugin will automatically link all notes in any folder with that name across your vault.');

        containerEl.createEl('h2', { text: 'Exclude Settings' });

        new Setting(containerEl)
            .setName('Excluded Folders')
            .setDesc('Ignore files in these folders (comma-separated). e.g., "Archive" or "Templates/Old".')
            .addText(text => text
                .setValue(this.plugin.settings.excludedFolders)
                .onChange(async (value) => {
                    this.plugin.settings.excludedFolders = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h2', { text: 'Danger Zone' });
        containerEl.createEl('p', {
            text: 'The following actions are destructive and cannot be undone.',
            attr: { style: 'color: var(--text-error); font-weight: bold;' }
        });

        const clearAllContainer = containerEl.createDiv({ cls: 'clear-all-container' });
        clearAllContainer.style.display = 'flex';
        clearAllContainer.style.justifyContent = 'flex-end';
        clearAllContainer.style.marginTop = '40px';
        clearAllContainer.style.borderTop = '1px solid var(--background-modifier-border)';
        clearAllContainer.style.paddingTop = '20px';

        const clearAllBtn = clearAllContainer.createEl('button', { 
            text: 'Clear All Frontmatter',
            cls: 'mod-cta' 
        });
        clearAllBtn.style.backgroundColor = 'var(--text-error)';
        clearAllBtn.style.color = 'var(--text-normal)';

        clearAllBtn.onclick = async () => {
            await this.plugin.clearAllFrontmatter();
        };
    }
}
