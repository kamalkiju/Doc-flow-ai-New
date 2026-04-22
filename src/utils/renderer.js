/**
 * renderer.js
 * Builds all result HTML panels from the analysis data.
 * Pure functions — no DOM mutations, returns HTML strings only.
 */

/** Escape HTML to prevent XSS */
function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderStats(data) {
  return `
    <div class="sc"><div class="sl">Product</div><div class="sv">${esc(data.productName || 'Detected')}</div></div>
    <div class="sc"><div class="sl">Domain</div><div class="sv">${esc(data.domain || 'General')}</div></div>
    <div class="sc"><div class="sl">Complexity</div><div class="sv">${esc(data.complexity || 'Medium')}</div></div>
    <div class="sc"><div class="sl">Market</div><div class="sv" style="font-size:12px">${esc(data.targetMarket || '—')}</div></div>
  `;
}

export function renderSummary(data) {
  return `
    <div class="sumbox">
      <strong style="color:var(--text)">Summary — </strong>${esc(data.summary || 'No summary available.')}
    </div>
  `;
}

export function renderArchitecture(data) {
  const arch = data.architecture;
  if (!arch) return '<p style="color:var(--text2);padding:24px;font-size:14px">Architecture data not available. Try re-running the analysis.</p>';

  const sections = Array.isArray(arch.sections) ? arch.sections : [];
  const flows    = Array.isArray(arch.primaryFlows) ? arch.primaryFlows : [];

  // Fallback: if Claude returned nothing useful, show a clear message
  if (sections.length === 0) {
    return `<div class="rc">
      <div class="rch"><div class="rct">Information Architecture</div></div>
      <div class="rcb">
        ${arch.iaDescription ? `<div style="font-size:14px;line-height:1.8;color:var(--text2);margin-bottom:16px">${esc(arch.iaDescription)}</div>` : ''}
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:var(--rs);padding:14px 18px;font-size:13px;color:var(--amber)">
          The document did not contain enough screen-level detail to build a full IA map.
          Try uploading a document that describes specific screens, pages, or UI components.
        </div>
      </div>
    </div>`;
  }

  const screenTypeColors = {
    'List View':    { bg: 'rgba(123,110,246,0.12)', border: 'rgba(123,110,246,0.25)', color: 'var(--accent2)' },
    'Form':         { bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.22)',  color: 'var(--amber)' },
    'Dashboard':    { bg: 'rgba(45,212,191,0.1)',   border: 'rgba(45,212,191,0.22)', color: 'var(--teal)' },
    'Detail View':  { bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.22)', color: 'var(--success)' },
    'Modal':        { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', color: 'var(--danger)' },
    'Settings':     { bg: 'rgba(166,149,255,0.1)',  border: 'rgba(166,149,255,0.22)',color: '#A695FF' },
    'Editor':       { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.28)', color: '#F59E0B' },
    'Report':       { bg: 'rgba(45,212,191,0.12)',  border: 'rgba(45,212,191,0.28)', color: 'var(--teal)' },
    'Wizard':       { bg: 'rgba(123,110,246,0.15)', border: 'rgba(123,110,246,0.3)', color: 'var(--accent2)' },
    'Landing':      { bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.25)', color: 'var(--success)' },
  };

  function getScreenStyle(type) {
    return screenTypeColors[type] || { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', color: 'var(--text2)' };
  }

  // Stat bar
  const totalScreens = arch.totalScreens || sections.reduce((t, s) => t + (s.screens || []).length, 0);
  const totalSections = sections.length;
  const totalFlows = flows.length;

  const statBar = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:12px 16px">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px">Total screens</div>
        <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:700;color:var(--accent2)">${totalScreens}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:12px 16px">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px">Sections</div>
        <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:700;color:var(--teal)">${totalSections}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:12px 16px">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px">Primary flows</div>
        <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:700;color:var(--success)">${totalFlows}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:12px 16px">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px">Product</div>
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-top:3px">${esc(arch.productName || '')}</div>
      </div>
    </div>`;

  // IA description
  const descBlock = arch.iaDescription ? `
    <div style="background:rgba(123,110,246,0.06);border:1px solid rgba(123,110,246,0.14);border-radius:var(--rs);padding:14px 18px;margin-bottom:20px;font-size:14px;line-height:1.8;color:var(--text2)">
      ${esc(arch.iaDescription)}
    </div>` : '';

  // Screen type legend
  const legendTypes = ['Dashboard','List View','Form','Detail View','Editor','Modal','Report','Settings'];
  const legend = `
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px">
      ${legendTypes.map(t => {
        const st = getScreenStyle(t);
        return `<span style="font-size:11px;font-weight:500;padding:3px 10px;border-radius:5px;background:${st.bg};color:${st.color};border:1px solid ${st.border}">${t}</span>`;
      }).join('')}
    </div>`;

  // Sections with screens
  const sectionsHTML = sections.map(sec => {
    const screensHTML = (sec.screens || []).map(screen => {
      const st = getScreenStyle(screen.screenType);
      const actionsHTML = (screen.keyActions || []).map(a =>
        `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text3);border:1px solid var(--border)">${esc(a)}</span>`
      ).join('');
      const navHTML = (screen.navigatesTo || []).map(n =>
        `<span style="font-size:11px;color:var(--accent2)">→ ${esc(n)}</span>`
      ).join(' ');
      const subHTML = (screen.subScreens || []).map(sub =>
        `<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:6px;margin-top:4px">
          <span style="font-size:10px;color:var(--text3)">↳</span>
          <span style="font-size:12px;color:var(--text2);font-weight:500">${esc(sub.name)}</span>
          ${sub.purpose ? `<span style="font-size:11px;color:var(--text3)">— ${esc(sub.purpose)}</span>` : ''}
        </div>`
      ).join('');

      return `
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:8px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <div style="flex:1">
              <div style="font-size:14px;font-weight:600;margin-bottom:3px">${esc(screen.screenName)}</div>
              <div style="font-size:12px;color:var(--text2);line-height:1.5">${esc(screen.screenPurpose || '')}</div>
            </div>
            <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:5px;background:${st.bg};color:${st.color};border:1px solid ${st.border};white-space:nowrap">${esc(screen.screenType || '')}</span>
          </div>
          ${actionsHTML ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${actionsHTML}</div>` : ''}
          ${navHTML ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;font-size:11px">${navHTML}</div>` : ''}
          ${subHTML}
        </div>`;
    }).join('');

    return `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:12px">
        <div style="padding:14px 20px;background:var(--bg3);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">${esc(sec.sectionIcon || '📄')}</span>
          <div style="flex:1">
            <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700">${esc(sec.sectionName)}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:1px">${esc(sec.sectionPurpose || '')}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            ${sec.userRole ? `<span style="font-size:11px;padding:3px 9px;border-radius:5px;background:rgba(45,212,191,0.08);color:var(--teal);border:1px solid rgba(45,212,191,0.2)">${esc(sec.userRole)}</span>` : ''}
            <span style="font-size:11px;padding:3px 9px;border-radius:5px;background:rgba(123,110,246,0.1);color:var(--accent2);border:1px solid rgba(123,110,246,0.2)">${(sec.screens||[]).length} screens</span>
          </div>
        </div>
        <div style="padding:16px">${screensHTML}</div>
      </div>`;
  }).join('');

  // Primary flows
  const flowsHTML = flows.length ? `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-top:8px">
      <div style="padding:14px 20px;background:var(--bg3);border-bottom:1px solid var(--border)">
        <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700">Primary Screen Flows</div>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:10px">
        ${flows.map((f,i) => `
          <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:14px 18px">
            <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text)">
              <span style="background:rgba(123,110,246,0.15);color:var(--accent2);font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;margin-right:8px">${i+1}</span>
              ${esc(f.flowName)}
            </div>
            <div style="font-size:13px;color:var(--accent2);font-family:monospace;line-height:1.8;word-break:break-word">
              ${esc((f.steps || []).join(' '))}
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  return `
    <div class="rc">
      <div class="rch">
        <div class="rct">Information Architecture — UI Screen Map</div>
        <button class="cpbtn" data-copy-target="arch-desc">⎘ Copy description</button>
      </div>
      <div class="rcb">
        ${statBar}
        <div id="arch-desc" style="display:none">${esc(arch.iaDescription || '')}</div>
        ${descBlock}
        ${legend}
        <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px">Screen hierarchy by section</div>
        ${sectionsHTML}
        ${flowsHTML}
      </div>
    </div>`;
}

export function renderJourney(data) {
  const j = data.userJourney;
  if (!j) return '<p style="color:var(--text2);padding:16px">No journey data available.</p>';

  const emotionClass = { positive: 'ep', neutral: 'en', negative: 'eg' };

  // Emotion bar at top
  const emotions = (j.steps || []).map(s => {
    const c = s.emotion === 'positive' ? 'var(--success)' : s.emotion === 'negative' ? 'var(--danger)' : 'var(--accent2)';
    return `<div style="flex:1;height:4px;background:${c};border-radius:2px" title="${esc(s.emotionLabel || '')}"></div>`;
  }).join('');

  const stepsHTML = (j.steps || []).map((step, i) => `
    <div class="js">
      <div class="jn">${i + 1}</div>
      <div style="flex:1">
        <div class="jname">${esc(step.name)}</div>
        <div class="jd">${esc(step.detail)}</div>
        <span class="je ${emotionClass[step.emotion] || 'en'}">${esc(step.emotionLabel || step.emotion || 'Neutral')}</span>
      </div>
    </div>`).join('');

  return `
    <div class="rc">
      <div class="rch">
        <div class="rct">User Journey — ${esc(j.persona || 'Primary User')}</div>
      </div>
      <div class="rcb">
        <div style="background:rgba(123,110,246,0.07);border:1px solid rgba(123,110,246,0.14);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:14px;color:var(--text2)">
          <strong style="color:var(--text)">Goal:</strong> ${esc(j.goal || '')}
        </div>
        <div style="display:flex;gap:3px;margin-bottom:20px;align-items:center">
          <span style="font-size:11px;color:var(--text3);margin-right:6px;white-space:nowrap">Emotion arc</span>
          ${emotions}
          <div style="display:flex;gap:6px;margin-left:8px;white-space:nowrap">
            <span style="font-size:10px;color:var(--success)">● Positive</span>
            <span style="font-size:10px;color:var(--accent2)">● Neutral</span>
            <span style="font-size:10px;color:var(--danger)">● Negative</span>
          </div>
        </div>
        ${stepsHTML}
      </div>
    </div>`;
}

export function renderCompetitors(data) {
  const competitors = data.competitors;
  if (!competitors?.length) return '<p style="color:var(--text2);padding:16px">No competitor data available.</p>';

  const typeStyles = {
    Direct:      { bg: 'rgba(248,113,113,0.1)',  color: '#F87171',  border: 'rgba(248,113,113,0.25)' },
    Indirect:    { bg: 'rgba(245,158,11,0.1)',   color: '#F59E0B',  border: 'rgba(245,158,11,0.25)' },
    Alternative: { bg: 'rgba(166,149,255,0.1)',  color: '#A695FF',  border: 'rgba(166,149,255,0.25)' },
  };

  // Category header banner
  const industryBanner = (data.industryCategory || data.softwareCategory) ? `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:16px 20px;margin-bottom:20px">
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-bottom:10px">Analysis scope</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${data.industryCategory ? `<div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:160px">
          <span style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em">Business industry</span>
          <span style="font-size:14px;font-weight:600;color:var(--teal)">${esc(data.industryCategory)}</span>
        </div>` : ''}
        ${data.softwareCategory ? `<div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:160px">
          <span style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em">Software category</span>
          <span style="font-size:14px;font-weight:600;color:var(--accent2)">${esc(data.softwareCategory)}</span>
        </div>` : ''}
      </div>
      ${data.combinedLabel ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:13px;color:var(--text2)">
        <strong style="color:var(--text)">Competitors found for: </strong>${esc(data.combinedLabel)}
      </div>` : ''}
    </div>` : '';

  const cards = competitors.map(c => {
    const ts = typeStyles[c.type] || typeStyles.Indirect;
    return `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rs);padding:20px;margin-bottom:12px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap">
        <div>
          <div style="font-size:16px;font-weight:600;margin-bottom:3px">${esc(c.name)}</div>
          ${c.website ? `<div style="font-size:12px;color:var(--accent2)">${esc(c.website)}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:5px;background:${ts.bg};color:${ts.color};border:1px solid ${ts.border}">${esc(c.type || 'Competitor')}</span>
          ${c.marketPosition ? `<span style="font-size:11px;padding:3px 10px;border-radius:5px;background:var(--surface);color:var(--text2);border:1px solid var(--border)">${esc(c.marketPosition)}</span>` : ''}
        </div>
      </div>
      ${c.industryFit ? `<div style="background:rgba(45,212,191,0.06);border:1px solid rgba(45,212,191,0.15);border-radius:7px;padding:9px 14px;margin-bottom:10px;font-size:13px;color:var(--teal);line-height:1.6">
        <span style="font-weight:600">Industry fit: </span>${esc(c.industryFit)}
      </div>` : ''}
      ${c.matchReason ? `<div style="background:rgba(123,110,246,0.07);border:1px solid rgba(123,110,246,0.15);border-radius:7px;padding:9px 14px;margin-bottom:14px;font-size:13px;color:var(--accent2);line-height:1.6">
        <span style="font-weight:600">Feature overlap: </span>${esc(c.matchReason)}
      </div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
        <div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:7px">Strength</div>
          <div style="font-size:13px;color:var(--success);line-height:1.55">+ ${esc(c.strength)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:7px">Weakness</div>
          <div style="font-size:13px;color:var(--danger);line-height:1.55">- ${esc(c.weakness)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:7px">Your edge</div>
          <div style="font-size:13px;color:var(--text2);line-height:1.55">${esc(c.differentiation)}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="rc">
      <div class="rch">
        <div class="rct">Competitor Landscape</div>
        <div style="display:flex;gap:10px;font-size:11px;font-weight:600;align-items:center">
          <span style="color:#F87171">&#9679; Direct</span>
          <span style="color:#F59E0B">&#9679; Indirect</span>
          <span style="color:#A695FF">&#9679; Alternative</span>
        </div>
      </div>
      <div class="rcb">
        ${industryBanner}
        ${cards}
      </div>
    </div>`;
}

export function renderRecommendations(data) {
  const recs = data.recommendations;
  if (!recs?.length) return '<p style="color:var(--text2);padding:16px">No recommendations available.</p>';

  const prioClass = { High: 'ph', Medium: 'pm', Low: 'pl' };

  const items = recs.map(r => `
    <div class="ri">
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
        <span class="rp ${prioClass[r.priority] || 'pm'}">${esc(r.priority)}</span>
        ${r.category ? `<span style="font-size:10px;font-weight:500;padding:2px 8px;border-radius:5px;background:rgba(123,110,246,0.08);color:var(--accent2);white-space:nowrap;text-align:center">${esc(r.category)}</span>` : ''}
      </div>
      <div style="flex:1">
        <div class="rtitle">${esc(r.title)}</div>
        ${r.problem ? `<div style="font-size:12px;color:var(--danger);margin-bottom:6px;line-height:1.5">⚠ ${esc(r.problem)}</div>` : ''}
        <div class="rdetail">${esc(r.solution || r.detail || '')}</div>
        ${r.impact ? `<div style="font-size:12px;color:var(--success);margin-top:6px;line-height:1.5">↗ ${esc(r.impact)}</div>` : ''}
      </div>
    </div>`).join('');

  return `
    <div class="rc">
      <div class="rch"><div class="rct">UX Recommendations</div></div>
      <div class="rcb">${items}</div>
    </div>`;
}

export function buildResults(data, selected) {
  const panels = [];

  if (selected.has('architecture') && data.architecture != null) {
    panels.push({ key: 'arch', label: '🏗 Architecture', html: renderArchitecture(data) });
  }
  if (selected.has('journey') && data.userJourney) {
    panels.push({ key: 'jrn', label: '🗺 User Journey', html: renderJourney(data) });
  }
  if (selected.has('competitors') && data.competitors?.length) {
    panels.push({ key: 'cmp', label: '🏆 Competitors', html: renderCompetitors(data) });
  }
  if (selected.has('recommendations') && data.recommendations?.length) {
    panels.push({ key: 'rec', label: '💡 Recommendations', html: renderRecommendations(data) });
  }

  return {
    statsHTML:   renderStats(data),
    summaryHTML: renderSummary(data),
    panels,
  };
}
