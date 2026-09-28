(() => {
  const VERSION = 3;
  const suppliedConfig = window.LayoutEditorConfig || {};
  const pageId = location.pathname.split('/').filter(Boolean).pop()?.replace(/\.[^.]+$/,'') || 'page';
  const CONFIG = {
    projectId: suppliedConfig.projectId || pageId,
    projectName: suppliedConfig.projectName || document.title || pageId,
    editorName: suppliedConfig.editorName || 'LAYOUT EDITOR',
    exportFilename: suppliedConfig.exportFilename || `${pageId}-layout-editor.json`,
    storageKey: suppliedConfig.storageKey || `layoutEditor:${suppliedConfig.projectId || pageId}:v${VERSION}`,
    snapThreshold: Number.isFinite(suppliedConfig.snapThreshold) ? suppliedConfig.snapThreshold : 7,
    editableSelectors: suppliedConfig.editableSelectors || [
      '[data-editor-element]','main h1','main h2','main h3','main p','main strong',
      'main img','main figure','main figcaption','main [data-editor-block]'
    ],
    rootSelectors: suppliedConfig.rootSelectors || ['[data-editor-root]','main section','main'],
    rootLabelSelectors: suppliedConfig.rootLabelSelectors || ['[data-editor-root-label]','[data-editor-label]','h1','h2'],
    textSelectors: suppliedConfig.textSelectors || ['h1','h2','h3','h4','h5','h6','p','strong','figcaption','blockquote','li'],
    imageSelectors: suppliedConfig.imageSelectors || ['img']
  };
  const STORAGE_KEY = CONFIG.storageKey;
  const SNAP = CONFIG.snapThreshold;
  const STYLE_PROPS = [
    'translate','width','height','fontFamily','fontSize','fontWeight','lineHeight',
    'letterSpacing','textAlign','color','opacity','borderRadius','objectFit','objectPosition'
  ];
  const EDITABLE_SELECTOR = CONFIG.editableSelectors.join(',');
  const ROOT_SELECTOR = CONFIG.rootSelectors.join(',');
  const TEXT_SELECTOR = CONFIG.textSelectors.join(',');
  const IMAGE_SELECTOR = CONFIG.imageSelectors.join(',');

  const icons = {
    undo:'<svg viewBox="0 0 24 24"><path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></svg>',
    redo:'<svg viewBox="0 0 24 24"><path d="m15 7 5 5-5 5"/><path d="M19 12h-8a6 6 0 0 0-6 6"/></svg>',
    pointer:'<svg viewBox="0 0 24 24"><path d="m5 3 13 9-6 1-3 6z"/></svg>',
    text:'<svg viewBox="0 0 24 24"><path d="M5 5h14M12 5v14M8 19h8"/></svg>',
    crop:'<svg viewBox="0 0 24 24"><path d="M7 3v14h14M3 7h14v14"/></svg>',
    comment:'<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    hand:'<svg viewBox="0 0 24 24"><path d="M7 12V7a2 2 0 0 1 4 0v4-6a2 2 0 0 1 4 0v6-4a2 2 0 0 1 4 0v8c0 4-3 6-7 6-3 0-5-2-7-5l-2-3a2 2 0 0 1 4-1z"/></svg>',
    layers:'<svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>',
    zoomIn:'<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6M10 7v6"/></svg>',
    zoomOut:'<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6"/></svg>',
    eye:'<svg viewBox="0 0 24 24"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>'
  };

  let enabled = false;
  let tool = 'select';
  let selected = null;
  let interaction = null;
  let pendingComment = null;
  let activeCommentId = null;
  let zoom = 1;
  let saveTimer = 0;
  let doc = loadDocument();
  let history = [];
  let historyIndex = -1;
  const originals = new Map();

  function loadDocument() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (value?.version === VERSION || value?.version === 2) return {...value,version:VERSION};
    } catch (_) {}
    return {version:VERSION,elements:{},comments:[]};
  }

  function cssPath(element) {
    const parts = [];
    let node = element;
    while (node && node !== document.body) {
      const parent = node.parentElement;
      const siblings = parent ? [...parent.children].filter(item => item.tagName === node.tagName) : [];
      const nth = Math.max(0,siblings.indexOf(node)) + 1;
      const classes = [...node.classList]
        .filter(name => !name.startsWith('ve-') && !name.startsWith('design-'))
        .slice(0,3).map(name => `.${name}`).join('');
      parts.unshift(`${node.tagName.toLowerCase()}${classes}:nth-of-type(${nth})`);
      if (node.matches(ROOT_SELECTOR)) break;
      node = parent;
    }
    return parts.join(' > ');
  }

  function keyFor(element) {
    if (!element.dataset.veKey) element.dataset.veKey = cssPath(element);
    return element.dataset.veKey;
  }

  function allEditable() {
    return [...document.querySelectorAll(EDITABLE_SELECTOR)];
  }

  function prepareEditable() {
    allEditable().forEach(element => {
      element.dataset.veEditable = '';
      const key = keyFor(element);
      if (!originals.has(key)) {
        const styles = {};
        STYLE_PROPS.forEach(prop => styles[prop] = element.style[prop] || '');
        originals.set(key,{styles,html:element.innerHTML});
      }
    });
  }

  function rootFor(element) {
    return element?.closest(ROOT_SELECTOR) || document.querySelector('main') || document.body;
  }

  function rootLabel(root) {
    if (!root) return 'PAGE';
    const explicit = root.dataset.editorLabel;
    const labelNode = CONFIG.rootLabelSelectors.map(selector => root.querySelector(selector)).find(Boolean);
    const fallback = root.id || root.getAttribute('aria-label') || root.tagName;
    return (explicit || labelNode?.textContent || fallback || 'PAGE').trim().replace(/\s+/g,' ').slice(0,80);
  }

  function elementLabel(element) {
    if (!element) return 'NESSUNA SELEZIONE';
    if (element.matches('img')) return element.alt || 'IMMAGINE';
    const text = element.textContent.trim().replace(/\s+/g,' ');
    return text ? text.slice(0,48) : element.tagName;
  }

  function parseTranslate(element) {
    const value = element.style.translate || '';
    if (!value || value === 'none') return {x:0,y:0};
    const parts = value.split(/\s+/).map(parseFloat);
    return {x:Number.isFinite(parts[0]) ? parts[0] : 0,y:Number.isFinite(parts[1]) ? parts[1] : 0};
  }

  function localMetrics(element) {
    const root = rootFor(element);
    const rect = element.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const scale = zoom || 1;
    const x = (rect.left - rootRect.left) / scale;
    const y = (rect.top - rootRect.top) / scale;
    const width = rect.width / scale;
    const height = rect.height / scale;
    return {
      root,rect,rootRect,x,y,width,height,
      xPct:rootRect.width ? (rect.left-rootRect.left)/rootRect.width*100 : 0,
      yPct:rootRect.height ? (rect.top-rootRect.top)/rootRect.height*100 : 0,
      wPct:rootRect.width ? rect.width/rootRect.width*100 : 0,
      hPct:rootRect.height ? rect.height/rootRect.height*100 : 0
    };
  }

  function restoreElement(element) {
    const original = originals.get(keyFor(element));
    if (!original) return;
    STYLE_PROPS.forEach(prop => element.style[prop] = original.styles[prop]);
    if (element.matches(TEXT_SELECTOR)) element.innerHTML = original.html;
  }

  function applyRecord(element,record) {
    if (!record) return;
    Object.entries(record.styles || {}).forEach(([prop,value]) => {
      if (STYLE_PROPS.includes(prop)) element.style[prop] = value;
    });
    if (record.html !== undefined && element.matches(TEXT_SELECTOR)) element.innerHTML = record.html;
  }

  function applyDocument() {
    prepareEditable();
    allEditable().forEach(element => {
      restoreElement(element);
      applyRecord(element,doc.elements[keyFor(element)]);
    });
    renderComments();
    select(selected && document.contains(selected) ? selected : null);
  }

  function normalizedStyle(prop,value) {
    if (prop === 'translate' && value) {
      const parts = String(value).split(/\s+/).map(parseFloat);
      if (parts.every(part => Number.isFinite(part) && Math.abs(part) < .01)) return '';
    }
    return value || '';
  }

  function sanitizeDocument() {
    let changed = false;
    Object.entries(doc.elements || {}).forEach(([key,record]) => {
      const original = originals.get(key);
      if (!original) return;
      const styles = {};
      Object.entries(record.styles || {}).forEach(([prop,value]) => {
        const clean = normalizedStyle(prop,value);
        if (clean !== normalizedStyle(prop,original.styles[prop])) styles[prop] = clean;
        else changed = true;
      });
      const htmlChanged = record.html !== undefined && record.html !== original.html;
      if (!Object.keys(styles).length && !htmlChanged) {
        delete doc.elements[key];changed = true;return;
      }
      const next = {styles};
      if (htmlChanged) next.html = record.html;
      if (JSON.stringify(next) !== JSON.stringify(record)) changed = true;
      doc.elements[key] = next;
    });
    return changed;
  }

  function recordElement(element) {
    if (!element) return;
    const key = keyFor(element);
    const original = originals.get(key);
    const styles = {};
    STYLE_PROPS.forEach(prop => {
      const value = normalizedStyle(prop,element.style[prop]);
      if (value !== normalizedStyle(prop,original?.styles[prop])) styles[prop] = value;
    });
    const record = {styles};
    if (element.matches(TEXT_SELECTOR) && element.innerHTML !== original?.html) record.html = element.innerHTML;
    if (!Object.keys(styles).length && record.html === undefined) delete doc.elements[key];
    else doc.elements[key] = record;
  }

  function saveNow() {
    localStorage.setItem(STORAGE_KEY,JSON.stringify(doc));
    saveState.textContent = 'SALVATO';
    saveState.classList.remove('is-saving');
  }

  function scheduleSave() {
    saveState.textContent = 'SALVATAGGIO…';
    saveState.classList.add('is-saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow,180);
  }

  function snapshot() { return JSON.stringify(doc); }
  function commitHistory() {
    const value = snapshot();
    if (history[historyIndex] === value) { scheduleSave(); return; }
    history = history.slice(0,historyIndex+1);
    history.push(value);
    if (history.length > 60) history.shift();
    historyIndex = history.length-1;
    updateHistoryButtons();
    scheduleSave();
  }
  function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    doc = JSON.parse(history[historyIndex]);
    applyDocument();updateHistoryButtons();scheduleSave();
  }
  function redo() {
    if (historyIndex >= history.length-1) return;
    historyIndex++;
    doc = JSON.parse(history[historyIndex]);
    applyDocument();updateHistoryButtons();scheduleSave();
  }

  function markup() {
    const app = document.createElement('div');
    app.className = 've-app';
    app.innerHTML = `
      <div class="ve-topbar">
        <div class="ve-brand"><i></i>${escapeHtml(CONFIG.editorName)}</div>
        <button class="ve-icon-button" data-action="undo" title="Annulla" aria-label="Annulla">${icons.undo}</button>
        <button class="ve-icon-button" data-action="redo" title="Ripeti" aria-label="Ripeti">${icons.redo}</button>
        <div class="ve-top-separator"></div>
        <div class="ve-breadcrumb"><span>PAGE</span></div>
        <span class="ve-canvas-readout">DESKTOP · 100%</span>
        <span class="ve-save-state">SALVATO</span>
        <button class="ve-icon-button" data-action="toggle-comments" title="Mostra/nascondi annotazioni" aria-label="Mostra o nascondi annotazioni">${icons.eye}</button>
        <button class="ve-icon-button" data-action="import" aria-label="Importa snapshot">IMPORTA</button>
        <button class="ve-icon-button" data-action="export" aria-label="Esporta modifiche">ESPORTA</button>
        <button class="ve-icon-button ve-close" data-action="close" aria-label="Chiudi editor">CHIUDI</button>
      </div>
      <nav class="ve-tools" aria-label="Strumenti editor">
        <button class="ve-tool is-active" data-tool="select" data-tip="Selezione (V)" aria-label="Selezione">${icons.pointer}</button>
        <button class="ve-tool" data-tool="text" data-tip="Testo (T)" aria-label="Testo">${icons.text}</button>
        <button class="ve-tool" data-tool="crop" data-tip="Ritaglio immagine (I)" aria-label="Ritaglio immagine">${icons.crop}</button>
        <button class="ve-tool" data-tool="comment" data-tip="Annotazione (C)" aria-label="Annotazione">${icons.comment}</button>
        <button class="ve-tool" data-tool="hand" data-tip="Mano (H)" aria-label="Mano">${icons.hand}</button>
        <div class="ve-tool-rule"></div>
        <button class="ve-tool" data-action="layers" data-tip="Livelli (L)" aria-label="Livelli">${icons.layers}</button>
        <div class="ve-tool-spacer"></div>
        <button class="ve-tool" data-action="zoom-in" data-tip="Ingrandisci" aria-label="Ingrandisci">${icons.zoomIn}</button>
        <span class="ve-zoom-value">100%</span>
        <button class="ve-tool" data-action="zoom-out" data-tip="Riduci" aria-label="Riduci">${icons.zoomOut}</button>
      </nav>
      <aside class="ve-layers">
        <header class="ve-panel-title"><span>LIVELLI</span><button class="ve-mini-button" data-action="layers">×</button></header>
        <div class="ve-layer-list"></div>
      </aside>
      <aside class="ve-inspector">
        <header class="ve-inspector-head"><small>PROPRIETÀ</small><strong>NESSUNA SELEZIONE</strong><span>Clicca un elemento sul sito</span></header>
        <div class="ve-empty">Seleziona un testo, un’immagine o un blocco. Le coordinate saranno riferite alla sezione corrente.</div>
        <section class="ve-section ve-transform-section" hidden>
          <button type="button">TRASFORMA</button><div class="ve-section-body">
            <div class="ve-coordinates">
              <div class="ve-coordinate"><label>X</label><span class="ve-unit-input"><input data-metric="x" type="number" step="1"><em>PX</em></span></div>
              <div class="ve-coordinate"><label>Y</label><span class="ve-unit-input"><input data-metric="y" type="number" step="1"><em>PX</em></span></div>
              <div class="ve-coordinate"><label>W</label><span class="ve-unit-input"><input data-metric="width" type="number" min="1" step="1"><em>PX</em></span></div>
              <div class="ve-coordinate"><label>H</label><span class="ve-unit-input"><input data-metric="height" type="number" min="1" step="1"><em>PX</em></span></div>
            </div>
            <div class="ve-ref"></div>
          </div>
        </section>
        <section class="ve-section ve-type-section" hidden>
          <button type="button">TIPOGRAFIA</button><div class="ve-section-body">
            <div class="ve-field"><label>Carattere</label><select data-style="fontFamily"><option value="">Ereditato</option><option value="'Atkinson Hyperlegible', Arial, sans-serif">Atkinson</option><option value="Georgia, serif">Georgia</option><option value="Arial, sans-serif">Arial</option><option value="'Arial Narrow', Arial, sans-serif">Arial Narrow</option></select></div>
            <div class="ve-field-pair">
              <span class="ve-unit-input"><input data-style="fontSize" type="number" min="6" max="220" step="1"><em>PX</em></span>
              <select data-style="fontWeight"><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra</option></select>
            </div>
            <div class="ve-field-pair" style="margin-top:7px">
              <span class="ve-unit-input"><input data-style="lineHeight" type="number" min=".5" max="3" step=".01"><em>LH</em></span>
              <span class="ve-unit-input"><input data-style="letterSpacing" type="number" min="-40" max="40" step=".1"><em>PX</em></span>
            </div>
            <div class="ve-segment" data-align style="margin-top:8px"><button data-value="left">SX</button><button data-value="center">C</button><button data-value="right">DX</button><button data-value="justify">GIUST.</button></div>
            <div class="ve-field"><label>Colore</label><input data-style="color" type="color"></div>
            <button class="ve-mini-button" data-action="edit-text" style="width:100%">MODIFICA TESTO</button>
          </div>
        </section>
        <section class="ve-section ve-image-section" hidden>
          <button type="button">IMMAGINE</button><div class="ve-section-body">
            <div class="ve-field"><label>Adatta</label><select data-style="objectFit"><option value="cover">Riempi</option><option value="contain">Adatta</option><option value="fill">Distendi</option><option value="none">Dimensione reale</option></select></div>
            <div class="ve-field"><label>Fuoco X</label><input data-image="x" type="range" min="0" max="100" step="1"></div>
            <div class="ve-field"><label>Fuoco Y</label><input data-image="y" type="range" min="0" max="100" step="1"></div>
            <button class="ve-mini-button" data-tool="crop" style="width:100%">RITAGLIA SUL CANVAS</button>
          </div>
        </section>
        <section class="ve-section ve-appearance-section" hidden>
          <button type="button">ASPETTO</button><div class="ve-section-body">
            <div class="ve-field"><label>Opacità</label><input data-style="opacity" type="range" min="0" max="1" step=".01"></div>
            <div class="ve-field"><label>Raggio</label><span class="ve-unit-input"><input data-style="borderRadius" type="number" min="0" max="300" step="1"><em>PX</em></span></div>
          </div>
        </section>
        <section class="ve-section ve-comments-section">
          <button type="button">ANNOTAZIONI</button><div class="ve-section-body"><div class="ve-comments-list"></div></div>
        </section>
        <div class="ve-actions"><button class="ve-mini-button" data-action="reset-selected">RESET ELEMENTO</button><button class="ve-mini-button ve-danger" data-action="reset-all">RESET TUTTO</button></div>
      </aside>
      <div class="ve-selection"><span class="ve-selection-label"></span>${['nw','n','ne','e','se','s','sw','w'].map(handle=>`<i class="ve-handle" data-handle="${handle}"></i>`).join('')}</div>
      <div class="ve-smart-layer">
        <i class="ve-guide ve-guide-x"><span>ALLINEATO</span></i><i class="ve-guide ve-guide-y"><span>ALLINEATO</span></i>
        <i class="ve-measure ve-measure-x"><span>0 PX</span></i><i class="ve-measure ve-measure-y"><span>0 PX</span></i>
      </div>
      <div class="ve-drag-readout"></div><div class="ve-comment-layer"></div>
      <div class="ve-comment-popover"><textarea placeholder="Scrivi un’annotazione…"></textarea><div><button class="ve-mini-button" data-action="cancel-comment">ANNULLA</button><button class="ve-mini-button ve-primary" data-action="save-comment">SALVA</button></div></div>
      <div class="ve-scrim" data-action="close-export"></div>
      <input class="ve-import-input" type="file" accept="application/json,.json" hidden>
      <div class="ve-toast" role="status" aria-live="polite"></div>
      <div class="ve-export-dialog"><header><span>SNAPSHOT MODIFICHE</span><button class="ve-mini-button" data-action="close-export">×</button></header><textarea readonly></textarea><footer><button class="ve-mini-button" data-action="copy-export">COPIA</button><button class="ve-mini-button ve-primary" data-action="download-export">SCARICA JSON</button></footer></div>`;
    document.body.appendChild(app);

    const launch = document.createElement('button');
    launch.className = 've-launch';launch.type = 'button';launch.textContent = 'DESIGN MODE';
    document.body.appendChild(launch);
    return {app,launch};
  }

  const {app,launch} = markup();
  const topbar = app.querySelector('.ve-topbar');
  const inspector = app.querySelector('.ve-inspector');
  const inspectorHead = app.querySelector('.ve-inspector-head');
  const empty = app.querySelector('.ve-empty');
  const transformSection = app.querySelector('.ve-transform-section');
  const typeSection = app.querySelector('.ve-type-section');
  const imageSection = app.querySelector('.ve-image-section');
  const appearanceSection = app.querySelector('.ve-appearance-section');
  const selectionBox = app.querySelector('.ve-selection');
  const selectionLabel = app.querySelector('.ve-selection-label');
  const breadcrumb = app.querySelector('.ve-breadcrumb');
  const canvasReadout = app.querySelector('.ve-canvas-readout');
  const saveState = app.querySelector('.ve-save-state');
  const layerList = app.querySelector('.ve-layer-list');
  const commentLayer = app.querySelector('.ve-comment-layer');
  const commentPopover = app.querySelector('.ve-comment-popover');
  const commentsList = app.querySelector('.ve-comments-list');
  const guideX = app.querySelector('.ve-guide-x');
  const guideY = app.querySelector('.ve-guide-y');
  const measureX = app.querySelector('.ve-measure-x');
  const measureY = app.querySelector('.ve-measure-y');
  const dragReadout = app.querySelector('.ve-drag-readout');
  const exportDialog = app.querySelector('.ve-export-dialog');
  const exportTextarea = exportDialog.querySelector('textarea');
  const importInput = app.querySelector('.ve-import-input');
  const toast = app.querySelector('.ve-toast');
  const scrim = app.querySelector('.ve-scrim');
  const undoButton = app.querySelector('[data-action="undo"]');
  const redoButton = app.querySelector('[data-action="redo"]');

  function updateHistoryButtons() {
    undoButton.disabled = historyIndex <= 0;
    redoButton.disabled = historyIndex >= history.length-1;
  }

  function activate(force) {
    enabled = typeof force === 'boolean' ? force : !enabled;
    document.body.classList.toggle('ve-active',enabled);
    if (enabled) {
      prepareEditable();sanitizeDocument();applyDocument();setTool('select');
      history = [snapshot()];historyIndex = 0;updateHistoryButtons();
    } else {
      exitTextEdit();select(null);hideGuides();closeCommentPopover();setZoom(1,false);
      document.body.classList.remove('ve-show-layers','ve-hide-comments');
    }
  }

  function setTool(next) {
    tool = next;
    document.body.classList.remove('ve-tool-select','ve-tool-text','ve-tool-crop','ve-tool-comment','ve-tool-hand');
    document.body.classList.add(`ve-tool-${tool}`);
    app.querySelectorAll('[data-tool]').forEach(button => button.classList.toggle('is-active',button.dataset.tool === tool));
    if (tool !== 'text') exitTextEdit();
  }

  function select(element) {
    if (selected?.isContentEditable && selected !== element) exitTextEdit();
    selected = element || null;
    document.body.classList.toggle('ve-has-selection',!!selected);
    allEditable().forEach(item => item.toggleAttribute('data-ve-selected',item === selected));
    empty.hidden = !!selected;
    transformSection.hidden = !selected;
    appearanceSection.hidden = !selected;
    typeSection.hidden = !selected || !selected.matches(TEXT_SELECTOR);
    imageSection.hidden = !selected || !selected.matches(IMAGE_SELECTOR);
    updateInspector();updateLayers();updateSelectionBox();
  }

  function updateInspector() {
    if (!selected) {
      inspectorHead.querySelector('strong').textContent = 'NESSUNA SELEZIONE';
      inspectorHead.querySelector('span').textContent = 'Clicca un elemento sul sito';
      breadcrumb.innerHTML = '<span>PAGE</span>';
      return;
    }
    const metrics = localMetrics(selected);
    const style = getComputedStyle(selected);
    const label = elementLabel(selected);
    inspectorHead.querySelector('strong').textContent = label.toUpperCase();
    inspectorHead.querySelector('span').textContent = `${selected.tagName.toLowerCase()} · ${Math.round(metrics.width)} × ${Math.round(metrics.height)} px`;
    breadcrumb.innerHTML = `<span>${rootLabel(metrics.root)}</span><b>›</b><span>${label}</span>`;
    app.querySelectorAll('[data-metric]').forEach(input => input.value = Math.round(metrics[input.dataset.metric]*100)/100);
    app.querySelector('.ve-ref').innerHTML = `RIFERIMENTO: <b>${rootLabel(metrics.root)}</b><br>X ${metrics.xPct.toFixed(1)}% · Y ${metrics.yPct.toFixed(1)}% · W ${metrics.wPct.toFixed(1)}% · H ${metrics.hPct.toFixed(1)}%`;
    if (selected.matches(TEXT_SELECTOR)) {
      setField('fontFamily',selected.style.fontFamily || '');
      setField('fontSize',cleanNumber(parseFloat(style.fontSize)));
      setField('fontWeight',style.fontWeight);
      setField('lineHeight',style.lineHeight === 'normal' ? 1.2 : cleanNumber(parseFloat(style.lineHeight)/parseFloat(style.fontSize)));
      setField('letterSpacing',style.letterSpacing === 'normal' ? 0 : cleanNumber(parseFloat(style.letterSpacing)));
      setField('color',rgbToHex(style.color));
      app.querySelectorAll('[data-align] button').forEach(button => button.classList.toggle('is-active',button.dataset.value === style.textAlign));
    }
    if (selected.matches(IMAGE_SELECTOR)) {
      setField('objectFit',style.objectFit || 'cover');
      const [x,y] = parseObjectPosition(style.objectPosition);
      app.querySelector('[data-image="x"]').value = x;
      app.querySelector('[data-image="y"]').value = y;
    }
    setField('opacity',cleanNumber(parseFloat(style.opacity) || 1));
    setField('borderRadius',cleanNumber(parseFloat(style.borderRadius) || 0));
  }

  function cleanNumber(value,precision=2) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }

  function setField(name,value) {
    const field = app.querySelector(`[data-style="${name}"]`);
    if (!field || value === undefined || Number.isNaN(value)) return;
    if (field.tagName === 'SELECT' && ![...field.options].some(option => option.value === String(value))) {
      field.value = '';
    } else field.value = value;
  }

  function rgbToHex(value) {
    const match = value?.match(/\d+/g);
    if (!match || match.length < 3) return '#173b63';
    return `#${match.slice(0,3).map(number => Number(number).toString(16).padStart(2,'0')).join('')}`;
  }

  function parseObjectPosition(value) {
    const parts = (value || '50% 50%').split(/\s+/);
    const parse = part => part === 'left' || part === 'top' ? 0 : part === 'right' || part === 'bottom' ? 100 : part === 'center' ? 50 : parseFloat(part) || 50;
    return [parse(parts[0]),parse(parts[1] || parts[0])];
  }

  function updateSelectionBox() {
    if (!enabled || !selected || !document.contains(selected)) return;
    const rect = selected.getBoundingClientRect();
    selectionBox.style.left = `${rect.left}px`;selectionBox.style.top = `${rect.top}px`;
    selectionBox.style.width = `${rect.width}px`;selectionBox.style.height = `${rect.height}px`;
    selectionLabel.textContent = `${elementLabel(selected)} · ${Math.round(rect.width/zoom)}×${Math.round(rect.height/zoom)}`;
  }

  function updateLayers() {
    const root = selected ? rootFor(selected) : visibleStoryRoot();
    const elements = allEditable().filter(element => rootFor(element) === root && !element.closest('.ve-app'));
    layerList.innerHTML = elements.map(element => `<button class="ve-layer-item${element===selected?' is-active':''}" data-layer-key="${escapeAttr(keyFor(element))}"><i></i><span>${element.tagName.toLowerCase()} · ${escapeHtml(elementLabel(element))}</span></button>`).join('');
  }

  function visibleStoryRoot() {
    const candidates = [...document.querySelectorAll(ROOT_SELECTOR)];
    return candidates.find(element => {
      const rect = element.getBoundingClientRect();
      return rect.right > 80 && rect.left < window.innerWidth-80 && rect.bottom > 44 && rect.top < window.innerHeight;
    }) || candidates[0] || document.body;
  }

  function escapeHtml(value) { return String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char])); }
  function escapeAttr(value) { return escapeHtml(value); }

  function candidatesFor(element) {
    const root = rootFor(element);
    return allEditable().filter(other => {
      if (other === element || rootFor(other) !== root || element.contains(other) || other.contains(element)) return false;
      const rect = other.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 44 && rect.top < window.innerHeight;
    }).map(element => ({element,rect:element.getBoundingClientRect()}));
  }

  function bestSnap(rect,candidates,element) {
    let bestX = null,bestY = null;
    const ax = [rect.left,rect.left+rect.width/2,rect.right];
    const ay = [rect.top,rect.top+rect.height/2,rect.bottom];
    candidates.forEach(candidate => {
      const b = candidate.rect;
      const bx = [b.left,b.left+b.width/2,b.right];
      const by = [b.top,b.top+b.height/2,b.bottom];
      ax.forEach((value,index) => {
        const delta = bx[index]-value;
        if (Math.abs(delta) <= SNAP && (!bestX || Math.abs(delta)<Math.abs(bestX.delta))) bestX={delta,pos:bx[index],candidate,label:['LEFT','CENTER','RIGHT'][index]};
      });
      ay.forEach((value,index) => {
        const delta = by[index]-value;
        if (Math.abs(delta) <= SNAP && (!bestY || Math.abs(delta)<Math.abs(bestY.delta))) bestY={delta,pos:by[index],candidate,label:['TOP','CENTER','BOTTOM'][index]};
      });
      if (element.matches(TEXT_SELECTOR) && candidate.element.matches(TEXT_SELECTOR)) {
        const baseA = rect.top + parseFloat(getComputedStyle(element).fontSize)*.82*zoom;
        const baseB = b.top + parseFloat(getComputedStyle(candidate.element).fontSize)*.82*zoom;
        const delta = baseB-baseA;
        if (Math.abs(delta)<=SNAP && (!bestY || Math.abs(delta)<Math.abs(bestY.delta))) bestY={delta,pos:baseB,candidate,label:'BASELINE'};
      }
    });
    return {x:bestX,y:bestY};
  }

  function showGuides(rect,snap,candidates) {
    hideGuides();
    if (snap.x) {
      const other = snap.x.candidate.rect;
      const top = Math.min(rect.top,other.top),bottom=Math.max(rect.bottom,other.bottom);
      guideX.style.left=`${snap.x.pos}px`;guideX.style.top=`${top}px`;guideX.style.height=`${bottom-top}px`;
      guideX.querySelector('span').textContent=snap.x.label;guideX.classList.add('is-visible');
    }
    if (snap.y) {
      const other=snap.y.candidate.rect;
      const left=Math.min(rect.left,other.left),right=Math.max(rect.right,other.right);
      guideY.style.left=`${left}px`;guideY.style.top=`${snap.y.pos}px`;guideY.style.width=`${right-left}px`;
      guideY.querySelector('span').textContent=snap.y.label;guideY.classList.add('is-visible');
    }
    showMeasurements(rect,candidates);
  }

  function showMeasurements(rect,candidates) {
    let horizontal=null,vertical=null;
    candidates.forEach(candidate => {
      const b=candidate.rect;
      const overlapsY=b.bottom>=rect.top && b.top<=rect.bottom;
      const overlapsX=b.right>=rect.left && b.left<=rect.right;
      if (overlapsY) {
        let from,to;
        if (b.right<=rect.left) {from=b.right;to=rect.left;}
        else if (rect.right<=b.left) {from=rect.right;to=b.left;}
        if (from!==undefined) {
          const gap=to-from;if (!horizontal || gap<horizontal.gap) horizontal={from,to,gap,y:Math.max(rect.top,Math.min(rect.bottom,b.top+b.height/2))};
        }
      }
      if (overlapsX) {
        let from,to;
        if (b.bottom<=rect.top) {from=b.bottom;to=rect.top;}
        else if (rect.bottom<=b.top) {from=rect.bottom;to=b.top;}
        if (from!==undefined) {
          const gap=to-from;if (!vertical || gap<vertical.gap) vertical={from,to,gap,x:Math.max(rect.left,Math.min(rect.right,b.left+b.width/2))};
        }
      }
    });
    if (horizontal && horizontal.gap<260) {
      measureX.style.left=`${horizontal.from}px`;measureX.style.top=`${horizontal.y}px`;measureX.style.width=`${horizontal.gap}px`;
      measureX.querySelector('span').textContent=`${Math.round(horizontal.gap/zoom)} PX`;measureX.classList.add('is-visible');
    }
    if (vertical && vertical.gap<260) {
      measureY.style.left=`${vertical.x}px`;measureY.style.top=`${vertical.from}px`;measureY.style.height=`${vertical.gap}px`;
      measureY.querySelector('span').textContent=`${Math.round(vertical.gap/zoom)} PX`;measureY.classList.add('is-visible');
    }
  }

  function hideGuides() {
    [guideX,guideY,measureX,measureY].forEach(item => item.classList.remove('is-visible'));
  }

  function beginMove(event,target) {
    const baseRect=target.getBoundingClientRect();
    interaction={type:'move',pointerId:event.pointerId,target,startX:event.clientX,startY:event.clientY,baseRect,baseTranslate:parseTranslate(target),candidates:candidatesFor(target),moved:false};
    event.preventDefault();
  }

  function beginCrop(event,target) {
    const [x,y]=parseObjectPosition(getComputedStyle(target).objectPosition);
    interaction={type:'crop',pointerId:event.pointerId,target,startX:event.clientX,startY:event.clientY,baseX:x,baseY:y,rect:target.getBoundingClientRect(),moved:false};
    event.preventDefault();
  }

  function beginHand(event) {
    interaction={type:'hand',pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,scrollX:window.scrollX,scrollY:window.scrollY,moved:false};event.preventDefault();
  }

  function beginResize(event,handle) {
    if (!selected) return;
    const rect=selected.getBoundingClientRect();
    interaction={type:'resize',pointerId:event.pointerId,target:selected,handle,startX:event.clientX,startY:event.clientY,baseRect:rect,baseWidth:rect.width/zoom,baseHeight:rect.height/zoom,baseTranslate:parseTranslate(selected),ratio:rect.width/rect.height,candidates:candidatesFor(selected),moved:false};
    event.preventDefault();event.stopPropagation();
  }

  function moveInteraction(event) {
    if (!interaction || interaction.pointerId!==event.pointerId) return;
    const dx=event.clientX-interaction.startX,dy=event.clientY-interaction.startY;
    if (!interaction.moved && Math.hypot(dx,dy)<2) return;
    interaction.moved=true;document.body.classList.add('ve-dragging');
    if (interaction.type==='move') {
      const proposed={left:interaction.baseRect.left+dx,top:interaction.baseRect.top+dy,width:interaction.baseRect.width,height:interaction.baseRect.height};
      proposed.right=proposed.left+proposed.width;proposed.bottom=proposed.top+proposed.height;
      const snap=event.altKey?{x:null,y:null}:bestSnap(proposed,interaction.candidates,interaction.target);
      if (snap.x) {proposed.left+=snap.x.delta;proposed.right+=snap.x.delta;}
      if (snap.y) {proposed.top+=snap.y.delta;proposed.bottom+=snap.y.delta;}
      const tx=interaction.baseTranslate.x+(proposed.left-interaction.baseRect.left)/zoom;
      const ty=interaction.baseTranslate.y+(proposed.top-interaction.baseRect.top)/zoom;
      interaction.target.style.translate=`${Math.round(tx*100)/100}px ${Math.round(ty*100)/100}px`;
      showGuides(proposed,snap,interaction.candidates);showDragReadout(event,`X ${Math.round(localMetrics(interaction.target).x)} · Y ${Math.round(localMetrics(interaction.target).y)}`);
    } else if (interaction.type==='crop') {
      const x=Math.max(0,Math.min(100,interaction.baseX+dx/interaction.rect.width*100));
      const y=Math.max(0,Math.min(100,interaction.baseY+dy/interaction.rect.height*100));
      interaction.target.style.objectPosition=`${x.toFixed(1)}% ${y.toFixed(1)}%`;showDragReadout(event,`${x.toFixed(0)}% · ${y.toFixed(0)}%`);
    } else if (interaction.type==='hand') {
      window.scrollTo(interaction.scrollX-dx,interaction.scrollY-dy);
    } else if (interaction.type==='resize') resizeInteraction(event,dx,dy);
    updateSelectionBox();updateInspector();event.preventDefault();
  }

  function resizeInteraction(event,dxView,dyView) {
    const i=interaction,h=i.handle;let dx=dxView/zoom,dy=dyView/zoom;
    let width=i.baseWidth,height=i.baseHeight,tx=i.baseTranslate.x,ty=i.baseTranslate.y;
    if (h.includes('e')) width=Math.max(20,i.baseWidth+dx);
    if (h.includes('s')) height=Math.max(20,i.baseHeight+dy);
    if (h.includes('w')) {width=Math.max(20,i.baseWidth-dx);tx=i.baseTranslate.x+(i.baseWidth-width);}
    if (h.includes('n')) {height=Math.max(20,i.baseHeight-dy);ty=i.baseTranslate.y+(i.baseHeight-height);}
    if (event.shiftKey && /^(nw|ne|se|sw)$/.test(h)) {
      if (Math.abs(dx)>Math.abs(dy)) height=width/i.ratio;else width=height*i.ratio;
      if (h.includes('w')) tx=i.baseTranslate.x+(i.baseWidth-width);
      if (h.includes('n')) ty=i.baseTranslate.y+(i.baseHeight-height);
    }
    const proposed={left:i.baseRect.left+(tx-i.baseTranslate.x)*zoom,top:i.baseRect.top+(ty-i.baseTranslate.y)*zoom,width:width*zoom,height:height*zoom};
    proposed.right=proposed.left+proposed.width;proposed.bottom=proposed.top+proposed.height;
    const snap=event.altKey?{x:null,y:null}:bestSnap(proposed,i.candidates,i.target);
    if (snap.x) {
      if (h.includes('e')) width+=(snap.x.delta/zoom);
      else if (h.includes('w')) {width-=(snap.x.delta/zoom);tx+=(snap.x.delta/zoom);}
    }
    if (snap.y) {
      if (h.includes('s')) height+=(snap.y.delta/zoom);
      else if (h.includes('n')) {height-=(snap.y.delta/zoom);ty+=(snap.y.delta/zoom);}
    }
    i.target.style.width=`${Math.max(20,width)}px`;i.target.style.height=`${Math.max(20,height)}px`;i.target.style.translate=`${tx}px ${ty}px`;
    const finalRect=i.target.getBoundingClientRect();showGuides(finalRect,snap,i.candidates);showDragReadout(event,`${Math.round(width)} × ${Math.round(height)} PX`);
  }

  function showDragReadout(event,text) {
    dragReadout.textContent=text;dragReadout.style.left=`${Math.min(window.innerWidth-150,event.clientX+14)}px`;dragReadout.style.top=`${Math.min(window.innerHeight-28,event.clientY+14)}px`;
  }

  function endInteraction(event) {
    if (!interaction || interaction.pointerId!==event.pointerId) return;
    if (interaction.moved && interaction.target) {recordElement(interaction.target);commitHistory();}
    interaction=null;document.body.classList.remove('ve-dragging');hideGuides();updateInspector();
  }

  function enterTextEdit(element=selected) {
    if (!element?.matches(TEXT_SELECTOR)) return;
    select(element);element.contentEditable='true';element.focus({preventScroll:true});
    const range=document.createRange();range.selectNodeContents(element);range.collapse(false);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
  }
  function exitTextEdit() {
    const editing=document.querySelector('[contenteditable="true"][data-ve-editable]');
    if (!editing) return;
    editing.contentEditable='false';recordElement(editing);commitHistory();
  }

  function applyMetric(metric,value) {
    if (!selected || !Number.isFinite(value)) return;
    const current=localMetrics(selected),translation=parseTranslate(selected);
    if (metric==='x') selected.style.translate=`${translation.x+(value-current.x)}px ${translation.y}px`;
    if (metric==='y') selected.style.translate=`${translation.x}px ${translation.y+(value-current.y)}px`;
    if (metric==='width') selected.style.width=`${Math.max(1,value)}px`;
    if (metric==='height') selected.style.height=`${Math.max(1,value)}px`;
    recordElement(selected);updateSelectionBox();updateInspector();
  }

  function applyStyle(prop,value) {
    if (!selected) return;
    if (prop==='fontSize' || prop==='letterSpacing' || prop==='borderRadius') value=`${value}px`;
    if (prop==='lineHeight') value=String(value);
    selected.style[prop]=value;recordElement(selected);updateSelectionBox();updateInspector();
  }

  function setImagePosition(axis,value) {
    if (!selected?.matches('img')) return;
    let [x,y]=parseObjectPosition(getComputedStyle(selected).objectPosition);
    if (axis==='x') x=value;else y=value;
    selected.style.objectPosition=`${x}% ${y}%`;recordElement(selected);updateInspector();
  }

  function nudge(dx,dy) {
    if (!selected) return;
    const translation=parseTranslate(selected);
    selected.style.translate=`${translation.x+dx}px ${translation.y+dy}px`;recordElement(selected);commitHistory();updateSelectionBox();updateInspector();
  }

  function setZoom(next,persist=true) {
    zoom=Math.max(.5,Math.min(1.5,next));
    const nodes=[...document.body.children].filter(node=>!node.classList.contains('ve-app')&&!node.classList.contains('ve-launch'));
    nodes.forEach(node => node.style.zoom = zoom===1 ? '' : String(zoom));
    app.querySelector('.ve-zoom-value').textContent=`${Math.round(zoom*100)}%`;canvasReadout.textContent=`DESKTOP · ${Math.round(zoom*100)}%`;
    window.dispatchEvent(new Event('resize'));updateSelectionBox();renderComments();
    if (persist) scheduleSave();
  }

  function openCommentPopover(event,existing=null) {
    const target=event.target.closest(EDITABLE_SELECTOR);const root=rootFor(target || document.elementFromPoint(event.clientX,event.clientY));
    if (!root || root.closest('.ve-app')) return;
    const rect=root.getBoundingClientRect();
    pendingComment={existingId:existing?.id || null,rootKey:keyFor(root),section:rootLabel(root),xPct:existing?.xPct ?? ((event.clientX-rect.left)/rect.width*100),yPct:existing?.yPct ?? ((event.clientY-rect.top)/rect.height*100)};
    commentPopover.style.left=`${Math.min(window.innerWidth-280,event.clientX+12)}px`;commentPopover.style.top=`${Math.min(window.innerHeight-150,event.clientY+12)}px`;
    commentPopover.classList.add('is-visible');const textarea=commentPopover.querySelector('textarea');textarea.value=existing?.text || '';setTimeout(()=>textarea.focus(),0);
  }
  function closeCommentPopover(){commentPopover.classList.remove('is-visible');pendingComment=null;}
  function saveComment() {
    if (!pendingComment) return;const text=commentPopover.querySelector('textarea').value.trim();if (!text) return;
    if (pendingComment.existingId) {
      const comment=doc.comments.find(item=>item.id===pendingComment.existingId);if (comment) comment.text=text;
    } else doc.comments.push({id:`c${Date.now()}`,rootKey:pendingComment.rootKey,section:pendingComment.section,xPct:pendingComment.xPct,yPct:pendingComment.yPct,text,resolved:false,createdAt:new Date().toISOString()});
    closeCommentPopover();commitHistory();renderComments();
  }

  function rootByKey(key) { return [...document.querySelectorAll('[data-ve-key]')].find(element=>element.dataset.veKey===key); }
  function renderComments() {
    commentLayer.innerHTML='';
    doc.comments.forEach((comment,index)=>{
      const pin=document.createElement('button');pin.className=`ve-comment-pin${comment.resolved?' is-resolved':''}${comment.id===activeCommentId?' is-active':''}`;pin.dataset.commentId=comment.id;pin.textContent=index+1;commentLayer.appendChild(pin);
    });
    commentsList.innerHTML=doc.comments.length?doc.comments.map((comment,index)=>`<article class="ve-comment-card${comment.resolved?' is-resolved':''}" data-comment-card="${comment.id}"><header><b>${index+1}</b><span>${escapeHtml(comment.section)}</span></header><p>${escapeHtml(comment.text)}</p><footer><button class="ve-mini-button" data-comment-action="locate" data-id="${comment.id}">MOSTRA</button><button class="ve-mini-button" data-comment-action="edit" data-id="${comment.id}">MODIFICA</button><button class="ve-mini-button" data-comment-action="resolve" data-id="${comment.id}">${comment.resolved?'RIAPRI':'RISOLVI'}</button><button class="ve-mini-button ve-danger" data-comment-action="delete" data-id="${comment.id}">×</button></footer></article>`).join(''):'<div class="ve-empty" style="padding:8px 0">Nessuna annotazione.</div>';
    updateCommentPins();
  }
  function updateCommentPins() {
    [...commentLayer.children].forEach(pin=>{
      const comment=doc.comments.find(item=>item.id===pin.dataset.commentId);const root=comment&&rootByKey(comment.rootKey);
      if (!root) {pin.style.display='none';return;}
      const rect=root.getBoundingClientRect();const x=rect.left+rect.width*comment.xPct/100,y=rect.top+rect.height*comment.yPct/100;
      pin.style.left=`${x}px`;pin.style.top=`${y}px`;pin.style.display=(x>0&&x<window.innerWidth&&y>44&&y<window.innerHeight)?'grid':'none';
    });
  }

  function handleCommentAction(action,id,event) {
    const comment=doc.comments.find(item=>item.id===id);if (!comment) return;
    if (action==='locate') {activeCommentId=id;const root=rootByKey(comment.rootKey);root?.scrollIntoView({behavior:'smooth',block:'center'});renderComments();}
    if (action==='edit') openCommentPopover({target:rootByKey(comment.rootKey),clientX:event.clientX,clientY:event.clientY},comment);
    if (action==='resolve') {comment.resolved=!comment.resolved;commitHistory();renderComments();}
    if (action==='delete' && confirm('Eliminare questa annotazione?')) {doc.comments=doc.comments.filter(item=>item.id!==id);commitHistory();renderComments();}
  }

  function resetSelected() {
    if (!selected) return;delete doc.elements[keyFor(selected)];restoreElement(selected);recordElement(selected);delete doc.elements[keyFor(selected)];commitHistory();updateSelectionBox();updateInspector();
  }
  function resetAll() {
    if (!confirm('Azzerare tutte le modifiche e le annotazioni dell’editor?')) return;
    doc={version:VERSION,elements:{},comments:[]};applyDocument();commitHistory();
  }

  function exportPayload() {
    const css=Object.entries(doc.elements).map(([selector,record])=>{
      const declarations=Object.entries(record.styles||{}).map(([prop,value])=>`  ${prop.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`)}: ${value};`).join('\n');
      return declarations?`${selector} {\n${declarations}\n}`:'';
    }).filter(Boolean).join('\n\n');
    return JSON.stringify({project:CONFIG.projectName,projectId:CONFIG.projectId,exportedAt:new Date().toISOString(),editorVersion:VERSION,document:doc,css},null,2);
  }
  function openExport(){exportTextarea.value=exportPayload();exportDialog.classList.add('is-visible');scrim.classList.add('is-visible');}
  function closeExport(){exportDialog.classList.remove('is-visible');scrim.classList.remove('is-visible');}
  function downloadExport(){const blob=new Blob([exportTextarea.value],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=CONFIG.exportFilename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

  function showToast(message,isError=false) {
    toast.textContent=message;toast.classList.toggle('is-error',isError);toast.classList.add('is-visible');
    clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('is-visible'),2600);
  }

  function importSnapshot(file) {
    if (!file) return;
    const reader=new FileReader();
    reader.onload=()=>{
      try {
        const payload=JSON.parse(reader.result);
        const incoming=payload.document || payload;
        if (!incoming || !incoming.elements || !Array.isArray(incoming.comments)) throw new Error('Formato non valido');
        doc={version:VERSION,elements:incoming.elements,comments:incoming.comments};
        sanitizeDocument();applyDocument();commitHistory();showToast('SNAPSHOT IMPORTATO');
      } catch (_) { showToast('FILE NON VALIDO',true); }
      importInput.value='';
    };
    reader.readAsText(file);
  }

  launch.addEventListener('click',()=>activate(true));
  app.addEventListener('click',event=>{
    const action=event.target.closest('[data-action]')?.dataset.action;
    const nextTool=event.target.closest('[data-tool]')?.dataset.tool;
    if (nextTool) setTool(nextTool);
    if (action==='close') activate(false);
    if (action==='undo') undo();if (action==='redo') redo();
    if (action==='layers') {document.body.classList.toggle('ve-show-layers');updateLayers();}
    if (action==='zoom-in') setZoom(zoom+.1);if (action==='zoom-out') setZoom(zoom-.1);
    if (action==='toggle-comments') document.body.classList.toggle('ve-hide-comments');
    if (action==='edit-text') enterTextEdit();
    if (action==='reset-selected') resetSelected();if (action==='reset-all') resetAll();
    if (action==='export') openExport();if (action==='close-export') closeExport();
    if (action==='import') importInput.click();
    if (action==='copy-export') navigator.clipboard?.writeText(exportTextarea.value).catch(()=>{});
    if (action==='download-export') downloadExport();
    if (action==='cancel-comment') closeCommentPopover();if (action==='save-comment') saveComment();
    const layerKey=event.target.closest('[data-layer-key]')?.dataset.layerKey;
    if (layerKey) {const element=[...document.querySelectorAll('[data-ve-key]')].find(item=>item.dataset.veKey===layerKey);if(element)select(element);}
    const commentAction=event.target.closest('[data-comment-action]');if(commentAction)handleCommentAction(commentAction.dataset.commentAction,commentAction.dataset.id,event);
    const sectionButton=event.target.closest('.ve-section>button');if(sectionButton&&!event.target.closest('[data-action]'))sectionButton.parentElement.classList.toggle('is-collapsed');
  });
  importInput.addEventListener('change',()=>importSnapshot(importInput.files?.[0]));

  document.addEventListener('pointerdown',event=>{
    if (!enabled || app.contains(event.target) || event.button!==0) return;
    const target=event.target.closest(EDITABLE_SELECTOR);
    if (tool==='comment') {openCommentPopover(event);event.preventDefault();return;}
    if (tool==='hand') {beginHand(event);return;}
    if (!target) {select(null);return;}
    select(target);
    if (tool==='text' && target.matches(TEXT_SELECTOR)) {enterTextEdit(target);event.preventDefault();return;}
    if (tool==='crop' && target.matches('img')) {beginCrop(event,target);return;}
    if (tool==='select' && !target.isContentEditable) beginMove(event,target);
  },true);
  document.addEventListener('pointermove',moveInteraction,true);
  document.addEventListener('pointerup',endInteraction,true);
  document.addEventListener('pointercancel',endInteraction,true);
  selectionBox.addEventListener('pointerdown',event=>{const handle=event.target.closest('[data-handle]')?.dataset.handle;if(handle)beginResize(event,handle);},true);

  document.addEventListener('dblclick',event=>{
    if (!enabled || app.contains(event.target)) return;const target=event.target.closest(TEXT_SELECTOR);if(target?.matches('[data-ve-editable]')){setTool('text');enterTextEdit(target);event.preventDefault();}
  },true);
  document.addEventListener('input',event=>{
    if (enabled && event.target.matches('[contenteditable="true"][data-ve-editable]')) {recordElement(event.target);scheduleSave();updateSelectionBox();}
  });
  document.addEventListener('focusout',event=>{if(event.target.matches?.('[contenteditable="true"][data-ve-editable]'))exitTextEdit();});

  inspector.addEventListener('input',event=>{
    if (event.target.dataset.metric) applyMetric(event.target.dataset.metric,parseFloat(event.target.value));
    if (event.target.dataset.style) applyStyle(event.target.dataset.style,event.target.value);
    if (event.target.dataset.image) setImagePosition(event.target.dataset.image,parseFloat(event.target.value));
  });
  inspector.addEventListener('change',event=>{if(event.target.matches('[data-metric],[data-style],[data-image]'))commitHistory();});
  inspector.addEventListener('click',event=>{const align=event.target.closest('[data-align] button');if(align){applyStyle('textAlign',align.dataset.value);commitHistory();}});
  commentLayer.addEventListener('click',event=>{const pin=event.target.closest('[data-comment-id]');if(pin){activeCommentId=pin.dataset.commentId;renderComments();commentsList.querySelector(`[data-comment-card="${activeCommentId}"]`)?.scrollIntoView({block:'nearest'});}});

  document.addEventListener('keydown',event=>{
    const typing=event.target.matches('input,textarea,select,[contenteditable="true"]');
    if (!enabled) return;
    if ((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();return;}
    if (typing) return;
    if (event.key==='Escape'){if(commentPopover.classList.contains('is-visible'))closeCommentPopover();else if(selected)select(null);else activate(false);return;}
    if (event.key.toLowerCase()==='v')setTool('select');if(event.key.toLowerCase()==='t')setTool('text');if(event.key.toLowerCase()==='i')setTool('crop');if(event.key.toLowerCase()==='c'&&!event.shiftKey)setTool('comment');if(event.key.toLowerCase()==='h')setTool('hand');if(event.key.toLowerCase()==='l')document.body.classList.toggle('ve-show-layers');
    if (event.shiftKey&&event.key.toLowerCase()==='c')document.body.classList.toggle('ve-hide-comments');
    if (event.key==='Enter'&&selected?.matches(TEXT_SELECTOR))enterTextEdit();
    if (selected&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {const step=event.shiftKey?10:1;nudge(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0);event.preventDefault();}
  });

  function frameLoop(){if(enabled){updateSelectionBox();updateCommentPins();}requestAnimationFrame(frameLoop);}
  window.addEventListener('resize',()=>{updateSelectionBox();updateCommentPins();});
  prepareEditable();
  if (sanitizeDocument()) saveNow();
  applyDocument();renderComments();frameLoop();
  window.LayoutEditor = Object.freeze({
    version:VERSION,
    config:{...CONFIG},
    open:()=>activate(true),
    close:()=>activate(false),
    toggle:()=>activate(),
    export:exportPayload,
    getDocument:()=>JSON.parse(JSON.stringify(doc))
  });
  document.dispatchEvent(new CustomEvent('layouteditor:ready',{detail:{version:VERSION,projectId:CONFIG.projectId}}));
})();
