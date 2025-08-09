// selector/picker.js
(() => {
  const STATE = { mode: "image", requestId: "", active: false };
  const CSS = `
    :host { all: initial; }
    .ws-root { position:fixed; inset:0; z-index:2147483647; pointer-events:none; }
    .box { position:fixed; border:2px solid #ffd83d; background: rgba(255,216,61,.2); pointer-events:none; }
    .hint {
      position:fixed; left:12px; bottom:12px; padding:6px 8px; font:12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color:#111; background:#fff; border:1px solid #ddd; border-radius:6px; box-shadow:0 2px 12px rgba(0,0,0,.15);
      pointer-events:none;
    }
    .hint strong { font-weight:700; }
  `;

  // simple, robust selector generator
  function getSelector(el) {
    if (!(el instanceof Element)) return "";
    if (el.id && document.querySelectorAll(`#${CSSesc(el.id)}`).length === 1) {
      return `#${CSSesc(el.id)}`;
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      const tag = node.tagName.toLowerCase();
      let sel = tag;
      const name = (node.getAttribute("name") || "").trim();
      if (name) { // good uniqueness lever for inputs/images
        sel += `[name="${CSSattr(name)}"]`;
      } else {
        const cls = [...node.classList].slice(0,3).map(CSSesc).join(".");
        if (cls) sel += `.${cls}`;
        // nth-of-type helps disambiguate siblings
        const parent = node.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter(c => c.tagName === node.tagName);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(node) + 1;
            sel += `:nth-of-type(${idx})`;
          }
        }
      }
      parts.unshift(sel);
      // stop early if unique enough
      const candidate = parts.join(" > ");
      try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch {}
      node = node.parentElement;
    }
    return parts.join(" > ");
  }
  function CSSesc(s){ return s.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~ ])/g, '\\$1'); }
  function CSSattr(s){ return s.replace(/"/g, '\\"'); }

  // overlay
  let shadowHost, root, box, hint;
  function ensureOverlay(){
    if (root) return;
    shadowHost = document.createElement('div');
    const shadow = shadowHost.attachShadow({mode:'closed'});
    const style = document.createElement('style'); style.textContent = CSS;
    root = document.createElement('div'); root.className = 'ws-root';
    box = document.createElement('div'); box.className = 'box'; box.style.display = 'none';
    hint = document.createElement('div'); hint.className = 'hint';
    shadow.append(style, root);
    root.append(box, hint);
    document.documentElement.appendChild(shadowHost);
  }
  function setHint(text){
    hint.textContent = text;
  }
  function drawBox(rect){
    if (!rect) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.style.left = `${Math.max(0, rect.left + window.scrollX)}px`;
    box.style.top = `${Math.max(0, rect.top + window.scrollY)}px`;
    box.style.width = `${Math.max(0, rect.width)}px`;
    box.style.height = `${Math.max(0, rect.height)}px`;
  }

  // element under point that isn't our overlay
  function pickElementAt(x,y){
    // temporarily hide overlay
    root.style.display = 'none';
    const el = document.elementFromPoint(x,y);
    root.style.display = '';
    return el;
  }

  // enforce mode
  function normalizeTarget(el){
    if (!el) return null;
    if (STATE.mode === 'image') {
      return el.closest('img,picture,video,source')?.tagName.toLowerCase() === 'img'
        ? el.closest('img')
        : (el.closest('picture')?.querySelector('img') || el.closest('img'));
    }
    // text mode: prefer a block with meaningful text
    let node = el;
    while (node && node !== document.body) {
      const txt = node.textContent?.trim() || "";
      if (txt.length >= 20) return node;
      node = node.parentElement;
    }
    return el;
  }

  function cleanText(el){
    const clone = el.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,svg,canvas,video,audio,iframe,input,select,textarea').forEach(n=>n.remove());
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    return (clone.textContent || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // events
  let moveHandler, clickHandler, keyHandler, scrollHandler, resizeHandler;
  function start(mode, requestId){
    STATE.mode = mode; STATE.requestId = requestId; STATE.active = true;
    ensureOverlay();
    setHint(`Picking ${mode}. Hover to highlight, click to select. Press Esc to cancel.`);
    moveHandler = (e)=>{
      if (!STATE.active) return;
      const el = normalizeTarget(pickElementAt(e.clientX, e.clientY));
      if (!el) { drawBox(null); return; }
      drawBox(el.getBoundingClientRect());
    };
    clickHandler = (e)=>{
      if (!STATE.active) return;
      // capture on capture phase so page doesn't consume it
      e.stopPropagation(); e.preventDefault();
      const el = normalizeTarget(pickElementAt(e.clientX, e.clientY));
      if (!el) return;
      const selector = getSelector(el);
      const payload = { requestId: STATE.requestId, mode: STATE.mode, selector, pageUrl: location.href };
      if (STATE.mode === 'image') {
        const img = (el.tagName === 'IMG') ? el : el.querySelector('img');
        payload.imageSrc = img ? (img.currentSrc || img.src || '') : '';
      } else {
        payload.text = cleanText(el).slice(0, 1200); // cap for storage sanity
      }
      chrome.runtime.sendMessage({ type: 'PICKER_DONE', ...payload });
      destroy();
    };
    keyHandler = (e)=>{
      if (e.key === 'Escape'){ chrome.runtime.sendMessage({ type:'PICKER_CANCEL', requestId: STATE.requestId }); destroy(); }
      if (e.key === 'Enter'){ /* optional: treat as click at current box center */ }
    };
    scrollHandler = ()=>{ /* box recomputed on next mousemove; noop */ };
    resizeHandler = ()=>{ /* noop */ };
    window.addEventListener('mousemove', moveHandler, true);
    window.addEventListener('click', clickHandler, true);
    window.addEventListener('keydown', keyHandler, true);
    window.addEventListener('scroll', scrollHandler, true);
    window.addEventListener('resize', resizeHandler, true);
  }
  function destroy(){
    STATE.active = false;
    window.removeEventListener('mousemove', moveHandler, true);
    window.removeEventListener('click', clickHandler, true);
    window.removeEventListener('keydown', keyHandler, true);
    window.removeEventListener('scroll', scrollHandler, true);
    window.removeEventListener('resize', resizeHandler, true);
    if (shadowHost && shadowHost.parentNode) shadowHost.parentNode.removeChild(shadowHost);
    shadowHost = root = box = hint = null;
  }

  // listen for init message from bg
  chrome.runtime.onMessage.addListener((msg)=>{
    if (msg && msg.type === 'PICKER_INIT') start(msg.mode, msg.requestId);
  });
})();
