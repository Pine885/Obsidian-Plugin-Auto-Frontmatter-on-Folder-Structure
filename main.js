"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const DEFAULT_SETTINGS = {
    enableTagging: false,
    enableLinking: false,
    includeTargetInTags: true,
    excludedFolders: '',
    tagDepth: 99,
    linkDepth: 99,
    enableAutomation: false,
    enableSummary: false,
    fullText: false,
    strictSummaryName: false,
    summaryPriority: 'Exact > StartsWith > EndsWith > Contains',
    queueDelay: 500
};
class AutoTaggerPlugin extends obsidian_1.Plugin {
    settings;
    updateQueue = new Set();
    queueTimeout = null;
    async onload() {
        console.log('Auto Frontmatter on Folder Structure plugin loaded');
        await this.loadSettings();
        this.addCommand({
            id: 'run-auto-tagger',
            name: 'Run Auto Frontmatter',
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
        this.addRibbonIcon('tag', 'Run Auto Frontmatter', async () => {
            await this.runAutoTagger();
        });
        this.addSettingTab(new AutoTaggerSettingTab(this.app, this));
        this.registerEvent(this.app.vault.on('rename', async (file, oldPath) => {
            if (!this.settings.enableAutomation)
                return;
            if (file instanceof obsidian_1.TFile) {
                this.queueUpdate(file);
                const oldFolderPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
                const oldFolder = this.app.vault.getAbstractFileByPath(oldFolderPath);
                if (oldFolder instanceof obsidian_1.TFolder) {
                    this.queueFolder(oldFolder);
                }
                const newFolderPath = file.path.substring(0, file.path.lastIndexOf('/'));
                const newFolder = this.app.vault.getAbstractFileByPath(newFolderPath);
                if (newFolder instanceof obsidian_1.TFolder) {
                    this.queueFolder(newFolder);
                }
            }
            else if (file instanceof obsidian_1.TFolder) {
                this.queueFolder(file);
            }
        }));
        this.registerEvent(this.app.vault.on('delete', async (file) => {
            if (!this.settings.enableAutomation)
                return;
            if (file instanceof obsidian_1.TFile) {
                const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
                const folder = this.app.vault.getAbstractFileByPath(folderPath);
                if (folder instanceof obsidian_1.TFolder) {
                    this.queueFolder(folder);
                }
            }
        }));
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            if (!this.settings.enableAutomation)
                return;
            const file = this.app.workspace.getActiveFile();
            if (file) {
                this.queueUpdate(file);
            }
        }));
    }
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    queueUpdate(file) {
        this.updateQueue.add(file);
        if (this.queueTimeout)
            clearTimeout(this.queueTimeout);
        this.queueTimeout = setTimeout(() => this.processQueue(), this.settings.queueDelay);
    }
    queueFolder(folder) {
        const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder.path + '/'));
        files.forEach(f => this.updateQueue.add(f));
        if (this.queueTimeout)
            clearTimeout(this.queueTimeout);
        this.queueTimeout = setTimeout(() => this.processQueue(), this.settings.queueDelay);
    }
    async processQueue() {
        const filesToUpdate = new Set(this.updateQueue);
        this.updateQueue.clear();
        this.queueTimeout = null;
        let updatedCount = 0;
        for (const file of filesToUpdate) {
            if (await this.updateFileFrontmatter(file)) {
                updatedCount++;
            }
        }
        if (updatedCount > 0) {
            new obsidian_1.Notice(`Auto Frontmatter updated ${updatedCount} file(s).`);
        }
    }
    isPathInFolder(path, folder) {
        if (!folder)
            return false;
        if (folder.includes('/')) {
            const normalizedFolder = folder.endsWith('/') ? folder : `${folder}/`;
            return path.startsWith(normalizedFolder);
        }
        const pathSegments = path.split('/');
        return pathSegments.includes(folder);
    }
    isExcluded(file) {
        const excludedFolders = this.settings.excludedFolders
            .split(',')
            .map(f => f.trim())
            .filter(f => f !== '');
        return excludedFolders.some(folder => this.isPathInFolder(file.path, folder));
    }
    async updateFolderAndChildren(folder) {
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
            if (isExcluded)
                continue;
            await this.updateFileFrontmatter(file);
            processedCount++;
        }
        new obsidian_1.Notice(`Auto Frontmatter processed ${processedCount} files.`);
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
        new obsidian_1.Notice(`Cleared frontmatter from ${clearedCount} files.`);
    }
    extractTagsFromPath(file) {
        const pathParts = file.path.split('/');
        pathParts.pop();
        if (pathParts.length === 0) {
            return [];
        }
        let tags = pathParts.map(part => `#${part.replace(/\s+/g, '_')}`);
        if (this.settings.tagDepth === 0) {
            return []; // Signal to clear tags
        }
        else if (this.settings.tagDepth === 1) {
            return tags.slice(-1);
        }
        else if (this.settings.tagDepth >= 2) {
            tags = tags.slice(-this.settings.tagDepth);
        }
        return tags;
    }
    findSiblingNodes(file) {
        const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
        if (!folderPath) {
            const allFiles = this.app.vault.getMarkdownFiles();
            return allFiles
                .filter(f => f !== file && f.path.indexOf('/') === -1 && !this.isExcluded(f))
                .map(f => `[[${f.basename}]]`);
        }
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (folder instanceof obsidian_1.TFolder) {
            return folder.children
                .filter(child => child instanceof obsidian_1.TFile && child !== file && child.extension === 'md' && !this.isExcluded(child))
                .map(child => `[[${child.basename}]]`);
        }
        return [];
    }
    findParentNodes(file, depth) {
        const results = [];
        const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
        if (!folderPath)
            return [];
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
            if (folder instanceof obsidian_1.TFolder) {
                const notes = folder.children
                    .filter(child => child instanceof obsidian_1.TFile && child.extension === 'md' && !this.isExcluded(child))
                    .map(child => `[[${child.basename}]]`);
                if (notes.length > 0) {
                    results.push({ folderName: folder.name, level: d, notes });
                }
                currentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
            }
            else {
                break;
            }
        }
        return results;
    }
    findChildrenNodes(file, depth) {
        const results = [];
        const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
        const rootFolder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!(rootFolder instanceof obsidian_1.TFolder))
            return [];
        const traverse = (folder, currentDepth) => {
            if (currentDepth > depth)
                return;
            folder.children.forEach(child => {
                if (child instanceof obsidian_1.TFolder) {
                    const notes = child.children
                        .filter(gc => gc instanceof obsidian_1.TFile && gc.extension === 'md' && !this.isExcluded(gc))
                        .map(gc => `[[${gc.basename}]]`);
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
    findCousinNodes(folderName) {
        const results = [];
        const allFolders = this.app.vault.getAbstractFileByPath('/');
        if (!(allFolders instanceof obsidian_1.TFolder))
            return [];
        const traverse = (folder) => {
            folder.children.forEach(child => {
                if (child instanceof obsidian_1.TFolder) {
                    if (child.name === folderName) {
                        const notes = child.children
                            .filter(c => c instanceof obsidian_1.TFile && c.extension === 'md' && !this.isExcluded(c))
                            .map(c => `[[${c.basename}]]`);
                        results.push(...notes);
                    }
                    traverse(child);
                }
            });
        };
        traverse(allFolders);
        return results;
    }
    findFolderByName(root, name) {
        const traverse = (folder) => {
            if (folder.name === name)
                return folder;
            for (const child of folder.children) {
                if (child instanceof obsidian_1.TFolder) {
                    const found = traverse(child);
                    if (found)
                        return found;
                }
            }
            return null;
        };
        return traverse(root);
    }
    async getFolderSummary(folder) {
        const keyword = 'summary';
        const files = folder.children.filter(child => child instanceof obsidian_1.TFile && child.extension === 'md');
        if (files.length === 0)
            return null;
        let bestFile = null;
        if (this.settings.strictSummaryName) {
            bestFile = files.find(f => f.basename.toLowerCase() === keyword) || null;
        }
        else {
            // Priority 1: Exact match
            bestFile = files.find(f => f.basename.toLowerCase() === keyword) || null;
            // Priority 2: Starts with
            if (!bestFile) {
                bestFile = files.find(f => f.basename.toLowerCase().startsWith(keyword)) || null;
            }
            // Priority 3: Ends with
            if (!bestFile) {
                bestFile = files.find(f => f.basename.toLowerCase().endsWith(keyword)) || null;
            }
            // Priority 4: Contains
            if (!bestFile) {
                bestFile = files.find(f => f.basename.toLowerCase().includes(keyword)) || null;
            }
        }
        if (!bestFile)
            return null;
        const content = await this.app.vault.read(bestFile);
        // Strip YAML frontmatter
        const yamlRegex = /^---\s*[\s\S]*?---\s*/;
        let text = content.replace(yamlRegex, '').trim();
        // Handle first paragraph logic (skip headers)
        if (!this.settings.fullText) {
            const paragraphs = text.split(/\n\s*\n/);
            const firstBodyParagraph = paragraphs.find(p => !p.trim().startsWith('#'));
            text = firstBodyParagraph ? firstBodyParagraph.trim() : paragraphs[0].trim();
        }
        // Strip markdown formatting for plain text
        text = text
            .replace(/\[\[([^\]]+)\]\]/g, (match, p1) => p1.includes('|') ? p1.split('|')[1] : p1)
            .replace(/[\*_~`]/g, '') // Remove bold, italic, strikethrough, inline code
            .replace(/^#+\s+/gm, '') // Remove headers from the start of lines
            .trim();
        return { text, file: bestFile };
    }
    async updateFileFrontmatter(file) {
        if (this.isExcluded(file))
            return false;
        const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
        const folderName = folderPath.split('/').pop() || 'Root';
        const currentFolder = this.app.vault.getAbstractFileByPath(folderPath);
        // Pre-fetch summaries if enabled to avoid async calls inside processFrontMatter
        let siblingSummary = null;
        const parentSummaries = new Map();
        const childSummaries = new Map();
        const cousinSummaries = new Map();
        if (this.settings.enableSummary) {
            if (currentFolder instanceof obsidian_1.TFolder) {
                siblingSummary = await this.getFolderSummary(currentFolder);
            }
            if (this.settings.linkDepth >= 2) {
                const parents = this.findParentNodes(file, this.settings.linkDepth - 1);
                for (const p of parents) {
                    const pathSegments = file.path.split('/');
                    const folderDepth = pathSegments.length - 1;
                    const targetDepth = folderDepth - p.level;
                    const pFolder = this.app.vault.getAbstractFileByPath(pathSegments.slice(0, targetDepth).join('/'));
                    if (pFolder instanceof obsidian_1.TFolder) {
                        const sum = await this.getFolderSummary(pFolder);
                        if (sum)
                            parentSummaries.set(p.folderName, sum.text);
                    }
                }
                const children = this.findChildrenNodes(file, this.settings.linkDepth - 1);
                for (const c of children) {
                    const cFolder = currentFolder instanceof obsidian_1.TFolder
                        ? currentFolder.children.find(child => child instanceof obsidian_1.TFolder && child.name === c.folderName)
                        : null;
                    if (cFolder instanceof obsidian_1.TFolder) {
                        const sum = await this.getFolderSummary(cFolder);
                        if (sum)
                            childSummaries.set(c.folderName, sum.text);
                    }
                }
            }
            const content = await this.app.vault.read(file);
            const yamlRegex = /^---\s*[\s\S]*?---\s*/;
            const frontmatterMatch = content.match(yamlRegex);
            if (frontmatterMatch) {
                const frontmatterText = frontmatterMatch[0];
                const cousinKeys = Object.keys(this.app.metadataCache.getFileCache(file)?.frontmatter || {}).filter(key => /^(.+)-\[R\]$/.test(key));
                for (const key of cousinKeys) {
                    const fName = key.match(/^(.+)-\[R\]$/)[1];
                    const allFolders = this.app.vault.getAbstractFileByPath('/');
                    if (allFolders instanceof obsidian_1.TFolder) {
                        const foundFolder = this.findFolderByName(allFolders, fName);
                        if (foundFolder) {
                            const sum = await this.getFolderSummary(foundFolder);
                            if (sum)
                                cousinSummaries.set(fName, sum.text);
                        }
                    }
                }
            }
        }
        let updated = false;
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            let isDirty = false;
            const setProperty = (key, value) => {
                if (JSON.stringify(frontmatter[key]) !== JSON.stringify(value)) {
                    frontmatter[key] = value;
                    isDirty = true;
                }
            };
            const deleteProperty = (key) => {
                if (key in frontmatter) {
                    delete frontmatter[key];
                    isDirty = true;
                }
            };
            // 1. Handle Tags
            if (this.settings.enableTagging) {
                const tags = this.extractTagsFromPath(file);
                if (this.settings.tagDepth === 0) {
                    deleteProperty('tags');
                }
                else if (tags.length > 0) {
                    setProperty('tags', tags);
                }
                else {
                    deleteProperty('tags');
                }
            }
            // 2. Handle Nodes
            if (this.settings.enableLinking) {
                const structuralData = [];
                // 1. Parents (Far -> Near)
                if (this.settings.linkDepth >= 2) {
                    const parents = this.findParentNodes(file, this.settings.linkDepth - 1);
                    parents.sort((a, b) => b.level - a.level).forEach(p => {
                        if (this.settings.enableSummary && parentSummaries.has(p.folderName)) {
                            structuralData.push({ key: `${p.folderName}-[TP${p.level}]`, value: parentSummaries.get(p.folderName) });
                        }
                        structuralData.push({ key: `${p.folderName}-[P${p.level}]`, value: p.notes });
                    });
                }
                // 2. Siblings
                if (this.settings.linkDepth >= 1) {
                    if (this.settings.enableSummary && siblingSummary && siblingSummary.file !== file) {
                        structuralData.push({ key: `${folderName}-[TS]`, value: siblingSummary.text });
                    }
                    const siblings = this.findSiblingNodes(file);
                    if (siblings.length > 0) {
                        structuralData.push({ key: `${folderName}-[S]`, value: siblings });
                    }
                }
                // 3. Children (Near -> Far)
                if (this.settings.linkDepth >= 2) {
                    const children = this.findChildrenNodes(file, this.settings.linkDepth - 1);
                    children.sort((a, b) => a.level - b.level).forEach(c => {
                        if (this.settings.enableSummary && childSummaries.has(c.folderName)) {
                            structuralData.push({ key: `${c.folderName}-[TC${c.level}]`, value: childSummaries.get(c.folderName) });
                        }
                        structuralData.push({ key: `${c.folderName}-[C${c.level}]`, value: c.notes });
                    });
                }
                // 4. Cousins
                const cousinKeys = Object.keys(frontmatter).filter(key => /^(.+)-\[R\]$/.test(key));
                for (const key of cousinKeys) {
                    const match = key.match(/^(.+)-\[R\]$/);
                    if (match) {
                        const fName = match[1];
                        if (this.settings.enableSummary && cousinSummaries.has(fName)) {
                            structuralData.push({ key: `${fName}-[TR]`, value: cousinSummaries.get(fName) });
                        }
                        const cousins = this.findCousinNodes(fName);
                        const val = cousins.length > 0 ? cousins : '[No matching folder found]';
                        structuralData.push({ key: key, value: val });
                    }
                }
                const currentStructuralKeys = Object.keys(frontmatter).filter(key => /-\[(S|P\d+|C\d+|R|TS|TP\d+|TC\d+|TR)\]$/.test(key));
                const desiredKeys = structuralData.map(d => d.key);
                const isOrderCorrect = currentStructuralKeys.length === desiredKeys.length &&
                    currentStructuralKeys.every((key, i) => key === desiredKeys[i]);
                const valuesMatch = structuralData.every(d => JSON.stringify(frontmatter[d.key]) === JSON.stringify(d.value));
                if (!isOrderCorrect || !valuesMatch) {
                    currentStructuralKeys.forEach(key => delete frontmatter[key]);
                    structuralData.forEach(d => {
                        frontmatter[d.key] = d.value;
                    });
                    isDirty = true;
                }
            }
            else {
                Object.keys(frontmatter).forEach(key => {
                    if (/^(.+)-\[R\]$/.test(key)) {
                        setProperty(key, []);
                    }
                    else if (/-\[(S|P\d+|C\d+|TS|TP\d+|TC\d+|TR)\]$/.test(key)) {
                        deleteProperty(key);
                    }
                });
            }
            updated = isDirty;
        });
        return updated;
    }
}
exports.default = AutoTaggerPlugin;
class AutoTaggerSettingTab extends obsidian_1.PluginSettingTab {
    plugin;
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        const resetContainer = containerEl.createDiv({ cls: 'reset-settings-container' });
        resetContainer.style.display = 'flex';
        resetContainer.style.justifyContent = 'flex-end';
        resetContainer.style.marginBottom = '20px';
        const resetBtn = resetContainer.createEl('button', {
            text: 'Reset Settings',
            cls: 'mod-cta',
        });
        resetBtn.onclick = async () => {
            if (confirm('Are you sure you want to reset all Auto Frontmatter on Folder Structure settings to default?')) {
                this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
                await this.plugin.saveSettings();
                this.display();
                new obsidian_1.Notice('Settings reset to default.');
            }
        };
        containerEl.createEl('h2', { text: 'Automation Settings' });
        new obsidian_1.Setting(containerEl)
            .setName('Enable Automation')
            .setDesc('Automatically update tags and links when files are moved, renamed, deleted, or opened.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableAutomation)
            .onChange(async (value) => {
            this.plugin.settings.enableAutomation = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('Update Delay')
            .setDesc('Time to wait (in milliseconds) before processing the update queue. Lower values are more responsive but may increase CPU usage.')
            .addText(text => text
            .setValue(this.plugin.settings.queueDelay.toString())
            .onChange(async (value) => {
            this.plugin.settings.queueDelay = parseInt(value) || 500;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('⚠️ Automation Warning')
            .setDesc('Enabling automation on very large vaults or with cloud sync (iCloud/Dropbox) may cause frequent file writes and potential sync loops.');
        containerEl.createEl('h2', { text: 'Auto Tag Settings' });
        new obsidian_1.Setting(containerEl)
            .setName('Enable Tagging')
            .setDesc('Automatically add tags based on folder structure.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableTagging)
            .onChange(async (value) => {
            this.plugin.settings.enableTagging = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('Tag Depth')
            .setDesc('Tagging level: 0 = Clear tags, 1 = Immediate parent only, 2+ = Hierarchy (up to N levels).')
            .addText(text => text
            .setValue(this.plugin.settings.tagDepth.toString())
            .onChange(async (value) => {
            this.plugin.settings.tagDepth = parseInt(value) || 0;
            await this.plugin.saveSettings();
        }));
        containerEl.createEl('h2', { text: 'Auto Link Settings' });
        new obsidian_1.Setting(containerEl)
            .setName('Enable Linking')
            .setDesc('Automatically link sibling, parent, child, and cousin notes. If disabled, structural links are removed, but Cousin keys are preserved (with empty values).')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableLinking)
            .onChange(async (value) => {
            this.plugin.settings.enableLinking = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('Link Depth')
            .setDesc('Linking level: 0 = Cousins only, 1 = Siblings + Cousins, 2+ = Hierarchy + Siblings + Cousins (Depth = Value - 1).')
            .addText(text => text
            .setValue(this.plugin.settings.linkDepth.toString())
            .onChange(async (value) => {
            this.plugin.settings.linkDepth = parseInt(value) || 0;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('Cousin Links')
            .setDesc('💡 Tip: You can create "Cousin Links" by adding a key like "FolderName-[R]:" to your note\'s frontmatter. The plugin will automatically link all notes in any folder with that name across your vault.');
        containerEl.createEl('h2', { text: 'Summary Settings' });
        new obsidian_1.Setting(containerEl)
            .setName('Enable Summary')
            .setDesc('Automatically add folder summaries to frontmatter if a summary file is found.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableSummary)
            .onChange(async (value) => {
            this.plugin.settings.enableSummary = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('Full Text')
            .setDesc('If disabled, only the first paragraph of the summary file will be used.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.fullText)
            .onChange(async (value) => {
            this.plugin.settings.fullText = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('Strict Summary Name')
            .setDesc('If enabled, only files named exactly the summary keyword will be used.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.strictSummaryName)
            .onChange(async (value) => {
            this.plugin.settings.strictSummaryName = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('Summary Detection Priority')
            .setDesc(`Current hierarchy: ${this.plugin.settings.summaryPriority}`);
        containerEl.createEl('h2', { text: 'Exclude Settings' });
        new obsidian_1.Setting(containerEl)
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
