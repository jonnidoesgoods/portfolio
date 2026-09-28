# Layout Editor

Layout Editor is a project-independent visual editing layer for existing HTML pages. It does not require a framework and it does not rewrite the site's source files while editing. Changes are stored per project in the browser and can be exported as a portable JSON/CSS snapshot.

## Files

- `design-editor.js` — generic editor engine.
- `design-editor.css` — generic application interface.
- `editor-config.js` — project adapter for The Denim Brief.

Only the configuration file should normally change between projects.

## Minimal integration

Load the project configuration before the engine:

```html
<link rel="stylesheet" href="design-editor.css">
<script src="editor-config.js"></script>
<script src="design-editor.js"></script>
```

To keep the production preview clean, load these assets only behind a development URL or a query parameter such as `?editor=1`.

## Configuration

```js
window.LayoutEditorConfig = {
  projectId: 'project-slug',
  projectName: 'Project name',
  editorName: 'LAYOUT EDITOR',
  exportFilename: 'project-layout.json',
  snapThreshold: 7,
  rootSelectors: ['[data-editor-root]', 'main section', 'main'],
  rootLabelSelectors: ['[data-editor-root-label]', 'h2'],
  editableSelectors: [
    '[data-editor-element]',
    'main h1', 'main h2', 'main p', 'main img',
    '[data-editor-block]'
  ]
};
```

For stable integrations, prefer editor-specific data attributes:

- `data-editor-root` defines the coordinate reference section.
- `data-editor-root-label` supplies its label in the breadcrumb.
- `data-editor-element` makes an element selectable.
- `data-editor-block` marks a composite visual block.
- `data-editor-label="Name"` gives an explicit human-readable label.

## Public API

The engine exposes `window.LayoutEditor` after `layouteditor:ready`:

```js
LayoutEditor.open();
LayoutEditor.close();
LayoutEditor.toggle();
LayoutEditor.export();
LayoutEditor.getDocument();
```

## Interaction model

- `V` selection and movement.
- `T` direct text editing.
- `I` image crop/focal point.
- `C` annotations.
- `H` hand/pan.
- `L` layers.
- Arrow keys move by 1 px; Shift + Arrow moves by 10 px.
- Hold Alt while moving or resizing to bypass snapping.
- Hold Shift while resizing a corner to preserve aspect ratio.
- Command/Ctrl + Z and Command/Ctrl + Shift + Z control history.

Guides, baselines and spacing measurements appear only during movement or resizing. No persistent layout grid is imposed on the project.

## Persistence and snapshots

Every project receives its own storage key. Exported snapshots contain:

- element-specific CSS declarations;
- edited text content;
- project metadata;
- annotations and their state.

`IMPORTA` restores a compatible snapshot. The importer accepts either the full exported payload or the nested `document` object.

## Design boundary

The editor controls layout, typography, imagery and review notes. Project-specific motion and scroll choreography remain in the site's own animation code.
