/* Project adapter for Layout Editor.
   Copy this file and change only the configuration when using the editor elsewhere. */
window.LayoutEditorConfig = {
  projectId: location.pathname.split('/').pop().replace('.html', ''),
  projectName: document.title.split(' — ')[0],
  editorName: 'LAYOUT EDITOR',
  exportFilename: location.pathname.split('/').pop().replace('.html', '-layout.json'),
  storageKey: `portfolio-v16:${location.pathname}`,
  snapThreshold: 7,
  rootSelectors: ['.research-page','.story-content','.case-hero','main'],
  rootLabelSelectors: ['[data-editor-root-label]','.research-kicker','.research-copy > span','.story-eyebrow','h1','h2'],
  editableSelectors: [
    '[data-editor-element]', '[data-editor-block]', '.portfolio-module', '.portfolio-media', 'main img', '.section-footer span',
    '.case-hero h1','.case-hero p','.case-fields',
    '.story-content .story-eyebrow','.story-content h2','.story-content h3','.story-content p','.story-content strong',
    '.overview-main','.story-meta','.problem-dashboard','.metric-column',
    '.issue-solution-grid','.issue-solution-card','.research-copy','.research-art','.research-art img',
    '.system-title-row','.system-backbone','.pillar-grid','.pillar-card','.pillar-card img',
    '.strategy-layout','.strategy-pipeline','.strategy-proof','.strategy-proof img',
    '.selected-content figure','.selected-content img','.selected-content figcaption',
    '.impact-grid','.reflection-content > p'
  ]
};
