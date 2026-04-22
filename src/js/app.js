/**
 * app.js — DocFlow AI Main Controller
 *
 * Responsibilities:
 *  - File upload & drag-and-drop
 *  - Option toggles
 *  - Character count feedback
 *  - Orchestrating parseDocument → runAnalysis → buildResults
 *  - DOM updates and error display
 *
 * Security:
 *  - All user input is sanitized via esc() in renderer.js before DOM insertion
 *  - innerHTML is only used with sanitized strings — never with raw user text
 *  - File reading is done via FileReader / ArrayBuffer — no eval()
 *  - Copy-to-clipboard uses the Clipboard API with a try/catch
 */

import { parseDocument, truncateForAPI, getFileIcon, formatFileSize } from '../utils/docParser.js';
import { runAnalysis } from '../utils/claudeService.js';
import { buildResults } from '../utils/renderer.js';

// ── State ─────────────────────────────────────────────────────────────────────
let extractedText = '';
let selected = new Set(['architecture', 'journey', 'competitors', 'recommendations']);
let stepTimer = null;

// ── DOM references (resolved in init so nulls are never used if markup changes) ─
const $ = id => document.getElementById(id);
let uz, fi, fp, pp, ppText, ficon, fname, fmeta, fstatus, ti, gb, lb, eb, rw, sr, tabs, panels;

function resolveDom() {
  uz = $('uz');
  fi = $('fi');
  fp = $('fp');
  pp = $('pp');
  ppText = $('pp-text');
  ficon = $('ficon');
  fname = $('fname');
  fmeta = $('fmeta');
  fstatus = $('fstatus');
  ti = $('ti');
  gb = $('gb');
  lb = $('lb');
  eb = $('eb');
  rw = $('rw');
  sr = $('sr');
  tabs = $('tabs');
  panels = $('panels');
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
function initApp() {
  resolveDom();
  if (!fi || !uz || !fp || !pp || !ppText || !ficon || !fname || !fmeta || !fstatus) {
    console.error('[DocFlow] Missing required elements', { fi: !!fi, uz: !!uz, fp: !!fp, pp: !!pp });
    if (eb) {
      eb.classList.add('show');
      eb.textContent = 'Page structure error: file upload UI is missing. Please refresh or redeploy.';
    }
    return;
  }

  bindUploadZone();
  bindOptions();
  bindTextArea();
  bindGenerateButton();
  bindCopyButtons();
  bindClearButton();
  // Zone (outside the Choose File label) still opens the picker; label contains real file input on top of button.
  uz.addEventListener('click', e => {
    if (e.target.closest('label.file-choose') || e.target === fi) return;
    e.preventDefault();
    fi.click();
  });
}

// Because this module is loaded via a dynamic import(), DOMContentLoaded
// may have already fired by the time this code runs. Check readyState.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// ── Drag & drop ───────────────────────────────────────────────────────────────
function bindUploadZone() {
  uz.addEventListener('dragover', e => { e.preventDefault(); uz.classList.add('over'); });
  uz.addEventListener('dragleave', e => { if (!uz.contains(e.relatedTarget)) uz.classList.remove('over'); });
  uz.addEventListener('drop', e => {
    e.preventDefault();
    uz.classList.remove('over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  // currentTarget = input (stable). Avoid e.target in async follow-up; defer clearing for mobile Safari.
  fi.addEventListener('change', e => {
    const input = e.currentTarget;
    const f = input.files && input.files[0];
    if (!f) return;
    handleFile(f).finally(() => {
      setTimeout(() => {
        try { input.value = ''; } catch (_) { /* old IE */ }
      }, 0);
    });
  });
}

// ── File handling ─────────────────────────────────────────────────────────────
async function handleFile(file) {
  if (!fp || !pp || !ppText || !ficon || !fname || !fmeta) return;
  hideErr();
  // Reset previous state
  extractedText = '';
  pp.classList.remove('show');

  // Show preview card immediately (before any async) so the first step always appears
  ficon.textContent = getFileIcon(file.name);
  fname.textContent  = file.name;
  fmeta.textContent  = formatFileSize(file.size) + ' · ' + file.name.split('.').pop().toUpperCase();
  setStatus('reading', 'Reading file...');
  fp.classList.add('show');
  // Belt-and-braces: also set inline style so the card appears even if CSS class toggling has any issue
  fp.style.display = 'flex';
  fp.style.borderColor = 'rgba(123,110,246,0.35)';
  requestAnimationFrame(() => {
    try { fp.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) { fp.scrollIntoView(); }
  });

  try {
    const text = await parseDocument(file);
    extractedText = text;

    setStatus('ok', `✓ ${text.length.toLocaleString()} characters extracted`);
    showPreview(text);
    updateCharCount();

  } catch (err) {
    console.error('[App] File parse error:', err);
    setStatus('err', err.message);
    // Keep the preview card visible so the user sees the error status
    fp.classList.add('show');
    fp.style.display = 'flex';
    showErr(
      `Could not read "${file.name}". ${err.message}<br>` +
      `<small>Try saving as .txt and uploading again, or paste the text below.</small>`
    );
  }
}

function showPreview(text) {
  if (!ppText || !pp) return;
  const preview = text.slice(0, 500) + (text.length > 500 ? '\n\n[... preview truncated ...]' : '');
  ppText.textContent = preview;
  pp.classList.add('show');
  // Belt-and-braces inline style so the parsed preview always appears
  pp.style.display = 'block';
}

function bindClearButton() {
  $('clearBtn').addEventListener('click', () => {
    extractedText = '';
    fp.classList.remove('show');
    fp.style.display = '';
    fp.style.borderColor = '';
    pp.classList.remove('show');
    pp.style.display = '';
    fi.value = '';
    updateCharCount();
  });
}

// ── Status helpers ────────────────────────────────────────────────────────────
function setStatus(type, msg) {
  if (!fstatus) return;
  fstatus.className = 'fstatus ' + type;
  fstatus.textContent = msg;
}

// ── Option toggles ────────────────────────────────────────────────────────────
function bindOptions() {
  document.querySelectorAll('.opt').forEach(card => {
    card.addEventListener('click', () => {
      const opt = card.dataset.opt;
      if (selected.has(opt)) {
        selected.delete(opt);
        card.classList.remove('on');
        card.querySelector('.ck').textContent = '';
      } else {
        selected.add(opt);
        card.classList.add('on');
        card.querySelector('.ck').textContent = '✓';
      }
    });
  });
}

// ── Character count ───────────────────────────────────────────────────────────
function bindTextArea() {
  ti.addEventListener('input', updateCharCount);
}

function updateCharCount() {
  const content = getContent();
  const n = content.length;
  const infoEl = $('char-info');
  const okEl   = $('char-ok');

  if (!n) {
    infoEl.textContent = 'No content yet';
    infoEl.style.color = 'var(--text3)';
    okEl.textContent = '';
    return;
  }
  infoEl.textContent = n.toLocaleString() + ' characters';

  if (n < 100) {
    infoEl.style.color = 'var(--danger)';
    okEl.textContent = '⚠ Too short — add more detail';
    okEl.style.color = 'var(--danger)';
  } else if (n < 500) {
    infoEl.style.color = 'var(--amber)';
    okEl.textContent = 'Good — more detail improves results';
    okEl.style.color = 'var(--amber)';
  } else {
    infoEl.style.color = 'var(--success)';
    okEl.textContent = '✓ Great — ready for full analysis';
    okEl.style.color = 'var(--success)';
  }
}

// ── Get content (file or textarea) ────────────────────────────────────────────
function getContent() {
  return extractedText || ti.value.trim();
}

// ── Error helpers ─────────────────────────────────────────────────────────────
function showErr(msg) {
  if (!eb) return;
  eb.innerHTML = msg; // msg is controlled by app code, not raw user input
  eb.classList.add('show');
}
function hideErr() {
  if (!eb) return;
  eb.classList.remove('show');
}

// ── Loading step animation ────────────────────────────────────────────────────
function setStep(id, state) {
  const el = $(id);
  if (el) el.className = 'ls ' + state;
}

// ── Generate ──────────────────────────────────────────────────────────────────
function bindGenerateButton() {
  gb.addEventListener('click', generate);
}

async function generate() {
  const content = getContent();

  if (!content) {
    showErr('Please upload a document or paste your text first.');
    return;
  }
  if (content.length < 80) {
    showErr('Content is too short. Please provide more detail for a meaningful analysis.');
    return;
  }
  if (selected.size === 0) {
    showErr('Please select at least one analysis type.');
    return;
  }

  hideErr();
  gb.disabled = true;
  lb.classList.add('show');
  rw.classList.remove('show');

  // Reset loading steps
  ['ls1','ls2','ls3','ls4','ls5'].forEach(id => setStep(id, ''));

  // Truncate large documents smartly
  const docText = truncateForAPI(content, 12000);

  try {
    const data = await runAnalysis(docText, selected, (stepId, status) => {
      setStep(stepId, status);
    });

    renderResults(data);

  } catch (err) {
    console.error('[App] Analysis error:', err);
    showErr(
      `Analysis failed: ${err.message}<br>` +
      `<small>Make sure the document contains readable text. Check the browser console for details.</small>`
    );
  } finally {
    gb.disabled = false;
    lb.classList.remove('show');
    ['ls1','ls2','ls3','ls4','ls5'].forEach(id => setStep(id, ''));
  }
}

// ── Render results ────────────────────────────────────────────────────────────
function renderResults(data) {
  const { statsHTML, summaryHTML, panels: panelList } = buildResults(data, selected);

  sr.innerHTML = statsHTML;
  tabs.innerHTML = '';
  panels.innerHTML = summaryHTML;

  panelList.forEach((panel, i) => {
    // Tab button
    const btn = document.createElement('button');
    btn.className = 'tab' + (i === 0 ? ' on' : '');
    btn.textContent = panel.label;
    btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-selected','false'); });
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
      btn.classList.add('on');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById('pn-' + panel.key).classList.add('on');
    });
    tabs.appendChild(btn);

    // Panel div
    const div = document.createElement('div');
    div.className = 'panel' + (i === 0 ? ' on' : '');
    div.id = 'pn-' + panel.key;
    div.innerHTML = panel.html;
    panels.appendChild(div);
  });

  rw.classList.add('show');
  rw.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Bind copy buttons rendered inside panels
  bindCopyButtons();
}

// ── Copy to clipboard ─────────────────────────────────────────────────────────
function bindCopyButtons() {
  document.querySelectorAll('[data-copy-target]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = document.getElementById(btn.dataset.copyTarget);
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.innerText);
        const orig = btn.textContent;
        btn.textContent = '✓ Copied';
        setTimeout(() => { btn.textContent = orig; }, 1800);
      } catch (_) {
        console.warn('[App] Clipboard write failed');
      }
    });
  });
}
