// media/main.js
// @ts-ignore
const vscode = acquireVsCodeApi();

const workItemAccordionStates = {}; 

function saveWorkItemAccordionStates() {
    document.querySelectorAll('details.work-item-accordion').forEach(acc => {
        // @ts-ignore
        if (acc.dataset.itemId) {workItemAccordionStates[acc.dataset.itemId] = acc.open;}
    });
    document.querySelectorAll('details.task-description-accordion').forEach(acc => {
        // @ts-ignore
        const parentTaskLi = acc.closest('li.task-item');
        // @ts-ignore
        const taskId = parentTaskLi?.querySelector('.task-checkbox')?.id;
        if (taskId) {
             // @ts-ignore
            workItemAccordionStates['desc-' + taskId] = acc.open;
        }
    });
}

function applyWorkItemAccordionStates() {
    document.querySelectorAll('details.work-item-accordion').forEach(acc => {
        // @ts-ignore
        if (acc.dataset.itemId && workItemAccordionStates[acc.dataset.itemId] !== undefined) {
            // @ts-ignore
            acc.open = workItemAccordionStates[acc.dataset.itemId];
        }
    });
     document.querySelectorAll('details.task-description-accordion').forEach(acc => {
        // @ts-ignore
        const parentTaskLi = acc.closest('li.task-item');
        // @ts-ignore
        const taskId = parentTaskLi?.querySelector('.task-checkbox')?.id;
        if (taskId && workItemAccordionStates['desc-' + taskId] !== undefined) {
            // @ts-ignore
            acc.open = workItemAccordionStates['desc-' + taskId];
        }
    });
}

window.addEventListener('load', () => {
    console.log('[KaziFlow Webview] main.js loaded.');
    applyWorkItemAccordionStates();

    document.getElementById('create-feature-btn')?.addEventListener('click', () => {
        saveWorkItemAccordionStates();
        console.log('[KaziFlow Webview] Create New Item button CLICKED.');
        vscode.postMessage({ command: 'createFeature' });
    });

    document.getElementById('refresh-webview-btn')?.addEventListener('click', () => {
        saveWorkItemAccordionStates();
        console.log('[KaziFlow Webview] Refresh webview button CLICKED.');
        vscode.postMessage({ command: 'refreshWebview' });
    });
    
    document.getElementById('track-project-yes')?.addEventListener('click', (event) => {
        saveWorkItemAccordionStates(); 
        console.log('[KaziFlow Webview] Track Project YES CLICKED.');
        const button = event.currentTarget; // No assertion needed
        // @ts-ignore
        vscode.postMessage({ command: 'confirmProjectTracking', projectPath: button.dataset.projectPath, projectName: button.dataset.projectName });
    });
    document.getElementById('track-project-no')?.addEventListener('click', (event) => {
        saveWorkItemAccordionStates();
        console.log('[KaziFlow Webview] Track Project NO CLICKED.');
        const button = event.currentTarget; // No assertion needed
        // @ts-ignore
        vscode.postMessage({ command: 'denyProjectTracking', projectPath: button.dataset.projectPath, projectName: button.dataset.projectName });
    });


    document.body.addEventListener('click', event => {
        const target = event.target; // No assertion needed

        // Add Task Button
        // @ts-ignore
        if (target && target.closest && target.closest('.add-task-btn')) {
            saveWorkItemAccordionStates();
            const button = target.closest('.add-task-btn'); // No assertion
            // @ts-ignore
            const featureId = button.dataset.featureId;
            const taskInput = document.getElementById(`task-input-${featureId}`); // No assertion
            // @ts-ignore
            if (taskInput && taskInput.value) {
                const messagePayload = { command: 'addTask', featureId: featureId, taskName: taskInput.value };
                console.log('[KaziFlow Webview] Posting "addTask":', JSON.stringify(messagePayload));
                vscode.postMessage(messagePayload);
                // @ts-ignore
                taskInput.value = '';
            }
        }

        // Branch Checkout Button
        // @ts-ignore
        if (target && target.closest && target.closest('.branch-checkout-btn')) {
            saveWorkItemAccordionStates();
            const button = target.closest('.branch-checkout-btn'); // No assertion
            // @ts-ignore
            const branchName = button.dataset.branchName;
            if (branchName) {
                console.log('[KaziFlow Webview] Checkout branch CLICKED:', branchName);
                vscode.postMessage({ command: 'checkoutBranch', branchName: branchName });
            }
        }
        
        // Pin Links
        // @ts-ignore
        if (target && target.closest && (target.closest('.task-pin-link') || target.closest('.item-pin-link'))) {
            saveWorkItemAccordionStates();
            const link = target.closest('.task-pin-link') || target.closest('.item-pin-link'); // No assertion
            // @ts-ignore
            const workItemId = link.dataset.itemId;
            // @ts-ignore
            const taskId = link.dataset.taskId; 
            
            if (workItemId) {
                 console.log(`[KaziFlow Webview] Navigate to pin CLICKED. ItemID: ${workItemId}, TaskID: ${taskId}`);
                 vscode.postMessage({ command: 'navigateToPin', workItemId: workItemId, taskId: taskId });
            }
        }
    });

    document.body.addEventListener('change', event => {
        const target = event.target; // No assertion needed
        // Task Checkbox
        // @ts-ignore
        if (target && target.closest && target.closest('.task-checkbox')) {
            saveWorkItemAccordionStates();
            const checkbox = target.closest('.task-checkbox'); // No assertion
            vscode.postMessage({
                command: 'toggleTask',
                // @ts-ignore
                featureId: checkbox.dataset.featureId, 
                // @ts-ignore
                taskId: checkbox.dataset.taskId
            });
        }
    });
    
    document.body.addEventListener('toggle', (event) => {
        const target = event.target; // No assertion needed
        // @ts-ignore
        if (target.classList.contains('work-item-accordion') || target.classList.contains('task-description-accordion')) {
            saveWorkItemAccordionStates();
        }
    }, true); 

    window.addEventListener('message', event => {
        const message = event.data;
        if (message.command === 'uiRefreshed') {
            console.log('[KaziFlow Webview] Received uiRefreshed. Applying accordion states.');
            applyWorkItemAccordionStates();
        }
    });
    console.log('[KaziFlow Webview] Event listeners set up.');
});