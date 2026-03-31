# Trilium Frontend Scripting

Frontend scripts run in the browser. They can manipulate the UI, navigate notes, show dialogs, and create custom widgets.

## Creating a frontend script

1. Create a Code note with language "JS frontend" (or "JSX" for Preact widgets).
2. Run manually (Execute button) or set `#run=frontendStartup` to auto-run on startup.
3. For mobile, use `#run=mobileStartup` instead.

## Script types

| Type | Description | Required attribute |
|---|---|---|
| Regular script | Runs with current app/note context | `#run=frontendStartup` (optional) |
| Custom widget | UI element in various positions | `#widget` |
| Launch bar widget | Button in the launch bar | `#widget` |
| Render note | Custom content inside a note | None (used via render relation) |

## Script API (`api` global)

### Navigation & tabs
- `api.activateNote(notePath)` - navigate to a note
- `api.activateNewNote(notePath)` - navigate and wait for sync
- `api.openTabWithNote(notePath, activate?)` - open in new tab
- `api.openSplitWithNote(notePath, activate?)` - open in new split
- `api.getActiveContextNote()` - get currently active note
- `api.getActiveContextNotePath()` - get path of active note
- `api.setHoistedNoteId(noteId)` - hoist/unhoist note in current tab

### Note access & search
- `api.getNote(noteId)` - get note by ID
- `api.getNotes(noteIds)` - bulk fetch notes
- `api.searchForNotes(searchString)` - search with full query syntax
- `api.searchForNote(searchString)` - search returning first result
- `api.reloadNotes(noteIds)` - refresh cache from backend

### Calendar/date notes
- `api.getTodayNote()` - get/create today's note
- `api.getDayNote(date)` - get/create day note for date
- `api.getWeekNote(date)` / `api.getMonthNote(month)` / `api.getYearNote(year)`

### Editor access
- `api.getActiveContextTextEditor()` - get CKEditor instance
- `api.getActiveContextCodeEditor()` - get CodeMirror instance
- `api.addTextToActiveContextEditor(text)` - insert text into active editor

### Dialogs & notifications
- `api.showMessage(msg)` - show info toast
- `api.showError(msg)` - show error toast
- `api.showInfoDialog(msg)` - show info dialog
- `api.showConfirmDialog(msg)` - show confirm dialog (returns boolean)
- `api.showPromptDialog(msg)` - show prompt dialog (returns user input)

### Links
- `api.createLink(notePath, { title?, showTooltip?, showNoteIcon? })` - create jQuery link element

### Backend integration
- `api.runOnBackend(func, params)` - execute a function on the backend (sync)

### Protection
- `api.protectNote(noteId, protect)` - protect/unprotect note
- `api.protectSubTree(noteId, protect)` - protect/unprotect subtree

### UI interaction
- `api.triggerCommand(name, data)` - trigger a command
- `api.triggerEvent(name, data)` - trigger an event
- `api.bindGlobalShortcut(shortcut, handler, namespace?)` - add keyboard shortcut

### Utilities
- `api.formatDateISO(date)` - format as YYYY-MM-DD
- `api.randomString(length)` - generate random string
- `api.dayjs` - day.js library
- `api.log(message)` - log to script log pane

### Widget base classes
- `api.BasicWidget` - base widget class
- `api.NoteContextAwareWidget` - widget aware of note context changes
- `api.RightPanelWidget` - right sidebar widget

## FNote object

Available via `api.getNote()`, `api.getActiveContextNote()`, etc.

### Properties
- `note.noteId`, `note.title`, `note.type`, `note.mime`
- `note.isProtected`, `note.isArchived`

### Content
- `note.getContent()` - get note content
- `note.getJsonContent()` - parse content as JSON

### Hierarchy
- `note.getParentNotes()` / `note.getChildNotes()`
- `note.hasChildren()`, `note.getSubtreeNoteIds()`

### Attributes
- `note.getAttributes(type?, name?)` - get all attributes (including inherited)
- `note.getOwnedAttributes(type?, name?)` - get only owned attributes
- `note.hasAttribute(type, name)` - check for attribute

## Custom widgets (legacy jQuery)

```javascript
class MyWidget extends api.BasicWidget {
    get position() { return 1; }
    get parentWidget() { return "center-pane"; }

    doRender() {
        this.$widget = $("<div>");
        this.$widget.append($("<button>Click me</button>")
            .on("click", () => api.showMessage("Hello!")));
        return this.$widget;
    }
}

module.exports = new MyWidget();
```

### Widget locations (`parentWidget` values)
- `left-pane` - alongside the note tree
- `center-pane` - in the content area, spanning all splits
- `note-detail-pane` - inside a note (split-aware, export class not instance, use static parentWidget)
- `right-pane` - in the right sidebar (use `RightPanelWidget`)

### Note context aware widget

```javascript
class MyWidget extends api.NoteContextAwareWidget {
    static get parentWidget() { return "note-detail-pane"; }
    get position() { return 100; }

    doRender() {
        this.$widget = $("<div>");
        return this.$widget;
    }

    async refreshWithNote(note) {
        // Called when the active note changes
        this.$widget.text(`Current note: ${note.title}`);
    }
}

module.exports = MyWidget; // Export class, not instance!
```

## Custom widgets (Preact JSX)

Requires JSX language enabled in Options -> Code Notes.

```jsx
import { defineWidget } from "trilium:preact";
import { useState } from "trilium:preact";

export default defineWidget({
    parent: "center-pane",
    position: 10,
    render: () => {
        const [count, setCount] = useState(0);
        return (
            <div>
                <button onClick={() => setCount(c => c + 1)}>
                    Clicked {count} times
                </button>
            </div>
        );
    }
});
```

### Preact imports
- `import { showMessage, getNote, ... } from "trilium:api"` - API methods
- `import { useState, useEffect, ... } from "trilium:preact"` - hooks
- `import { defineWidget, defineLauncherWidget } from "trilium:preact"` - widget helpers
- Built-in components: Button, ActionButton, Modal, NoteAutocomplete, FormTextBox, FormToggle, etc.

## Example: launcher button

```javascript
// Set #run=frontendStartup
api.createOrUpdateLauncher({
    id: "my-task-button",
    type: "customWidget",
    title: "New Task",
    icon: "bx bx-task",
    action: async () => {
        const todayNote = await api.getTodayNote();
        await api.runOnBackend(async (parentNoteId) => {
            api.createTextNote(parentNoteId, "New Task", "");
        }, [todayNote.noteId]);
    }
});
```

## Module system

Child notes of a script act as modules. For JS frontend, use `module.exports` and function parameters. For JSX, use `import`/`export` syntax.
