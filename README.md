# kaziFlow – Stay in Flow While You Code

**kaziFlow** is a lightweight yet powerful Visual Studio Code extension that helps developers **track tasks, manage branches, and stay productive**—all without leaving the IDE.

Designed with simplicity and focus in mind, kaziFlow keeps your task list right where you work, making sure you're always in control of what’s in progress and what’s done.

---

## ✨ Features

## ✨ Features

* **Seamless Project Integration:**
    * Automatically detects projects upon opening.
    * Prompts to track new projects directly within the KaziFlow sidebar.
* **Work Item Management (Features & Bugs):**
    * Create "Work Items" categorized as **Features** or **Bugs**.
    * Intuitive UI to select item type and provide a title.
    * **Automated Git Branching:**
        * Option to automatically create a Git branch when a new item is created.
        * Branches are named conventions (e.g., `feature/your-feature-title` or `bug/your-bug-title`).
        * Supports title prefixes like `ft:Your Title` or `bug:Your Title` for quick typing.
    * View items in an organized accordion layout in the sidebar.
* **Task Management:**
    * Add detailed tasks to any Feature or Bug.
    * Input both a **task name** and an optional **multi-line description**.
    * Mark tasks as complete with a satisfying strikethrough.
    * Task descriptions are viewable in an expandable section.
* **Automated Git Workflow on Completion:**
    * When all tasks for a Work Item with an associated branch are marked "Done":
        * `git add .`
        * `git commit -m "Completed [Feature/Bug]: [Item Name]"`
        * `git push origin [item-branch]`
        * Automatically checks out or creates a `stage` branch.
        * Merges the item branch into `stage` (`git merge [item-branch]`).
        * `git push origin stage`.
        * *(Note: No automatic merge to `main` or `master` is performed by KaziFlow.)*
    * Items without branches are simply marked as complete in the UI.
* **Integrated Branch Management:**
    * View all local Git branches for the current project in an accordion in the sidebar.
    * Clearly see your **current active branch**.
    * **Smart Branch Switching:** Click any branch in the sidebar to check it out.
        * KaziFlow will automatically stage all current changes (`git add .`) and create a commit with the message `kaziswitch_YYYY_MM_DD_HH_MM_SS` on your *current* branch before switching to the new one, helping you save work context effortlessly.
* **Incode Pinning with `//:kazi`:**
    * Type `//:kazi` directly in your code where you identify a new task or a new feature/bug.
    * A **Code Action (lightbulb)** will appear, allowing you to instantly create a KaziFlow item linked to that exact line of code.
    * The `//:kazi` comment is replaced with a descriptive comment linking to the created item (e.g., `//:Kazi-feature-new-login-flow (id:feature-123...)`).
* **User-Friendly Sidebar UI:**
    * Dedicated KaziFlow icon in the Activity Bar.
    * All features accessible via a clean sidebar panel.
    * Accordion UI for items and branches to keep things organized.
    * Accordion states (open/closed) are remembered during the session.
    * Refresh button (icon only) to update the view and branch information.
* **(Future/Placeholder) Web App Integration:**
    * Handles branch creation requests initiated from a companion web application.

---

## 🚀 Getting Started

1.  **Install KaziFlow** from the VS Code Marketplace.
2.  **Open your project/repository** in VS Code.
3.  Click on the **KaziFlow icon** in the Activity Bar to open the KaziFlow sidebar.

---

## 📖 How To Use KaziFlow

### 1. Project Tracking

* When you open a project for the first time with KaziFlow active, or switch to an untracked project, the KaziFlow sidebar will prompt you:
    > **KaziFlow**
    > Do you want to track the project: **YourProjectName** with KaziFlow?
    > [Yes, Track Project] [No, Not Now]
* Click **"Yes, Track Project"**. KaziFlow will now manage items for this project.
* If you select "No, Not Now," KaziFlow won't ask again for this project during the current session unless you switch workspaces or restart. The prompt will reappear if the project context is re-evaluated as new.

### 2. Managing Work Items (Features/Bugs)

* **Creating a New Item (via Sidebar):**
    1.  In the KaziFlow sidebar, ensure your project is tracked.
    2.  Click the **"Create New Item"** button.
    3.  A prompt will appear at the top of VS Code: **"Select the type of item to create"**. Choose `Feature` or `Bug`.
    4.  Next, you'll be prompted to **"Enter the title for the new [feature/bug]"**.
        * You can enter a plain title (e.g., "Implement dark mode").
        * Or, you can prefix your title with `ft:` for features or `bug:` for bugs (e.g., `ft:User profile page` or `bug:Login button alignment`). This prefix helps in quick branch naming if you choose to create one.
    5.  You'll then be asked: **"Create Git branch '[prefix]/[slugified-title]' for this [feature/bug]?"**.
        * Select `Yes` to automatically create and checkout a new branch (e.g., `feature/implement-dark-mode`).
        * Select `No` if you don't want a branch created by KaziFlow for this item.
    6.  The new item will appear in the "Active Items" section of the sidebar.

### 3. Managing Tasks (Manually via Sidebar)

Tasks live inside Features or Bugs.

1.  **Expand an Item:** In the sidebar, click on the summary of a Feature or Bug to expand its accordion and see its details.
2.  **Add a Task:**
    * You'll see an input field labeled **"New task name"** and an "Add Task" button.
    * Type the name of your task in the input field (e.g., "Design task list UI").
    * Click the **"Add Task"** button.
    * A VS Code input box will appear at the top: **"Enter description for task "[your task name]" (optional)"**. Type a description (multi-line is supported by pressing Shift+Enter for new lines in the input box) and press Enter, or leave it blank and press Enter.
    * The new task will appear under the item.
3.  **Viewing Task Descriptions:**
    * If a task has a description, you'll see a "Description" summary link below it. Click this to expand/collapse the description.
4.  **Completing a Task:**
    * Click the checkbox next to a task name to mark it as done.
    * Completed tasks will have a **line-through** their name.
5.  **Accordion State:** If you add a task to an open item accordion, the accordion will remain open.

### 4. Using Incode Pins (`//:kazi`)

This powerful feature lets you create items or tasks directly from your code editor.

1.  **Create a Pin:** In any code file, on a line where you want to create a reminder or link an action, type the comment:
    ```
    //:kazi
    ```
    (Or `#:kazi` in Python, `` in HTML/XML, etc. The key is the `//:kazi` string within a comment recognizable by VS Code).
2.  **Activate Code Action:**
    * A **lightbulb icon** 💡 should appear next to the line. Click it.
    * Alternatively, place your cursor on that line and press `Cmd+.` (macOS) or `Ctrl+.` (Windows/Linux).
    * Select **"KaziFlow: Create item/task from pin..."** from the suggestions.
3.  **Choose Creation Type:**
    * A prompt will ask: **"What do you want to create from this pin?"**
        * `New Feature/Bug`
        * `New Task`
4.  **If you chose "New Feature/Bug":**
    * The flow is the same as creating a new item from the sidebar (select type, enter title, choose branch option).
    * Once created, the `//:kazi` text in your code will be **replaced** with a KaziFlow-specific comment, for example:
        `//:Kazi-feature-user-profile-page (id:feature-1748...)`
    * The new Feature/Bug will appear in the sidebar, internally linked to this file and line.
5.  **If you chose "New Task":**
    1.  You'll be prompted to **"Select Feature/Bug to add this task to"** from a list of your existing items.
    2.  Then, you'll be asked for the **"New task name"**.
    3.  Then, an optional **"Task description"**.
    4.  Once created, the `//:kazi` text in your code will be replaced with a comment like:
        `//:Kazi-Task[new-task-name]-for-[parent-item-name] (id:task-1748...)`
    5.  The new task will appear under its parent item in the sidebar, linked to this file and line.

### 5. Branch Management via Sidebar

* **Viewing Branches:**
    * The "Branches" accordion in the sidebar shows all your local Git branches.
    * Your **current active branch** is highlighted.
* **Auto-Commit on Switch:**
    * When you click a *different* branch name in the sidebar to check it out:
        1.  KaziFlow checks your current branch for any uncommitted changes.
        2.  If changes exist, it automatically runs `git add .` and then `git commit -m "kaziswitch_YYYY_MM_DD_HH_MM_SS"` (with the current timestamp). This helps save your work context before switching.
        3.  If there are no changes, or no *staged* changes after `git add .`, it will inform you and skip the commit.
    * Then, it checks out the branch you selected.
* The branch display in the sidebar will update to reflect the new active branch.

### 6. Completing a Work Item (Feature/Bug)

1.  Mark all tasks within an item as complete. The item itself will then be marked as `DONE`.
2.  The completed item will automatically move from the "Active Items" section to the **"Completed / Review"** section in the sidebar.
3.  **If the item had a Git branch associated with it:**
    * KaziFlow will perform its automated Git workflow (add, commit, push item branch, checkout/create `stage`, merge to `stage`, push `stage`).
    * You will see notifications for these Git actions.
4.  If the item had no branch, it's simply marked as complete in the UI.

### 7. Refreshing the View

* Click the **Refresh icon button** (🔄) at the top of the KaziFlow sidebar to manually refresh the list of items, tasks, and branch information.

---

Happy KaziFlow-ing! We hope this extension significantly boosts your productivity.

## 🚀 Upcoming Features

We’re actively working on exciting features that push developer productivity to the next level:

- 🤖 **AI-Powered Error Detection**: Auto-create tasks when bugs or errors are detected.
- 🧠 **AI Bug Fix Suggestions**: Get intelligent fix recommendations when a bug is created.
- 💾 **Local Database Support**: Store tasks, metadata, and assets persistently offline.
- ⏰ **Notification & Reminders**: Enhanced scheduling and reminders to keep you focused.
- 📆 **Collaborative Scheduler**: Share and sync tasks across teammates with VS Code Live Share.
- 🔗 **Todoist Integration**: Sync tasks to Todoist with a single click.
- 🧭 **7 Habits Plugin Philosophy**: Inspired by "The 7 Habits of Highly Effective People"—prioritize your important tasks.
- 🧹 **Branch Cleanup**: Auto-delete branches once tasks are completed.
- 🎨 **UI Overhaul**: Beautiful, intuitive interface improvements are in progress.
- 🧩 **AI Agent Integration**: Assign tasks to your favorite AI extensions to complete on your behalf.
- 🧪 **Smart Code Review**: Auto-review and validate code before a task moves to “completed.”
- 🧰 **More Git Utilities**: Enhanced git tools to simplify your development workflow.

---

## 🛠️ Requirements

No special requirements. Just install and start using!

---

## ⚙️ Extension Settings

Coming soon! You'll be able to configure notifications, AI support, and integrations easily from the settings UI.

---

## 🐞 Known Issues

Currently in early development. Please report issues via GitHub so we can improve quickly.

---

## 📦 Release Notes

### 1.0.0 – Initial Release

- Core task creation and tracking
- Branch association
- Simple in-IDE task view

---

## 🤝 Contributing

**kaziFlow is free and open-source.**  
We welcome contributions of all kinds—bug fixes, ideas, design improvements, or new features.

- 🔧 Fork the repo
- 🧪 Create a feature or fix branch
- 📤 Submit a pull request

Join us in making developer flow better, one task at a time.

---

## 📫 Contact

Have feedback or ideas? Reach out or open an issue!

---

Stay focused. Stay in flow.  
**With _kaziFlow_ – Your IDE Task Companion.**