"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const DEFAULT_SETTINGS = {
    enableTagging: false,
    enableLinking: false,
    includeTargetInTags: true,
    whitelistedFolders: '',
    blacklistedFolders: '',
    tagDepth: 99,
    linkDepth: 99,
    enableAutomation: false,
    forceKeySorting: false,
    enableSummary: false,
    unlinkSummaryNotes: false,
    fullText: false,
    strictSummaryName: false,
    summaryPriority: 'Exact > StartsWith > EndsWith > Contains',
    queueDelay: 500,
    showRunRibbon: false,
    showActiveNoteRibbon: false,
    showClearAllRibbon: false,
    showClearActiveRibbon: false,
};
class AutoFrontmatterPlugin extends obsidian_1.Plugin {
    settings;
    updateQueue = new Set();
    queueTimeout = null;
    folderCache = new Map();
    structuralKeyRegex = /-\[(S|P\d+|C\d+|R|TS|TP\d+|TC\d+|TR)\]$/;
    setCustomRibbonIcon(iconEl, svgKey) {
        iconEl.innerHTML = ICON_SVGS[svgKey];
    }
    addCustomRibbonIcon(lucideIcon, tooltip, svgKey, callback) {
        const icon = this.addRibbonIcon(lucideIcon, tooltip, callback);
        this.setCustomRibbonIcon(icon, svgKey);
        return icon;
    }
    async onload() {
        console.log('Auto Frontmatter on Folder Structure plugin loaded');
        await this.loadSettings();
        this.buildFolderCache();
        this.addCommand({
            id: 'run-auto-frontmatter',
            name: 'Run Auto Frontmatter',
            callback: async () => {
                await this.runAutoFrontmatter();
            }
        });
        this.addCommand({
            id: 'clear-all-frontmatter',
            name: 'Clear All Frontmatter',
            callback: async () => {
                await this.clearAllFrontmatter();
            }
        });
        if (this.settings.showRunRibbon) {
            this.addCustomRibbonIcon('tags', 'Run Auto-Frontmatter', 'multiTagScript', async () => {
                await this.runAutoFrontmatter();
            });
        }
        if (this.settings.showActiveNoteRibbon) {
            this.addCustomRibbonIcon('tag', 'Auto-Frontmatter Active Note', 'singleTagScript', async () => {
                const file = this.app.workspace.getActiveFile();
                if (file && file.extension === 'md') {
                    const updated = await this.updateFileFrontmatter(file);
                    if (updated) {
                        new obsidian_1.Notice(`Updated frontmatter for ${file.name}`);
                    }
                    else {
                        new obsidian_1.Notice(`No changes needed for ${file.name}`);
                    }
                }
                else {
                    new obsidian_1.Notice('No active markdown file found.');
                }
            });
        }
        if (this.settings.showClearAllRibbon) {
            this.addCustomRibbonIcon('trash', 'Clear All Frontmatter', 'multiTagClear', async () => {
                await this.clearAllFrontmatter();
            });
        }
        if (this.settings.showClearActiveRibbon) {
            this.addCustomRibbonIcon('trash-2', 'Clear Active-Note Frontmatter', 'singleTagClear', async () => {
                await this.clearActiveNoteFrontmatter();
            });
        }
        this.addSettingTab(new AutoFrontmatterSettingTab(this.app, this));
        this.registerEvent(this.app.vault.on('create', async (file) => {
            if (file instanceof obsidian_1.TFolder) {
                const name = file.name;
                if (!this.folderCache.has(name))
                    this.folderCache.set(name, []);
                this.folderCache.get(name).push(file);
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
        this.registerEvent(this.app.vault.on('rename', async (file, oldPath) => {
            if (!this.settings.enableAutomation)
                return;
            if (file instanceof obsidian_1.TFile) {
                this.queueUpdate(file);
                const oldFolderPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
                const oldFolder = this.app.vault.getAbstractFileByPath(oldFolderPath);
                if (oldFolder instanceof obsidian_1.TFolder) {
                    this.queueFolder(oldFolder, false);
                    const parentPath = oldFolderPath.substring(0, oldFolderPath.lastIndexOf('/'));
                    const parentFolder = this.app.vault.getAbstractFileByPath(parentPath);
                    if (parentFolder instanceof obsidian_1.TFolder)
                        this.queueFolder(parentFolder, false);
                }
                const newFolderPath = file.path.substring(0, file.path.lastIndexOf('/'));
                const newFolder = this.app.vault.getAbstractFileByPath(newFolderPath);
                if (newFolder instanceof obsidian_1.TFolder) {
                    this.queueFolder(newFolder, false);
                    const parentPath = newFolderPath.substring(0, newFolderPath.lastIndexOf('/'));
                    const parentFolder = this.app.vault.getAbstractFileByPath(parentPath);
                    if (parentFolder instanceof obsidian_1.TFolder)
                        this.queueFolder(parentFolder, false);
                }
            }
            else if (file instanceof obsidian_1.TFolder) {
                const parentPath = file.path.substring(0, file.path.lastIndexOf('/'));
                const parentFolder = this.app.vault.getAbstractFileByPath(parentPath);
                if (parentFolder instanceof obsidian_1.TFolder)
                    this.queueFolder(parentFolder, false);
                // Update cache: remove from old name, add to new name
                const oldFolderName = oldPath.split('/').pop() || '';
                const list = this.folderCache.get(oldFolderName);
                if (list) {
                    const idx = list.indexOf(file);
                    if (idx > -1)
                        list.splice(idx, 1);
                    if (list.length === 0)
                        this.folderCache.delete(oldFolderName);
                }
                const newName = file.name;
                if (!this.folderCache.has(newName))
                    this.folderCache.set(newName, []);
                this.folderCache.get(newName).push(file);
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
                    this.queueFolder(folder, false);
                    const parentPath = folderPath.substring(0, folderPath.lastIndexOf('/'));
                    const parentFolder = this.app.vault.getAbstractFileByPath(parentPath);
                    if (parentFolder instanceof obsidian_1.TFolder)
                        this.queueFolder(parentFolder, false);
                }
            }
            else if (file instanceof obsidian_1.TFolder) {
                const list = this.folderCache.get(file.name);
                if (list) {
                    const idx = list.indexOf(file);
                    if (idx > -1)
                        list.splice(idx, 1);
                    if (list.length === 0)
                        this.folderCache.delete(file.name);
                }
            }
        }));
    }
    onunload() {
        if (this.queueTimeout) {
            clearTimeout(this.queueTimeout);
        }
        this.updateQueue.clear();
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
    queueFolder(folder, recursive = true) {
        const collectFiles = (f) => {
            f.children.forEach(child => {
                if (child instanceof obsidian_1.TFile && child.extension === 'md') {
                    if (this.shouldProcess(child)) {
                        this.updateQueue.add(child);
                    }
                }
                else if (child instanceof obsidian_1.TFolder && recursive) {
                    collectFiles(child);
                }
            });
        };
        collectFiles(folder);
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
    buildFolderCache() {
        this.folderCache.clear();
        const root = this.app.vault.getRoot();
        if (!root)
            return;
        const traverse = (folder) => {
            const name = folder.name;
            if (!this.folderCache.has(name)) {
                this.folderCache.set(name, []);
            }
            this.folderCache.get(name).push(folder);
            folder.children.forEach(child => {
                if (child instanceof obsidian_1.TFolder)
                    traverse(child);
            });
        };
        traverse(root);
    }
    shouldProcess(file) {
        const whitelisted = this.settings.whitelistedFolders
            .split(',')
            .map(f => f.trim())
            .filter(f => f !== '');
        const blacklisted = this.settings.blacklistedFolders
            .split(',')
            .map(f => f.trim())
            .filter(f => f !== '');
        const isBlacklisted = blacklisted.some(folder => this.isPathInFolder(file.path, folder));
        if (isBlacklisted)
            return false;
        if (whitelisted.length === 0)
            return true;
        return whitelisted.some(folder => this.isPathInFolder(file.path, folder));
    }
    async runAutoFrontmatter() {
        const files = this.app.vault.getMarkdownFiles();
        let processedCount = 0;
        for (const file of files) {
            if (!this.shouldProcess(file))
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
            if (!this.shouldProcess(file))
                continue;
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter)
                continue;
            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                Object.keys(frontmatter).forEach(key => delete frontmatter[key]);
                clearedCount++;
            });
        }
        new obsidian_1.Notice(`Cleared frontmatter from ${clearedCount} files.`);
    }
    async clearActiveNoteFrontmatter() {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') {
            new obsidian_1.Notice('No active markdown file found.');
            return;
        }
        if (!confirm(`⚠️ WARNING: This will remove ALL frontmatter properties from ${file.name}. This action cannot be undone. Are you sure?`)) {
            return;
        }
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            Object.keys(frontmatter).forEach(key => delete frontmatter[key]);
        });
        new obsidian_1.Notice(`Cleared frontmatter from ${file.name}.`);
    }
    extractTagsFromPath(file) {
        const pathParts = file.path.split('/');
        pathParts.pop();
        if (pathParts.length === 0) {
            return [];
        }
        let tags = pathParts.map(part => {
            const sanitized = part.replace(/[\s/\\\[\](){}'"< >|:#*?]/g, '_').replace(/_+/g, '_');
            return sanitized;
        });
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
            const root = this.app.vault.getRoot();
            const summaryFile = this.getSummaryFile(root);
            return root?.children
                .filter(f => {
                if (!(f instanceof obsidian_1.TFile && f !== file && f.extension === 'md' && this.shouldProcess(f)))
                    return false;
                if (this.settings.unlinkSummaryNotes && f === summaryFile)
                    return false;
                return true;
            })
                .map(f => `[[${f.basename}]]`) || [];
        }
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (folder instanceof obsidian_1.TFolder) {
            const summaryFile = this.getSummaryFile(folder);
            return folder.children
                .filter(child => {
                if (!(child instanceof obsidian_1.TFile && child !== file && child.extension === 'md' && this.shouldProcess(child)))
                    return false;
                if (this.settings.unlinkSummaryNotes && child === summaryFile)
                    return false;
                return true;
            })
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
                const root = this.app.vault.getRoot();
                const summaryFile = this.getSummaryFile(root);
                const rootFiles = root?.children
                    .filter(f => {
                    if (!(f instanceof obsidian_1.TFile && f.extension === 'md' && this.shouldProcess(f)))
                        return false;
                    if (this.settings.unlinkSummaryNotes && f === summaryFile)
                        return false;
                    return true;
                })
                    .map(f => `[[${f.basename}]]`) || [];
                if (rootFiles.length > 0) {
                    results.push({ folderName: 'Root', level: d, notes: rootFiles });
                }
                break;
            }
            const folder = this.app.vault.getAbstractFileByPath(currentPath);
            if (folder instanceof obsidian_1.TFolder) {
                const summaryFile = this.getSummaryFile(folder);
                const notes = folder.children
                    .filter(child => {
                    if (!(child instanceof obsidian_1.TFile && child.extension === 'md' && this.shouldProcess(child)))
                        return false;
                    if (this.settings.unlinkSummaryNotes && child === summaryFile)
                        return false;
                    return true;
                })
                    .map(child => `[[${child.basename}]]`);
                if (notes.length > 0 || this.getSummaryFile(folder) !== null) {
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
        const folderPath = file.path.split('/').slice(0, -1).join('/');
        const rootFolder = this.app.vault.getAbstractFileByPath(folderPath) || this.app.vault.getRoot();
        if (!(rootFolder instanceof obsidian_1.TFolder))
            return [];
        const traverse = (folder, currentDepth) => {
            if (currentDepth > depth)
                return;
            folder.children.forEach(child => {
                if (child instanceof obsidian_1.TFolder) {
                    const summaryFile = this.getSummaryFile(child);
                    const notes = child.children
                        .filter(gc => {
                        if (!(gc instanceof obsidian_1.TFile && gc.extension === 'md' && this.shouldProcess(gc)))
                            return false;
                        if (this.settings.unlinkSummaryNotes && gc === summaryFile)
                            return false;
                        return true;
                    })
                        .map(gc => `[[${gc.basename}]]`);
                    if (notes.length > 0 || this.getSummaryFile(child) !== null) {
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
        const folders = this.folderCache.get(folderName);
        if (!folders)
            return [];
        const results = [];
        for (const folder of folders) {
            const summaryFile = this.getSummaryFile(folder);
            const notes = folder.children
                .filter(c => {
                if (!(c instanceof obsidian_1.TFile && c.extension === 'md' && this.shouldProcess(c)))
                    return false;
                if (this.settings.unlinkSummaryNotes && c === summaryFile)
                    return false;
                return true;
            })
                .map(c => `[[${c.basename}]]`);
            results.push(...notes);
        }
        return results;
    }
    /**
     * Finds a folder by name using the cache.
     * If multiple folders share the same name, the first one encountered during
     * the initial vault scan is returned.
     */
    findFolderByName(name) {
        const folders = this.folderCache.get(name);
        return folders && folders.length > 0 ? folders[0] : null;
    }
    getSummaryFile(folder) {
        const keyword = 'summary';
        const files = folder.children.filter(child => child instanceof obsidian_1.TFile && child.extension === 'md');
        if (files.length === 0)
            return null;
        if (this.settings.strictSummaryName) {
            return files.find(f => f.basename.toLowerCase() === keyword) || null;
        }
        const priorityMap = {
            'Exact': (name, keyword) => name === keyword,
            'StartsWith': (name, keyword) => name.startsWith(keyword),
            'EndsWith': (name, keyword) => name.endsWith(keyword),
            'Contains': (name, keyword) => name.includes(keyword),
        };
        const priorities = this.settings.summaryPriority
            .split('>')
            .map(p => p.trim())
            .filter(p => priorityMap[p]);
        for (const priority of priorities) {
            const searchFn = priorityMap[priority];
            const found = files.find(f => searchFn(f.basename.toLowerCase(), keyword));
            if (found)
                return found;
        }
        return null;
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
            const priorityMap = {
                'Exact': (name, keyword) => name === keyword,
                'StartsWith': (name, keyword) => name.startsWith(keyword),
                'EndsWith': (name, keyword) => name.endsWith(keyword),
                'Contains': (name, keyword) => name.includes(keyword),
            };
            const priorities = this.settings.summaryPriority
                .split('>')
                .map(p => p.trim())
                .filter(p => priorityMap[p]);
            for (const priority of priorities) {
                const searchFn = priorityMap[priority];
                bestFile = files.find(f => searchFn(f.basename.toLowerCase(), keyword)) || null;
                if (bestFile)
                    break;
            }
        }
        if (!bestFile)
            return null;
        let content;
        try {
            content = await this.app.vault.read(bestFile);
        }
        catch (e) {
            console.error(`AutoTagger: Failed to read summary file ${bestFile.path}`, e);
            return null;
        }
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
        if (!this.shouldProcess(file))
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
            const fileContent = await this.app.vault.read(file);
            let cousinKeys = [];
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.frontmatter) {
                cousinKeys = Object.keys(cache.frontmatter).filter(key => /^(.+)-\[R\]$/.test(key));
            }
            else {
                const match = fileContent.match(/^---\s*([\s\S]*?)\s*---\s*/);
                if (match) {
                    cousinKeys = match[1].split('\n')
                        .map(line => line.split(':')[0].trim())
                        .filter(key => /^(.+)-\[R\]$/.test(key));
                }
            }
            for (const key of cousinKeys) {
                const fName = key.match(/^(.+)-\[R\]$/)[1];
                const root = this.app.vault.getRoot();
                if (root instanceof obsidian_1.TFolder) {
                    const foundFolder = this.findFolderByName(fName);
                    if (foundFolder) {
                        const sum = await this.getFolderSummary(foundFolder);
                        if (sum)
                            cousinSummaries.set(fName, sum.text);
                    }
                }
            }
        }
        let updated = false;
        // Pre-flight dirty check to avoid unnecessary processFrontMatter calls
        const currentCache = this.app.metadataCache.getFileCache(file);
        const currentFrontmatter = currentCache?.frontmatter || {};
        const preFlightTargetMap = {};
        if (this.settings.enableTagging) {
            let tags = this.extractTagsFromPath(file);
            if (this.settings.includeTargetInTags) {
                const cousinKeys = Object.keys(currentFrontmatter).filter(key => /^(.+)-\[R\]$/.test(key));
                for (const key of cousinKeys) {
                    const match = key.match(/^(.+)-\[R\]$/);
                    if (match) {
                        const folderName = match[1];
                        const sanitized = folderName.replace(/[\s/\\\[\](){}'"< >|:#*?]/g, '_');
                        const folderTag = `#${sanitized}`;
                        if (!tags.includes(folderTag))
                            tags.push(folderTag);
                    }
                }
            }
            if (tags.length > 0) {
                preFlightTargetMap['tags'] = tags;
            }
            else if (this.settings.tagDepth === 0) {
                preFlightTargetMap['tags'] = [];
            }
        }
        if (this.settings.enableLinking) {
            const structuralData = [];
            if (this.settings.linkDepth >= 2) {
                const parents = this.findParentNodes(file, this.settings.linkDepth - 1);
                parents.sort((a, b) => b.level - a.level).forEach(p => {
                    if (this.settings.enableSummary && parentSummaries.has(p.folderName)) {
                        structuralData.push({ key: `${p.folderName}-[TP${p.level}]`, value: parentSummaries.get(p.folderName) });
                    }
                    if (p.notes.length > 0) {
                        structuralData.push({ key: `${p.folderName}-[P${p.level}]`, value: p.notes });
                    }
                });
            }
            if (this.settings.linkDepth >= 1) {
                if (this.settings.enableSummary && siblingSummary && siblingSummary.file !== file) {
                    structuralData.push({ key: `${folderName}-[TS]`, value: siblingSummary.text });
                }
                const siblings = this.findSiblingNodes(file);
                if (siblings.length > 0) {
                    structuralData.push({ key: `${folderName}-[S]`, value: siblings });
                }
            }
            if (this.settings.linkDepth >= 2) {
                const children = this.findChildrenNodes(file, this.settings.linkDepth - 1);
                children.sort((a, b) => a.level - b.level).forEach(c => {
                    if (this.settings.enableSummary && childSummaries.has(c.folderName)) {
                        structuralData.push({ key: `${c.folderName}-[TC${c.level}]`, value: childSummaries.get(c.folderName) });
                    }
                    if (c.notes.length > 0) {
                        structuralData.push({ key: `${c.folderName}-[C${c.level}]`, value: c.notes });
                    }
                });
            }
            const cousinKeys = Object.keys(currentFrontmatter).filter(key => /^(.+)-\[R\]$/.test(key));
            for (const key of cousinKeys) {
                const match = key.match(/^(.+)-\[R\]$/);
                if (match) {
                    const fName = match[1];
                    if (this.settings.enableSummary && cousinSummaries.has(fName)) {
                        structuralData.push({ key: `${fName}-[TR]`, value: cousinSummaries.get(fName) });
                    }
                    const cousins = this.findCousinNodes(fName);
                    structuralData.push({ key: key, value: cousins.length > 0 ? cousins : '[No matching folder found]' });
                }
            }
            structuralData.forEach(d => { preFlightTargetMap[d.key] = d.value; });
        }
        else {
            Object.keys(currentFrontmatter).forEach(key => {
                if (/^(.+)-\[R\]$/.test(key))
                    preFlightTargetMap[key] = [];
            });
        }
        Object.keys(currentFrontmatter).forEach(key => {
            if (!(key in preFlightTargetMap)) {
                // If it's a structural key but not in targetMap, it's obsolete
                if (this.structuralKeyRegex.test(key)) {
                    return;
                }
                preFlightTargetMap[key] = currentFrontmatter[key];
            }
        });
        const areEqual = (obj1, obj2) => {
            const keys1 = Object.keys(obj1);
            const keys2 = Object.keys(obj2);
            if (keys1.length !== keys2.length)
                return false;
            for (const key of keys1) {
                const val1 = obj1[key];
                const val2 = obj2[key];
                if (Array.isArray(val1) && Array.isArray(val2)) {
                    if (val1.length !== val2.length)
                        return false;
                    if (!val1.every((v, i) => v === val2[i]))
                        return false;
                }
                else if (val1 !== val2) {
                    return false;
                }
            }
            return true;
        };
        if (areEqual(currentFrontmatter, preFlightTargetMap)) {
            if (this.settings.forceKeySorting) {
                const keys1 = Object.keys(currentFrontmatter);
                const keys2 = Object.keys(preFlightTargetMap);
                if (keys1.some((key, i) => key !== keys2[i])) {
                    // Keys are in different order, force write
                }
                else {
                    return false;
                }
            }
            else {
                return false;
            }
        }
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            const backup = { ...frontmatter };
            const targetMap = {};
            let isDirty = false;
            // 1. Calculate Tags
            let tags = [];
            if (this.settings.enableTagging) {
                tags = this.extractTagsFromPath(file);
                if (this.settings.includeTargetInTags) {
                    const cousinKeys = Object.keys(frontmatter).filter(key => /^(.+)-\[R\]$/.test(key));
                    for (const key of cousinKeys) {
                        const match = key.match(/^(.+)-\[R\]$/);
                        if (match) {
                            const folderName = match[1];
                            const sanitized = folderName.replace(/[\s/\\\[\](){}'"< >|:#*?]/g, '_');
                            const folderTag = sanitized;
                            if (!tags.includes(folderTag))
                                tags.push(folderTag);
                        }
                    }
                }
            }
            if (this.settings.enableTagging) {
                if (tags.length > 0) {
                    targetMap['tags'] = tags;
                }
                else if (this.settings.tagDepth === 0) {
                    targetMap['tags'] = [];
                }
            }
            // 2. Calculate Structural Data
            if (this.settings.enableLinking) {
                const structuralData = [];
                if (this.settings.linkDepth >= 2) {
                    const parents = this.findParentNodes(file, this.settings.linkDepth - 1);
                    parents.sort((a, b) => b.level - a.level).forEach(p => {
                        if (this.settings.enableSummary && parentSummaries.has(p.folderName)) {
                            structuralData.push({ key: `${p.folderName}-[TP${p.level}]`, value: parentSummaries.get(p.folderName) });
                        }
                        if (p.notes.length > 0) {
                            structuralData.push({ key: `${p.folderName}-[P${p.level}]`, value: p.notes });
                        }
                    });
                }
                if (this.settings.linkDepth >= 1) {
                    if (this.settings.enableSummary && siblingSummary && siblingSummary.file !== file) {
                        structuralData.push({ key: `${folderName}-[TS]`, value: siblingSummary.text });
                    }
                    const siblings = this.findSiblingNodes(file);
                    if (siblings.length > 0) {
                        structuralData.push({ key: `${folderName}-[S]`, value: siblings });
                    }
                }
                if (this.settings.linkDepth >= 2) {
                    const children = this.findChildrenNodes(file, this.settings.linkDepth - 1);
                    children.sort((a, b) => a.level - b.level).forEach(c => {
                        if (this.settings.enableSummary && childSummaries.has(c.folderName)) {
                            structuralData.push({ key: `${c.folderName}-[TC${c.level}]`, value: childSummaries.get(c.folderName) });
                        }
                        if (c.notes.length > 0) {
                            structuralData.push({ key: `${c.folderName}-[C${c.level}]`, value: c.notes });
                        }
                    });
                }
                const cousinKeys = Object.keys(frontmatter).filter(key => /^(.+)-\[R\]$/.test(key));
                for (const key of cousinKeys) {
                    const match = key.match(/^(.+)-\[R\]$/);
                    if (match) {
                        const fName = match[1];
                        if (this.settings.enableSummary && cousinSummaries.has(fName)) {
                            structuralData.push({ key: `${fName}-[TR]`, value: cousinSummaries.get(fName) });
                        }
                        const cousins = this.findCousinNodes(fName);
                        structuralData.push({ key: key, value: cousins.length > 0 ? cousins : '[No matching folder found]' });
                    }
                }
                structuralData.forEach(d => { targetMap[d.key] = d.value; });
            }
            else {
                // If linking disabled, we still preserve Cousin keys but empty them
                Object.keys(frontmatter).forEach(key => {
                    if (/^(.+)-\[R\]$/.test(key))
                        targetMap[key] = [];
                });
            }
            // 3. Add remaining keys (filtering out obsolete structural keys)
            const structuralKeyRegex = /-\[(S|P\d+|C\d+|R|TS|TP\d+|TC\d+|TR)\]$/;
            Object.keys(backup).forEach(key => {
                if (!(key in targetMap)) {
                    // If it's a structural key but not in targetMap, it's obsolete
                    if (structuralKeyRegex.test(key)) {
                        return;
                    }
                    targetMap[key] = backup[key];
                }
            });
            // 4. Mutate original object to enforce order
            Object.keys(frontmatter).forEach(k => delete frontmatter[k]);
            Object.entries(targetMap).forEach(([k, v]) => {
                frontmatter[k] = v;
            });
            // 5. Dirty check
            isDirty = !areEqual(backup, frontmatter);
            updated = isDirty;
        });
        return updated;
    }
}
exports.default = AutoFrontmatterPlugin;
class AutoFrontmatterSettingTab extends obsidian_1.PluginSettingTab {
    plugin;
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        // Header with Reset Button
        const header = containerEl.createDiv({ cls: 'settings-header' });
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '3px';
        const title = header.createEl('h2', { text: 'Auto FrontMatter' });
        title.style.fontSize = '24px';
        title.style.fontWeight = 'bold';
        const resetBtn = header.createEl('button', {
            text: 'Reset Settings'
        });
        resetBtn.onclick = async () => {
            if (confirm('Are you sure you want to reset all settings to default?')) {
                this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
                await this.plugin.saveSettings();
                this.display();
                new obsidian_1.Notice('Settings reset to default.');
            }
        };
        // Tab Navigation
        const tabContainer = containerEl.createDiv({ cls: 'settings-tabs' });
        tabContainer.style.display = 'flex';
        tabContainer.style.gap = '2px';
        tabContainer.style.marginBottom = '0';
        tabContainer.style.borderBottom = '2px solid var(--background-modifier-border)';
        tabContainer.style.paddingBottom = '0';
        tabContainer.style.paddingLeft = '4px';
        const tabs = [
            { id: 'main', label: 'Main' },
            { id: 'automation', label: 'Automation' },
            { id: 'tag', label: 'Tag' },
            { id: 'link', label: 'Link' },
            { id: 'summary', label: 'Summary' }
        ];
        const contentContainer = containerEl.createDiv({ cls: 'settings-content' });
        contentContainer.style.borderTop = 'none';
        contentContainer.style.paddingTop = '15px';
        const tabPanes = {};
        tabs.forEach(tab => {
            const btn = tabContainer.createEl('button', {
                text: tab.label,
                cls: 'tab-button'
            });
            btn.style.cursor = 'pointer';
            btn.style.padding = '8px 16px';
            btn.style.border = '1px solid var(--background-modifier-border)';
            btn.style.borderBottom = 'none';
            btn.style.borderRadius = '8px 8px 0 0';
            btn.style.backgroundColor = 'var(--background-secondary)';
            btn.style.color = 'var(--text-muted)';
            btn.style.fontSize = '12px';
            btn.style.marginBottom = '-2px';
            btn.style.transition = 'all 0.1s ease';
            const pane = contentContainer.createDiv({ cls: 'tab-pane' });
            pane.style.display = 'none';
            tabPanes[tab.id] = pane;
            btn.onclick = () => {
                Object.values(tabPanes).forEach(p => p.style.display = 'none');
                pane.style.display = 'block';
                // Update active button style
                Array.from(tabContainer.children).forEach(child => {
                    if (child instanceof HTMLElement) {
                        child.style.fontWeight = 'normal';
                        child.style.backgroundColor = 'var(--background-secondary)';
                        child.style.color = 'var(--text-muted)';
                        child.style.borderBottom = 'none';
                    }
                });
                btn.style.fontWeight = 'bold';
                btn.style.backgroundColor = 'var(--background-primary)';
                btn.style.color = 'var(--text-normal)';
                btn.style.borderBottom = '2px solid var(--background-primary)';
                btn.style.zIndex = '1';
            };
        });
        // Default active tab
        const firstTabBtn = tabContainer.children[0];
        if (firstTabBtn)
            firstTabBtn.click();
        // --- Main Tab ---
        const mainPane = tabPanes['main'];
        mainPane.createEl('h3', { text: 'Main Settings' });
        new obsidian_1.Setting(mainPane)
            .setName('New User Guide')
            .setDesc('The plugin is disabled by default. Please browse through the settings to enable the features you want.')
            .addButton(btn => {
            btn.buttonEl.innerText = 'Run Auto-Frontmatter';
            btn.buttonEl.classList.add('mod-cta');
            btn.onClick(async () => {
                await this.plugin.runAutoFrontmatter();
            });
        });
        mainPane.createEl('h3', { text: 'Folder Targets' });
        new obsidian_1.Setting(mainPane)
            .setName('Whitelisted Folders')
            .setDesc('Only process files in these folders (comma-separated).')
            .addText(text => text
            .setValue(this.plugin.settings.whitelistedFolders)
            .onChange(async (value) => {
            this.plugin.settings.whitelistedFolders = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(mainPane)
            .setName('Blacklisted Folders')
            .setDesc('Ignore files in these folders (comma-separated).')
            .addText(text => text
            .setValue(this.plugin.settings.blacklistedFolders)
            .onChange(async (value) => {
            this.plugin.settings.blacklistedFolders = value;
            await this.plugin.saveSettings();
        }));
        mainPane.createEl('h3', { text: 'Ribbon Settings' });
        new obsidian_1.Setting(mainPane)
            .setName('Show Ribbons')
            .setDesc('Toggle which ribbon icons are visible for quick access to plugin features. Must reload the plugin after changing for ribbons to update.');
        new obsidian_1.Setting(mainPane)
            .setName('Run Auto-Frontmatter ribbon')
            .setDesc('Show the ribbon icon to run the plugin on all files.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.showRunRibbon)
            .onChange(async (value) => {
            this.plugin.settings.showRunRibbon = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(mainPane)
            .setName('Auto-Frontmatter active note ribbon')
            .setDesc('Show the ribbon icon to update the active note.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.showActiveNoteRibbon)
            .onChange(async (value) => {
            this.plugin.settings.showActiveNoteRibbon = value;
            await this.plugin.saveSettings();
        }));
        mainPane.createEl('h3', { text: '⚠️ Clear Frontmatter' });
        new obsidian_1.Setting(mainPane)
            .setName('Clear All Frontmatter')
            .setDesc('Remove all frontmatter properties from all notes in your vault.')
            .addButton(btn => {
            btn.buttonEl.innerText = 'Clear All';
            btn.buttonEl.classList.add('mod-warning');
            btn.onClick(async () => {
                await this.plugin.clearAllFrontmatter();
            });
        });
        new obsidian_1.Setting(mainPane)
            .setName('Clear All Frontmatter ribbon')
            .setDesc('Show the ribbon icon to clear all frontmatter in the vault.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.showClearAllRibbon)
            .onChange(async (value) => {
            this.plugin.settings.showClearAllRibbon = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(mainPane)
            .setName('Clear Active-Note Frontmatter ribbon')
            .setDesc('Show the ribbon icon to clear frontmatter for the active note.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.showClearActiveRibbon)
            .onChange(async (value) => {
            this.plugin.settings.showClearActiveRibbon = value;
            await this.plugin.saveSettings();
        }));
        // --- Automation Tab ---
        const autoPane = tabPanes['automation'];
        autoPane.createEl('h3', { text: 'Automation Settings' });
        new obsidian_1.Setting(autoPane)
            .setName('⚠️ Automation Warning')
            .setDesc('Enabling automation on very large vaults or with cloud sync (iCloud/Dropbox) may cause frequent file writes and potential sync loops.');
        new obsidian_1.Setting(autoPane)
            .setName('Enable Automation')
            .setDesc('Automatically update tags and links when files are moved, renamed, deleted, or opened.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableAutomation)
            .onChange(async (value) => {
            this.plugin.settings.enableAutomation = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(autoPane)
            .setName('Force Key Sorting')
            .setDesc('Force frontmatter keys to be sorted even if values are identical. Heavy CPU usage on large vaults. Use with caution.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.forceKeySorting)
            .onChange(async (value) => {
            this.plugin.settings.forceKeySorting = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(autoPane)
            .setName('Update Delay')
            .setDesc('Time to wait (in milliseconds) before processing the update queue.')
            .addText(text => text
            .setValue(this.plugin.settings.queueDelay.toString())
            .onChange(async (value) => {
            this.plugin.settings.queueDelay = parseInt(value) || 500;
            await this.plugin.saveSettings();
        }));
        // --- Tag Tab ---
        const tagPane = tabPanes['tag'];
        tagPane.createEl('h3', { text: 'Auto Tagging' });
        new obsidian_1.Setting(tagPane)
            .setName('Enable Tagging')
            .setDesc('Automatically add tags based on folder structure.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableTagging)
            .onChange(async (value) => {
            this.plugin.settings.enableTagging = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(tagPane)
            .setName('Tag Depth')
            .setDesc('Tagging level: 0 = Clear tags, 1 = Immediate parent only, 2+ = Hierarchy.')
            .addText(text => text
            .setValue(this.plugin.settings.tagDepth.toString())
            .onChange(async (value) => {
            this.plugin.settings.tagDepth = parseInt(value) || 0;
            await this.plugin.saveSettings();
        }));
        // --- Link Tab ---
        const linkPane = tabPanes['link'];
        linkPane.createEl('h3', { text: 'Auto Linking' });
        new obsidian_1.Setting(linkPane)
            .setName('Enable Linking')
            .setDesc('Automatically link sibling, parent, child, and cousin notes.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableLinking)
            .onChange(async (value) => {
            this.plugin.settings.enableLinking = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(linkPane)
            .setName('Link Depth')
            .setDesc('Linking level: 0 = Cousins only, 1 = Siblings + Cousins, 2+ = Hierarchy.')
            .addText(text => text
            .setValue(this.plugin.settings.linkDepth.toString())
            .onChange(async (value) => {
            this.plugin.settings.linkDepth = parseInt(value) || 0;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(linkPane)
            .setName('💡 Cousin Links')
            .setDesc('Create "Cousin Links" by adding a key like "FolderName-[R]:" to your note\'s frontmatter.');
        // --- Summary Tab ---
        const sumPane = tabPanes['summary'];
        sumPane.createEl('h3', { text: 'Auto Summary' });
        new obsidian_1.Setting(sumPane)
            .setName('Enable Summary')
            .setDesc('Automatically add folder summaries to frontmatter if a summary file is found.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableSummary)
            .onChange(async (value) => {
            this.plugin.settings.enableSummary = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(sumPane)
            .setName('Unlink Summary notes')
            .setDesc('Exclude summary notes from being listed as structural links (siblings, parents, children).')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.unlinkSummaryNotes)
            .onChange(async (value) => {
            this.plugin.settings.unlinkSummaryNotes = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(sumPane)
            .setName('Full Text')
            .setDesc('If disabled, only the first paragraph of the summary file will be used.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.fullText)
            .onChange(async (value) => {
            this.plugin.settings.fullText = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(sumPane)
            .setName('Strict Summary Name')
            .setDesc('If enabled, only files named exactly the summary keyword will be used.')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.strictSummaryName)
            .onChange(async (value) => {
            this.plugin.settings.strictSummaryName = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(sumPane)
            .setName('Summary Detection Priority')
            .setDesc(`Current hierarchy: ${this.plugin.settings.summaryPriority}`);
    }
}
const ICON_SVGS = {
    multiTagClear: '<svg viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" fill="none" width="18" height="18" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">    <g stroke-width="1.5" />    <g />    <g>        <g>            <g>                <path d="M14.1748 1.958l0 3.2168c0 0.8883 0.7201 1.6084 1.6084 1.6084l3.2168 0" />                <path d="M6.1329 19.042l11.2587 0c0.8883 0 1.6084-0.7201 1.6084-1.6084V5.979l-4.021-4.021-7.2377 0c-0.8883 0-1.6084 0.7201-1.6084 1.6084l0 2.4126" />                <path d="M9.1329 22.042l11.2587 0c0.8883 0 1.6084-0.7201 1.6084-1.6084V9.979" />            </g>            <g stroke-width="1.5" />        </g>        <line x1="2.5" x2="10.5" y1="13" y2="13" />    </g></svg>',
    multiTagScript: '<svg viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" fill="none" width="18" height="18" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">    <g>        <g>            <path d="M14.1748 1.958l0 3.2168c0 0.8883 0.7201 1.6084 1.6084 1.6084l3.2168 0" />            <path d="M6.1329 19.042l11.2587 0c0.8883 0 1.6084-0.7201 1.6084-1.6084V5.979l-4.021-4.021-7.2377 0c-0.8883 0-1.6084 0.7201-1.6084 1.6084l0 2.4126" />            <path d="M9.1329 22.042l11.2587 0c0.8883 0 1.6084-0.7201 1.6084-1.6084V9.979" />        </g>        <g stroke-width="1.5" />    </g>    <g stroke-width="1.5">        <path d="M5.0714 15.467l-1 0a2.5 2.5 0 0 1 0-5l1 0" />        <path d="M8.0714 10.467l1 0a2.5 2.5 0 1 1 0 5l-1 0" />        <line x1="4.571429" x2="8.571429" y1="12.967033" y2="12.967033" />    </g></svg>',
    singleTagClear: '<svg viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" fill="none" width="18" height="18" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">    <line x1="2" x2="10" y1="15" y2="15" />    <g>        <path d="M6 22h14c1.1046 0 2-0.8954 2-2V7l-5-5H8C6.8954 2 6 2.8954 6 4v2" />        <path d="M16 2v4a2 2 0 0 0 2 2h4" />    </g></svg>',
    singleTagScript: '<svg viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" fill="none" width="18" height="18" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">    <g>        <path d="M6 22h14c1.1046 0 2-0.8954 2-2V7l-5-5H8C6.8954 2 6 2.8954 6 4v2" />        <path d="M16 2v4a2 2 0 0 0 2 2h4" />    </g>    <g stroke-width="1.5">        <path d="M5.0714 16.467l-1 0a2.5 2.5 0 0 1 0-5l1 0" />        <path d="M8.0714 11.467l1 0a2.5 2.5 0 1 1 0 5l-1 0" />        <line x1="4.571429" x2="8.571429" y1="13.967033" y2="13.967033" />    </g></svg>',
};
