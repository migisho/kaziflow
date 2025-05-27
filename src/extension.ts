import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { KaziCodeActionProvider, KAZI_PIN_COMMAND_ID, KAZI_PIN_TEXT } from './KaziCodeActionProvider';

interface Task {
    id: string;
    name: string;
    description?: string;
    done: boolean;
    filePath?: string;
    lineNumber?: number;
    pinComment?: string;
}

interface WorkItem {
    id: string;
    name: string;
    type: 'feature' | 'bug';
    branchName: string;
    tasks: Task[];
    isCompleted: boolean;
    filePath?: string;
    lineNumber?: number;
    pinComment?: string;
}

let projectFeatures: { [projectId: string]: WorkItem[] } = {};
let featuresViewProviderInstance: FeaturesViewProvider | undefined = undefined;
let currentWebviewView: vscode.WebviewView | undefined = undefined;
let currentProjectGitBranches: string[] = [];
let activeGitBranch: string | undefined;
let projectTrackingPromptInfo: { path: string, name: string } | null = null;

// --- Activation ---
export function activate(context: vscode.ExtensionContext) {
    console.log('[KaziFlow] Extension "kaziflow" is now active!');

    context.subscriptions.push(
        vscode.commands.registerCommand('kaziflowFeaturePlugin.createFeature', (isFromPin = false, pinDocUri?: vscode.Uri, pinOriginalRange?: vscode.Range) => 
            createNewWorkItemCommand(isFromPin, pinDocUri, pinOriginalRange)
        ),
        vscode.commands.registerCommand('kaziflowFeaturePlugin.refreshWebView', async () => {
            console.log('[KaziFlow] User triggered refreshWebView command.');
            await updateProjectContextAndRefreshUI();
        }),
        vscode.commands.registerCommand('kaziflowFeaturePlugin.approveBranchFromWeb', (featureNameFromWeb?: string, requestedBranchName?: string) => {
            if (featureNameFromWeb) {
                 handleBranchRequestFromWebApp(featureNameFromWeb, requestedBranchName);
            } else {
                vscode.window.showWarningMessage("Branch creation from web app called without feature name.");
            }
        }),
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file' }, new KaziCodeActionProvider(),
            { providedCodeActionKinds: KaziCodeActionProvider.providedCodeActionKinds }
        ),
        vscode.commands.registerCommand(KAZI_PIN_COMMAND_ID, async (docUri: vscode.Uri, pinRange: vscode.Range) => {
            await handleCreateItemFromPin(docUri, pinRange);
        })
    );
    console.log('[KaziFlow] Commands and CodeActionProvider registered.');

    const provider = new FeaturesViewProvider(context.extensionUri);
    featuresViewProviderInstance = provider;
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(FeaturesViewProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );
    console.log(`[KaziFlow] FeaturesViewProvider registered for viewType: ${FeaturesViewProvider.viewType}`);
    
    detectAndOfferProjectTracking();     
    updateProjectContextAndRefreshUI(); 

    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        console.log('[KaziFlow] Workspace folders changed.');
        projectTrackingPromptInfo = null;
        detectAndOfferProjectTracking();
        await updateProjectContextAndRefreshUI();
    });

    setupGitWatchers(context);
}

function setupGitWatchers(context: vscode.ExtensionContext) {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const workspaceRootUri = vscode.workspace.workspaceFolders[0].uri;
        const handleGitChange = async (uri?: vscode.Uri) => {
            console.log(`[KaziFlow] Git change detected by watcher (uri: ${uri?.fsPath || 'HEAD/Refs'}). Updating context.`);
            await updateProjectContextAndRefreshUI();
        };
        try {
            const dotGitUri = vscode.Uri.joinPath(workspaceRootUri, '.git');
            vscode.workspace.fs.stat(dotGitUri).then(async stat => {
                if (stat.type === vscode.FileType.Directory) {
                    console.log('[KaziFlow] .git directory found. Setting up watchers.');
                    const headWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceRootUri, '.git/HEAD'));
                    headWatcher.onDidChange(handleGitChange); headWatcher.onDidCreate(handleGitChange); headWatcher.onDidDelete(handleGitChange);
                    context.subscriptions.push(headWatcher);

                    const branchWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceRootUri, '.git/refs/heads/**'));
                    branchWatcher.onDidChange(handleGitChange); branchWatcher.onDidCreate(handleGitChange); branchWatcher.onDidDelete(handleGitChange);
                    context.subscriptions.push(branchWatcher);
                }
            }, () => console.log('[KaziFlow] No .git directory found. Git watchers not set up.'));
        } catch (watchError) { console.error('[KaziFlow] Error setting up .git file watchers:', watchError); }
    } else { console.log('[KaziFlow] No workspace folder. Git watchers not set up.'); }
}

export function deactivate() { console.log('[KaziFlow] Extension "kaziflow" is now deactivated.'); }

function getNonce(): string { let t = ""; const n = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; for (let o = 0; o < 32; o++){t += n.charAt(Math.floor(Math.random() * n.length));} return t; }
function slugify(text: string): string { return text.toString().toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "").replace(/--+/g, "-").replace(/^-+/, "").replace(/-+$/, ""); }
function getCurrentProjectPath(): string | undefined { const e = vscode.workspace.workspaceFolders; return e && e.length > 0 ? e[0].uri.fsPath : void 0; }
function getProjectId(projectPath: string): string { return path.basename(projectPath); }

function getFormattedTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${year}_${month}_${day}_${hours}_${minutes}_${seconds}`; 
}

async function detectAndOfferProjectTracking() {
    const projectPath = getCurrentProjectPath();
    let needsUiUpdate = false;
    if (projectPath) {
        const projectName = path.basename(projectPath);
        const projectId = getProjectId(projectPath);
        if (projectFeatures[projectId] === undefined) {
            if (!projectTrackingPromptInfo || projectTrackingPromptInfo.path !== projectPath) {
                projectTrackingPromptInfo = { path: projectPath, name: projectName };
                console.log(`[KaziFlow] Project '${projectName}' is new. Prompt info set.`);
                needsUiUpdate = true;
            }
        } else {
            if (projectTrackingPromptInfo && projectTrackingPromptInfo.path === projectPath) {
                projectTrackingPromptInfo = null;
                console.log(`[KaziFlow] Project '${projectName}' is known. Clearing prompt.`);
                needsUiUpdate = true;
            }
        }
    } else {
        if (projectTrackingPromptInfo) { projectTrackingPromptInfo = null; needsUiUpdate = true; console.log('[KaziFlow] No project open, cleared prompt.');}
    }
    if (needsUiUpdate && featuresViewProviderInstance) { featuresViewProviderInstance.update(); }
}

async function linkProjectToUserBackend(projectPath: string | undefined) {
    if (!projectPath) {return;}
    const projectId = getProjectId(projectPath);
    const projectName = path.basename(projectPath);
    vscode.window.showInformationMessage(`KaziFlow is now tracking project: '${projectName}'.`);
    if (projectFeatures[projectId] === undefined) { projectFeatures[projectId] = []; }
    projectTrackingPromptInfo = null;
    await updateProjectContextAndRefreshUI();
}

async function updateProjectContextAndRefreshUI() {
    const projectPath = getCurrentProjectPath();
    let activeBranchBefore = activeGitBranch;
    let branchesBeforeJson = JSON.stringify(currentProjectGitBranches.sort());

    if (projectPath) {
        try {
            activeGitBranch = (await executeGitCommand('rev-parse --abbrev-ref HEAD', projectPath)).trim();
            currentProjectGitBranches = await getProjectBranches(projectPath);
        } catch (gitError: any) { activeGitBranch = undefined; currentProjectGitBranches = []; }
    } else { activeGitBranch = undefined; currentProjectGitBranches = []; }

    if (activeGitBranch !== activeBranchBefore || JSON.stringify(currentProjectGitBranches.sort()) !== branchesBeforeJson) {
        console.log(`[KaziFlow] Project context updated. Active branch: ${activeGitBranch}`);
    }
    if (featuresViewProviderInstance) { featuresViewProviderInstance.update(); }
}

async function getProjectBranches(projectPath: string): Promise<string[]> {
    try {
        const raw = await executeGitCommand('branch --list --no-color --format="%(refname:short)"', projectPath);
        return raw.split('\n').map(b => b.trim()).filter(b => b && b !== 'HEAD');
    } catch (e) { return []; }
}

function storeWorkItem(projectId: string, name: string, type: 'feature' | 'bug', branchName: string, pinFilePath?: string, pinLineNumber?: number, initialPinText?: string): WorkItem {
    if (!projectFeatures[projectId]) { 
        console.error(`[KaziFlow] CRITICAL: storeWorkItem called for untracked project ID: ${projectId}. Initializing defensively.`);
        projectFeatures[projectId] = []; 
    }
    const newWorkItem: WorkItem = {
        id: `${type}-${Date.now()}`,
        name: name,
        type: type,
        branchName: branchName,
        tasks: [],
        isCompleted: false,
        filePath: pinFilePath,
        lineNumber: pinLineNumber,
        pinComment: initialPinText
    };
    projectFeatures[projectId].push(newWorkItem);
    console.log(`[KaziFlow] ${type} '${name}' (ID: ${newWorkItem.id}) stored for project '${projectId}'. Total items: ${projectFeatures[projectId].length}.`); // CORRECTED console.log
    return newWorkItem;
}

async function createNewWorkItemCommand(isFromPin: boolean = false, pinDocUri?: vscode.Uri, pinOriginalRange?: vscode.Range): Promise<WorkItem | undefined> {
    console.log('[KaziFlow] createNewWorkItemCommand called.', { isFromPin, pinDocPath: pinDocUri?.fsPath });
    const projectPath = getCurrentProjectPath();
    if (!projectPath) { vscode.window.showErrorMessage('No active project.'); return undefined; }
    const projectId = getProjectId(projectPath);
    const projectName = path.basename(projectPath);

    if (projectFeatures[projectId] === undefined) {
        const track = await vscode.window.showInformationMessage(`Project '${projectName}' not tracked. Track to add items?`, "Yes, Track", "Cancel");
        if (track === "Yes, Track") { await linkProjectToUserBackend(projectPath); } else { return undefined; }
        if (projectFeatures[projectId] === undefined) { vscode.window.showErrorMessage("Failed to track project."); return undefined; }
    }

    const itemTypeSelection = await vscode.window.showQuickPick([{ label: 'Feature', description: 'branch: feature/name' }, { label: 'Bug', description: 'branch: bug/name' }], { placeHolder: 'Select item type' });
    if (!itemTypeSelection) {return undefined;}
    const itemType = itemTypeSelection.label.toLowerCase() as 'feature' | 'bug';

    let itemTitle = await vscode.window.showInputBox({ prompt: `Enter title for the new ${itemType}` });
    if (!itemTitle) {return undefined;}

    let branchPrefix = itemType; let actualTitle = itemTitle;
    if (itemTitle.toLowerCase().startsWith('ft:')) { branchPrefix = 'feature'; actualTitle = itemTitle.substring(3).trim(); }
    else if (itemTitle.toLowerCase().startsWith('bug:')) { branchPrefix = 'bug'; actualTitle = itemTitle.substring(4).trim(); }
    if (!actualTitle) { vscode.window.showErrorMessage('Title cannot be empty.'); return undefined; }

    const proposedBranchName = `${branchPrefix}/${slugify(actualTitle)}`; // CORRECTED
    const shouldCreateBranch = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: `Create Git branch '${proposedBranchName}'?` });
    let finalBranchName = '';
    if (shouldCreateBranch === 'Yes') {
        finalBranchName = proposedBranchName;
        try {
            await executeGitCommand(`checkout -b ${finalBranchName}`, projectPath);
            vscode.window.showInformationMessage(`Branch '${finalBranchName}' created & checked out.`);
            await updateProjectContextAndRefreshUI();
        } catch (e: any) { vscode.window.showErrorMessage(`Branch creation failed: ${e.message}`); finalBranchName = ''; vscode.window.showWarningMessage(`Item created without branch.`); }
    }

    const newWorkItem = storeWorkItem(projectId, actualTitle, itemType, finalBranchName, isFromPin ? pinDocUri?.fsPath : undefined, isFromPin ? pinOriginalRange?.start.line : undefined, isFromPin && pinOriginalRange ? KAZI_PIN_TEXT : undefined);
    if (featuresViewProviderInstance) { featuresViewProviderInstance.update(); }
    return newWorkItem;
}

async function handleCreateItemFromPin(docUri: vscode.Uri, pinRange: vscode.Range) {
    console.log(`[KaziFlow] handleCreateItemFromPin for URI: ${docUri.fsPath}, Line: ${pinRange.start.line + 1}`);
    const projectPath = getCurrentProjectPath();
    if (!projectPath || !docUri.fsPath.startsWith(projectPath)) { vscode.window.showErrorMessage("KaziFlow pin must be in active project."); return; }
    const projectId = getProjectId(projectPath);
    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === docUri.toString());

    if (projectFeatures[projectId] === undefined) {
        const track = await vscode.window.showInformationMessage(`Project '${path.basename(projectPath)}' not tracked. Track to use pins?`, "Yes, Track", "Cancel");
        if (track === "Yes, Track") { await linkProjectToUserBackend(projectPath); if (projectFeatures[projectId] === undefined) { vscode.window.showErrorMessage("Failed to track project."); if(editor) {editor.edit(e=>e.delete(pinRange));} return; }}
        else { if(editor) {editor.edit(e=>e.delete(pinRange));} return; }
    }

    const choice = await vscode.window.showQuickPick(
        [{ label: "New Feature/Bug", detail: "Create a new top-level work item." }, { label: "New Task", detail: "Add a task to an existing Feature/Bug." }],
        { placeHolder: "Create from pin:" }
    );
    if (!choice) { if(editor) {editor.edit(e=>e.delete(pinRange));} return; }

    if (choice.label === "New Feature/Bug") {
        const createdWorkItem = await createNewWorkItemCommand(true, docUri, pinRange);
        if (createdWorkItem && editor) {
            const finalPinComment = `//:Kazi-${createdWorkItem.type}-${slugify(createdWorkItem.name)} (id:${createdWorkItem.id})`; // CORRECTED
            createdWorkItem.pinComment = finalPinComment; 
            editor.edit(editBuilder => editBuilder.replace(pinRange, finalPinComment));
            vscode.window.showInformationMessage(`KaziFlow: ${createdWorkItem.type} '${createdWorkItem.name}' created & pinned.`); // CORRECTED
        } else if (editor) { editor.edit(editBuilder => editBuilder.delete(pinRange)); }
    } else if (choice.label === "New Task") {
        const workItemsInProject = projectFeatures[projectId] || [];
        if (workItemsInProject.length === 0) { vscode.window.showInformationMessage("No existing items to add task to."); if(editor) {editor.edit(e=>e.delete(pinRange));} return; }
        const workItemChoices = workItemsInProject.map(item => ({ label: `[${item.type.toUpperCase()}] ${item.name}`, id: item.id })); // Added description if available: description: item.branchName || "No branch"
        const selectedParentChoice = await vscode.window.showQuickPick(workItemChoices, { placeHolder: "Add task to which item?" });
        if (!selectedParentChoice) { if(editor) {editor.edit(e=>e.delete(pinRange));} return; }
        const parentWorkItem = workItemsInProject.find(item => item.id === selectedParentChoice.id);
        if (!parentWorkItem) { if(editor) {editor.edit(e=>e.delete(pinRange));} return; }

        const taskName = await vscode.window.showInputBox({ prompt: "New task name:" });
        if (!taskName) { if(editor) {editor.edit(e=>e.delete(pinRange));} return; }
        const taskDescription = await vscode.window.showInputBox({ prompt: "Task description (optional):" });

        const finalPinComment = `//:Kazi-Task[${slugify(taskName)}]-for-[${slugify(parentWorkItem.name)}] (id:task-${Date.now()})`; // Use a new ID for the task in pin
        const newTask: Task = { id: `task-${Date.now()}`, name: taskName, description: taskDescription || undefined, done: false, filePath: docUri.fsPath, lineNumber: pinRange.start.line, pinComment: finalPinComment }; // Assign finalPinComment to task
        parentWorkItem.tasks.push(newTask);
        console.log(`[KaziFlow] Task '${taskName}' pinned and added to '${parentWorkItem.name}'.`); // CORRECTED console.log
        if (editor) { editor.edit(editBuilder => editBuilder.replace(pinRange, finalPinComment)); }
        if (featuresViewProviderInstance) { featuresViewProviderInstance.update(); }
    }
}

async function handleFeatureCompletion(projectId: string, itemId: string) {
    console.log(`[KaziFlow] handleFeatureCompletion called for projectId: ${projectId}, itemId: ${itemId}`);
    const projectPath = getCurrentProjectPath();

    if (!projectPath) { vscode.window.showErrorMessage("Cannot complete item: Active project path not found."); return; }
    if (getProjectId(projectPath) !== projectId) { vscode.window.showErrorMessage("Cannot complete item: Item belongs to a different project."); return; }

    const item = projectFeatures[projectId]?.find(f => f.id === itemId);
    if (!item) { vscode.window.showWarningMessage("Work item not found."); return; }
    
    item.isCompleted = true;
    console.log(`[KaziFlow] Item '${item.name}' marked as isCompleted=true locally.`);

    if (!item.branchName) {
        vscode.window.showInformationMessage(`Work item '${item.name}' marked complete. No Git branch associated; no Git actions.`);
    } else {
        vscode.window.showInformationMessage(`Automating Git for completed item: ${item.name} (Branch: ${item.branchName})`);
        try {
            const currentGitBranchName = await executeGitCommand('rev-parse --abbrev-ref HEAD', projectPath);
            if (currentGitBranchName !== item.branchName) { 
                const switchToBranch = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: `On branch '${currentGitBranchName}'. Switch to '${item.branchName}' for Git actions?` });
                if (switchToBranch !== 'Yes') { vscode.window.showInformationMessage("Item completion (Git actions) aborted by user."); await updateProjectContextAndRefreshUI(); return; }
                await executeGitCommand(`checkout ${item.branchName}`, projectPath);
            }
            await executeGitCommand(`add .`, projectPath);
            await executeGitCommand(`commit -m "Completed ${item.type}: ${item.name}"`, projectPath);
            await executeGitCommand(`push origin ${item.branchName}`, projectPath);
            vscode.window.showInformationMessage(`Pushed '${item.branchName}'.`);
            const stageBranch = 'stage';
            try { await executeGitCommand(`checkout ${stageBranch}`, projectPath); } 
            catch (error) { vscode.window.showInformationMessage(`Branch '${stageBranch}' not found. Creating...`); await executeGitCommand(`checkout -b ${stageBranch}`, projectPath); }
            try { await executeGitCommand(`pull origin ${stageBranch}`, projectPath); } catch (pullError: any) { console.warn(`[KaziFlow] Pull from origin ${stageBranch} failed: ${pullError.message}`); }
            await executeGitCommand(`merge --no-ff ${item.branchName}`, projectPath);
            vscode.window.showInformationMessage(`Merged '${item.branchName}' into '${stageBranch}'.`);
            await executeGitCommand(`push origin ${stageBranch}`, projectPath);
            vscode.window.showInformationMessage(`Pushed '${stageBranch}'.`);
            vscode.window.showInformationMessage(`${item.type} '${item.name}' processed and merged to '${stageBranch}'.`);
        } catch (error: any) { vscode.window.showErrorMessage(`Git automation failed for '${item.name}': ${error.message}`); console.error("[KaziFlow] Git automation error:", error); }
    }
    await updateProjectContextAndRefreshUI();
}

async function handleBranchRequestFromWebApp(featureName: string, requestedBranchName?: string) { 
    console.log(`[KaziFlow] handleBranchRequestFromWebApp for feature: ${featureName}`);
    const projectPath = getCurrentProjectPath();
    if (!projectPath) { vscode.window.showErrorMessage('No active project for web app branch request.'); return; }
    const projectId = getProjectId(projectPath);
    const projectName = path.basename(projectPath);

    if (projectFeatures[projectId] === undefined) {
        vscode.window.showWarningMessage(`Project ${projectName} is not tracked by KaziFlow.`); return;
    }
    const itemType: 'feature' | 'bug' = featureName.toLowerCase().startsWith('bug:') ? 'bug' : (featureName.toLowerCase().startsWith('ft:') ? 'feature' : 'feature');
    const actualTitle = featureName.toLowerCase().startsWith('bug:') ? featureName.substring(4).trim() : (featureName.toLowerCase().startsWith('ft:') ? featureName.substring(3).trim() : featureName);

    const branchName = requestedBranchName || `${itemType}/${slugify(actualTitle)}`;
    const approve = await vscode.window.showInformationMessage(`Approve Git branch creation for '${actualTitle}' (branch: ${branchName}) from web app?`, { modal: true }, 'Approve', 'Deny');

    if (approve === 'Approve') {
        try {
            await executeGitCommand(`checkout -b ${branchName}`, projectPath);
            vscode.window.showInformationMessage(`Branch '${branchName}' created from web request.`);
            storeWorkItem(projectId, actualTitle, itemType, branchName); 
            await updateProjectContextAndRefreshUI();
        } catch (error: any) { vscode.window.showErrorMessage(`Failed to create branch '${branchName}': ${error.message}`); }
    } else { vscode.window.showInformationMessage(`Branch creation for '${actualTitle}' denied.`); }
}

async function executeGitCommand(command: string, cwd: string): Promise<string> { 
    return new Promise((resolve, reject) => {
        const fullCommand = command.startsWith('git ') ? command : `git ${command}`;
        cp.exec(fullCommand, { cwd }, (error, stdout, stderr) => {
            if (error) { const err = stderr || stdout || error.message; console.error(`[KaziFlow] Git cmd error ("${fullCommand}"): ${err}`); reject(new Error(err)); return; }
            resolve(stdout.trim());
        });
    });
}

class FeaturesViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'kaziflowFeaturesView';
    private _extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        console.log('[KaziFlow Provider] constructor. URI:', extensionUri.fsPath);
        this._extensionUri = extensionUri;
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        console.log('[KaziFlow Provider] resolveWebviewView CALLED.');
        currentWebviewView = webviewView;

        try {
            const mediaRoot = vscode.Uri.joinPath(this._extensionUri, 'media');
            const nodeModulesRoot = vscode.Uri.joinPath(this._extensionUri, 'node_modules');
            
            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [ mediaRoot, nodeModulesRoot, this._extensionUri]
            };
            console.log('[KaziFlow Provider] Webview options SET.');
        } catch (e: any) { console.error('[KaziFlow Provider] CRITICAL ERROR setting webview options:', e); return; }
        
        try {
            this._updateWebview(webviewView.webview);
        } catch (e: any) { console.error('[KaziFlow Provider] ERROR during initial _updateWebview call:', e); return; }

        const disposables: vscode.Disposable[] = [];
        webviewView.onDidDispose(() => {
            if (currentWebviewView === webviewView) {currentWebviewView = undefined;}
            disposables.forEach(d => d.dispose());
        }, null, disposables);

        webviewView.webview.onDidReceiveMessage(async message => {
            console.log('[KaziFlow Provider] Received message (raw obj):', message);
            if (!message || message.command === undefined) { console.error('[KaziFlow P.] ERROR: Msg with UNDEFINED command.', message); return; }
            console.log('[KaziFlow Provider] Processing command:', message.command);

            const projectPath = getCurrentProjectPath();
            const projectId = projectPath ? getProjectId(projectPath) : undefined;
            const commandsNeedingProjectContext = ['createFeature', 'addTask', 'toggleTask', 'checkoutBranch', 'navigateToPin'];
            const commandsNeedingTrackedProject = ['addTask', 'toggleTask'];

            if (commandsNeedingProjectContext.includes(message.command) && !projectId) {
                vscode.window.showErrorMessage("KaziFlow: No active project for this action."); return;
            }
            if (commandsNeedingTrackedProject.includes(message.command) && projectId && projectFeatures[projectId] === undefined) {
                vscode.window.showInformationMessage(`Please track project '${path.basename(projectPath!)}' to manage items.`); return;
            }

            try {
                switch (message.command) {
                    case 'createFeature': 
                        vscode.commands.executeCommand('kaziflowFeaturePlugin.createFeature'); 
                        break;
                    case 'addTask':
                        console.log('[KaziFlow P.] addTask. ItemID:', message.featureId, "TaskName:", message.taskName);
                        if (projectId && message.featureId && message.taskName) {
                            const workItem = projectFeatures[projectId]?.find(f => f.id === message.featureId);
                            if (workItem) {
                                const taskDescription = await vscode.window.showInputBox({
                                    prompt: `Enter description for task "${message.taskName}" (optional)`,
                                    placeHolder: "Task details, context, links, etc."
                                });

                                const newTask: Task = { 
                                    id: `task-${Date.now()}`, 
                                    name: message.taskName, 
                                    description: taskDescription || undefined,
                                    done: false 
                                };
                                workItem.tasks.push(newTask);
                                console.log(`[KaziFlow P.] Task '${message.taskName}' ADDED to '${workItem.name}'. Desc: "${taskDescription}". Tasks:`, JSON.stringify(workItem.tasks));
                                this.update(); 
                            } else { console.warn(`[KaziFlow P.] addTask: WorkItem ID ${message.featureId} not found.`); }
                        } else { console.warn(`[KaziFlow P.] addTask: Missing data.`); }
                        break;
                    case 'toggleTask': 
                        if (projectId && message.featureId && message.taskId) {
                            const workItem = projectFeatures[projectId]?.find(f => f.id === message.featureId);
                            const task = workItem?.tasks.find(t => t.id === message.taskId);
                            if (task) {
                                task.done = !task.done;
                                if (workItem) {workItem.isCompleted = workItem.tasks.every(t => t.done);}
                                console.log(`[KaziFlow P.] Task '${task.name}' toggled to ${task.done}. Item completed: ${workItem?.isCompleted}`);
                                this.update(); 
                                // Auto-move to review is handled by _getHtmlForWebview re-rendering
                                // If item is completed, handleFeatureCompletion will be called if it has a branch
                                if (workItem?.isCompleted && workItem.branchName) { // Only call if branch exists
                                    await handleFeatureCompletion(projectId, workItem.id); 
                                } else if (workItem?.isCompleted) {
                                    vscode.window.showInformationMessage(`Item '${workItem.name}' is complete!`);
                                    await updateProjectContextAndRefreshUI(); // Ensure UI reflects any state change
                                }
                            }
                        }
                        break;
                    case 'checkoutBranch': 
                        if (message.branchName)
                        {break;}
                    case 'refreshWebview': 
                        console.log('[KaziFlow Provider] Refresh from webview.');
                        await updateProjectContextAndRefreshUI(); 
                        break;
                    case 'confirmProjectTracking':
                        if (message.projectPath && message.projectName) {
                            await linkProjectToUserBackend(message.projectPath);
                        }
                        break;
                    case 'denyProjectTracking': 
                        if (message.projectPath && message.projectName) {
                            projectTrackingPromptInfo = null; 
                            if (featuresViewProviderInstance) {featuresViewProviderInstance.update();}
                        }
                        break;
                    case 'uiRefreshed': break; 
                    case 'navigateToPin':
                         if (message.workItemId && projectId && projectFeatures[projectId]) {
                            const workItem = projectFeatures[projectId].find(wi => wi.id === message.workItemId);
                            const task = message.taskId ? workItem?.tasks.find(t => t.id === message.taskId) : undefined;
                            const itemToNavigate = task || workItem;
                            if (itemToNavigate && itemToNavigate.filePath && itemToNavigate.lineNumber !== undefined) {
                                const uri = vscode.Uri.file(itemToNavigate.filePath);
                                const line = itemToNavigate.lineNumber;
                                vscode.window.showTextDocument(uri, { selection: new vscode.Range(line, 0, line, 0), preview: false });
                            } else { vscode.window.showWarningMessage("Pin location not found."); }
                        }
                        break;
                    default: console.warn('[KaziFlow P.] Unknown command:', message.command);
                }
            } catch (e: any) { console.error('[KaziFlow P.] Error handling message:', message.command, e); }
        }, undefined, disposables);
        console.log('[KaziFlow Provider] resolveWebviewView finished.');
    }

    public update() { if (currentWebviewView) { this._updateWebview(currentWebviewView.webview); } }

    private _updateWebview(webview: vscode.Webview) {
        try {
            webview.html = this._getHtmlForWebview(webview);
            webview.postMessage({ command: 'uiRefreshed' });
        } catch (e: any) { console.error('[KaziFlow Provider] Error in _updateWebview:', e); webview.html = `<h1>Error</h1><p>${e.message}</p><pre>${e.stack}</pre>`; }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        try {
            const projectPath = getCurrentProjectPath();
            const projectId = projectPath ? getProjectId(projectPath) : undefined;
            const projectName = projectPath ? path.basename(projectPath) : "No active project";

            const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
            const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));
            const toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.js'));
            const nonce = getNonce();

            if (projectTrackingPromptInfo && projectTrackingPromptInfo.path === projectPath) {
                // (Ensure IDs "track-project-yes" and "track-project-no" are on the vscode-buttons)
                return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Track Project?</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src 'self' ${webview.cspSource} https://*.vscode-cdn.net; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}' ${webview.cspSource};">
                    <link href="${styleUri}" rel="stylesheet"><script type="module" nonce="${nonce}" src="${toolkitUri}"></script>
                    </head><body><div class="container"><div class="prompt-container">
                    <h1 class="app-title">KaziFlow</h1>
                    <p>Track project: <strong>${projectTrackingPromptInfo.name}</strong>?</p>
                    <div><vscode-button id="track-project-yes" data-project-path="${projectTrackingPromptInfo.path}" data-project-name="${projectTrackingPromptInfo.name}">Yes, Track</vscode-button>
                    <vscode-button id="track-project-no" data-project-path="${projectTrackingPromptInfo.path}" data-project-name="${projectTrackingPromptInfo.name}" appearance="secondary">No, Not Now</vscode-button></div>
                    </div></div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
            }

            const allItems = projectId ? (projectFeatures[projectId] || []) : [];
            const activeItems = allItems.filter(item => !item.isCompleted);
            const completedItems = allItems.filter(item => item.isCompleted);

            let branchesAccordionHtml = '';
            if (projectPath && currentProjectGitBranches.length > 0) {  }
            else if (projectPath) { branchesAccordionHtml = "<p><em>Not a Git repo or no branches.</em></p>"; }

            const renderWorkItem = (item: WorkItem) => {
                const itemPinIcon = (item.filePath && item.lineNumber !== undefined) ? `<vscode-link class="item-pin-link" data-item-id="${item.id}" title="Go to pin for ${item.type} '${item.name}'"><span class="codicon codicon-pin"></span></vscode-link>` : '';
                return `
                <details class="accordion work-item-accordion ${item.isCompleted ? 'completed-item' : ''} ${item.type === 'bug' ? 'bug-item' : 'feature-item'}" data-item-id="${item.id}">
                    <summary>
                        <vscode-tag>${item.type.toUpperCase()}</vscode-tag> 
                        <span class="item-name">${item.name}</span> 
                        ${itemPinIcon}
                        ${item.branchName ? `(<vscode-badge>${item.branchName}</vscode-badge>)` : '<span class="no-branch-badge">(No branch)</span>'}
                        ${item.isCompleted ? '<vscode-badge appearance="success">DONE</vscode-badge>' : ''}
                    </summary>
                    <div class="accordion-content work-item-details">
                        ${(item.filePath && item.lineNumber !== undefined) ? `<p class="item-pin-info">Pinned: ${path.basename(item.filePath)} (line ${item.lineNumber + 1})</p>` : ''}
                        ${!item.isCompleted ? `
                        <div class="task-input-container">
                            <vscode-text-field id="task-input-${item.id}" placeholder="New task name" size="30"></vscode-text-field>
                            <vscode-button appearance="secondary" data-feature-id="${item.id}" class="add-task-btn">Add Task</vscode-button>
                        </div>` : ''}
                        <ul class="task-list">
                            ${item.tasks.map(task => {
                                const taskPinIcon = task.filePath && task.lineNumber !== undefined ? `<vscode-link class="task-pin-link" data-item-id="${item.id}" data-task-id="${task.id}" title="Go to pin for task '${task.name}'"><span class="codicon codicon-link"></span></vscode-link>` : '';
                                // **NEW: Apply class for line-through to task name**
                                const taskNameClass = task.done ? 'task-name completed-task' : 'task-name';
                                return `<li class="task-item">
                                    <div class="task-line">
                                        <vscode-checkbox id="task-${task.id}" ${task.done ? 'checked' : ''} data-feature-id="${item.id}" data-task-id="${task.id}" class="task-checkbox">
                                            <span class="${taskNameClass}">${task.name}</span>
                                        </vscode-checkbox>
                                        ${taskPinIcon}
                                    </div>
                                    ${task.description ? `<details class="task-description-accordion"><summary class="task-description-summary">Description</summary><p class="task-description-content">${task.description.replace(/\n/g, '<br>')}</p></details>` : ''}
                                </li>`;
                            }).join('')}
                            ${item.tasks.length === 0 ? '<li><span class="no-tasks-message">No tasks yet.</span></li>' : ''}
                        </ul>
                    </div>
                </details>`;
            };
            
            let activeItemsHtml = `<div class="items-placeholder"><p>No active items.</p></div>`;
            if (activeItems.length > 0) {
                activeItemsHtml = activeItems.map(renderWorkItem).join('');
            }
            
            let completedItemsHtml = `<div class="items-placeholder"><p>No completed items yet.</p></div>`;
            if (completedItems.length > 0) {
                completedItemsHtml = completedItems.map(renderWorkItem).join('');
            }

            // Handle cases for project tracking status
            if (projectId && projectFeatures[projectId] === undefined && !projectTrackingPromptInfo) { 
                 activeItemsHtml = `<div class="items-placeholder"><p>Project '${projectName}' is not tracked by KaziFlow.</p></div>`;
                 completedItemsHtml = ""; // No completed items if not tracked
            } else if (!projectId) { 
                activeItemsHtml = `<div class="items-placeholder"><p>No project open.</p></div>`;
                completedItemsHtml = "";
            }
            
            const bodyHtml = `
                <div class="project-info-section">
                    <p>Project: <strong>${projectName}</strong></p>
                    <div class="branches-section">${branchesAccordionHtml}</div>
                </div> <hr/>
                <div class="action-buttons-section">
                     <vscode-button id="create-feature-btn" appearance="primary">Create New Item</vscode-button>
                     
                     <vscode-button id="refresh-webview-btn" appearance="icon" title="Refresh KaziFlow View">
                        <span class="codicon codicon-refresh"></span>
                     </vscode-button>
                </div> 
                
                <section class="items-list-section">
                    <h2>Active Items</h2>
                    ${activeItemsHtml}
                </section>
                <hr/>
                <section class="items-list-section completed-items-section">
                    <h2>Completed / Review</h2>
                    ${completedItemsHtml}
                </section>
                `;

            return `<!DOCTYPE html><html lang="en"><head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src 'self' ${webview.cspSource} https://*.vscode-cdn.net; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}' ${webview.cspSource};">
                <link href="${styleUri}" rel="stylesheet"><script type="module" nonce="${nonce}" src="${toolkitUri}"></script><title>KaziFlow</title>
                </head><body><div class="container"><h1 class="app-title">KaziFlow</h1>${bodyHtml}</div>
                <script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
        } catch (e: any) {
            console.error('[KaziFlow Provider] ERROR in _getHtmlForWebview:', e);
            return `<html><body><h1>Error: ${e.message}</h1><pre>${e.stack}</pre></body></html>`;
        }
    }
}