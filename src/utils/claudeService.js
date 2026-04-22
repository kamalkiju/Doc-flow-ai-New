/**
 * claudeService.js
 *
 * Competitor analysis — 3-step pipeline:
 *
 * Step A: Classify the document into its PRIMARY BUSINESS CATEGORY
 *         (waste management, entertainment, healthcare, fintech etc.)
 *         AND its SOFTWARE PRODUCT CATEGORY
 *         (knowledge management, streaming platform, CRM, EHR etc.)
 *
 * Step B: Using both categories together, find competitors that operate
 *         in the SAME INDUSTRY doing the SAME TYPE OF SOFTWARE.
 *         e.g. "knowledge management tools specifically used by waste
 *         management / field service companies" — not just generic KM tools.
 *
 * Step C: Render with full breakdown: industry category, product category,
 *         match reason, strength, weakness, differentiation.
 */

// When running on Vercel (deployed), calls go through /api/claude (our secure proxy).
// When running on claude.ai (portfolio demo), calls go direct to Anthropic (proxy injected by claude.ai).
// Detection: if window.location is a real domain (not claude.ai), use the local proxy.
const ON_VERCEL = typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1' &&
  !window.location.hostname.includes('claude.ai');

const API_URL = ON_VERCEL
  ? '/api/claude'                            // Vercel serverless proxy (api/claude.js)
  : 'https://api.anthropic.com/v1/messages'; // Direct (claude.ai injects auth)

const MODEL = 'claude-sonnet-4-20250514';

const TOKENS = {
  brief:        4000,
  categoryPass: 1500,
  competitors:  2500,
  architecture: 4000,
  journey:      2000,
  recommendations: 2000,
};

// ============================================================
// Core API call
// ============================================================
async function callClaude(system, user, maxTokens) {
  const body = { model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] };
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const base = (err && err.message) || 'Request failed';
    const hint = ON_VERCEL
      ? 'Confirm Vercel has ANTHROPIC_API_KEY and the latest deploy (proxy at /api/claude).'
      : 'Use a local server (vercel dev) with .env, or open the deployed site; file:// and blocked requests will fail.';
    throw new Error(base + ' ' + hint);
  }
  if (!res.ok) {
    let msg = 'API error ' + res.status;
    try {
      const j = await res.json();
      msg = j?.error?.message || (typeof j?.error === 'string' ? j.error : msg);
    } catch (_) {}
    throw new Error(msg);
  }
  const data = await res.json();
  if (data.error) {
    const em = data.error;
    throw new Error(typeof em === 'string' ? em : (em.message || 'API error'));
  }
  if (!data.content?.length) throw new Error('Empty response from Claude.');
  if (data.stop_reason === 'max_tokens') {
    console.warn('[CS] max_tokens hit — attempting JSON repair');
  }
  return data.content.map(b => b.text || '').join('').trim();
}

// ============================================================
// Robust JSON parser — 3-tier repair + emergency closer
// ============================================================
function parseJSON(raw, label) {
  let s = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const a = s.indexOf('{');
  if (a === -1) throw new Error(label + ': No JSON found. Got: ' + s.slice(0, 250));
  const b = s.lastIndexOf('}');
  const jsonStr = (b > a) ? s.slice(a, b + 1) : s.slice(a);

  // Pass 1: direct
  try { return JSON.parse(jsonStr); } catch (_) {}
  // Pass 2: light repair
  const r1 = jsonStr.replace(/,(\s*[}\]])/g, '$1').replace(/[\x00-\x08\x0B\x0E-\x1F\x7F]/g, '');
  try { return JSON.parse(r1); } catch (_) {}
  // Pass 3: close truncated JSON
  try { return JSON.parse(closeJSON(jsonStr)); } catch (e) {
    throw new Error(label + ': all parse attempts failed. ' + e.message + '\nFirst 400: ' + jsonStr.slice(0, 400));
  }
}

function closeJSON(s) {
  const stack = [];
  let inStr = false, esc = false;
  for (const c of s) {
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }
  return s.trimEnd().replace(/,\s*$/, '') + stack.reverse().join('');
}

// ============================================================
// System prompts
// ============================================================
const SYSTEM = `You are a world-class senior UX architect, product strategist, and technical analyst.
Rules:
1. Base ALL output only on what is in the provided document — use exact names, features, workflows, roles.
2. Never use placeholder text like "Feature1" or "ComponentX".
3. Respond ONLY with the requested JSON — no markdown fences, no preamble.
4. Produce complete well-formed JSON — never truncate it.`;

const SYSTEM_ANALYST = `You are a world-class business analyst, competitive intelligence expert, and industry researcher.
You have deep knowledge of thousands of real software products, industry verticals, and competitive landscapes worldwide.
You know exactly which software tools are used in which industries and by which types of users.
Rules:
1. Only name REAL companies and products that actually exist in the market.
2. Be extremely precise about industry vertical + software category combination.
3. Respond ONLY with valid JSON — no markdown, no preamble, no explanation.
4. Produce complete well-formed JSON — never truncate.`;

// ============================================================
// Stage 1: Extract document brief
// ============================================================
async function extractDocumentBrief(docText) {
  let text = docText;
  if (docText.length > 14000) {
    text = docText.slice(0, 10000) + '\n\n[... middle omitted ...]\n\n' + docText.slice(-2000);
  }
  const prompt = `Read this document and extract a structured brief. Include every item you find.
Return ONLY this JSON:
{
  "productName": "exact product or project name",
  "domain": "specific industry domain",
  "complexity": "Low or Medium or High",
  "targetMarket": "who uses this (1 sentence)",
  "summary": "4-5 sentence executive summary",
  "coreModules": ["every major module, feature, screen, or component"],
  "userRoles": ["every user role or persona mentioned"],
  "keyWorkflows": ["each main workflow or process — 1 sentence each"],
  "dataEntities": ["every key data object or record type mentioned"],
  "integrations": ["any external systems, APIs, or tools mentioned"],
  "techStack": ["any technology, platform, or infrastructure mentioned"],
  "businessRules": ["important rules, validations, or constraints"],
  "painPoints": ["problems, gaps, or challenges described"]
}

DOCUMENT:
${text}`;
  const raw = await callClaude(SYSTEM, prompt.trim(), TOKENS.brief);
  return parseJSON(raw, 'Brief');
}

// ============================================================
// Stage 2 (competitor pipeline step A+B):
// Identify BOTH the business industry category AND software
// product category, then find exact matching competitors.
// ============================================================
async function identifyCategoriesAndCompetitors(docText, brief) {
  let text = docText;
  if (docText.length > 14000) {
    text = docText.slice(0, 10000) + '\n\n[... middle omitted ...]\n\n' + docText.slice(-2000);
  }

  // ── Step A: Identify industry + product category ──────────
  const categoryPrompt = `Read this document carefully.

Your job is to identify TWO things with maximum precision:
1. The PRIMARY BUSINESS INDUSTRY this product belongs to
   (e.g. "Waste Management", "Music Entertainment", "Healthcare Insurance",
   "Retail E-commerce", "Financial Services", "Logistics & Transportation",
   "Real Estate", "Education Technology", "Restaurant & Food Service" etc.)
   Be as specific as the document allows — not just "enterprise" or "technology".

2. The PRIMARY SOFTWARE PRODUCT CATEGORY this is
   (e.g. "Knowledge Management System", "Live Streaming Platform",
   "Prior Authorization Workflow Tool", "Fleet Management Software",
   "Content Management System", "Customer Portal", "Field Service Management" etc.)
   Be specific to what the software actually does — not just "SaaS" or "app".

Then answer these questions from the document:
- What is the CORE PROBLEM the product solves in this industry?
- What are the most SPECIFIC capabilities that define this product?
- Who EXACTLY uses this? (job title + company type)
- What would BREAK in the business if this product did not exist?
- Are any competitors, alternatives, or similar products mentioned anywhere in the document?

Return ONLY this JSON:
{
  "primaryBusinessIndustry": "The main industry this product serves — be very specific",
  "primaryBusinessIndustryExamples": ["3-4 example types of companies in this industry that would use this product"],
  "primarySoftwareCategory": "The exact type of software this is — be very specific about what it does",
  "coreProblemInIndustry": "2-3 sentences: what specific operational problem does this solve in the stated industry?",
  "exactCapabilities": ["6-10 specific capabilities that define this product — taken directly from the document"],
  "exactUserRole": "The exact job title and context of the main user",
  "exactUserCompanyProfile": "The exact profile of companies that use this",
  "whatBreaksWithout": "1-2 sentences: what operational problem occurs if this product does not exist?",
  "competitorsOrAlternativesInDoc": ["Any competitor, alternative tool, or similar product named anywhere in the document"],
  "industryPlusCategory": "Single precise label combining both: e.g. 'Knowledge Management for Waste Management Field Operations' or 'Live Streaming Platform for Fan Entertainment'"
}

DOCUMENT:
${text}`;

  const catRaw = await callClaude(SYSTEM_ANALYST, categoryPrompt.trim(), TOKENS.categoryPass);
  const categories = parseJSON(catRaw, 'Categories');

  // ── Step B: Find competitors using both categories ────────
  const compPrompt = `You are finding competitors for a product in a very specific industry + software niche.

=== EXACT PRODUCT CLASSIFICATION ===
Primary Business Industry: ${categories.primaryBusinessIndustry}
Industry examples: ${(categories.primaryBusinessIndustryExamples || []).join(', ')}
Primary Software Category: ${categories.primarySoftwareCategory}
Combined classification: ${categories.industryPlusCategory}

=== PRODUCT DETAILS ===
Product name: ${brief.productName}
Core problem solved in this industry: ${categories.coreProblemInIndustry}
Exact capabilities: ${(categories.exactCapabilities || []).join(', ')}
Primary user: ${categories.exactUserRole}
User company profile: ${categories.exactUserCompanyProfile}
What breaks without it: ${categories.whatBreaksWithout}
${categories.competitorsOrAlternativesInDoc?.length ? 'Competitors/alternatives named in the document itself: ' + categories.competitorsOrAlternativesInDoc.join(', ') : ''}

=== YOUR TASK ===
Find 4-5 REAL competitors. Match on BOTH dimensions:
1. They must be in the SAME BUSINESS INDUSTRY: "${categories.primaryBusinessIndustry}"
   OR they must be the dominant tool used by companies in that industry for this purpose.
2. They must provide the SAME TYPE OF SOFTWARE: "${categories.primarySoftwareCategory}"
   OR solve the SAME CORE PROBLEM in the same industry context.

STRICT RULES:
- If competitors are named in the document, ALWAYS include them.
- A competitor must overlap on at least one of: same industry vertical, same software category, same core problem, or same user type.
- Do NOT suggest generic enterprise tools (like Salesforce or Microsoft Teams) UNLESS they are genuinely the dominant solution for "${categories.primarySoftwareCategory}" in "${categories.primaryBusinessIndustry}".
- Prioritize tools specifically designed for or widely adopted in "${categories.primaryBusinessIndustry}".
- Be honest: if a tool is industry-leading in this space, say so even if it's a strong competitor.
- Use ONLY real company and product names that exist in the market.

Return ONLY this JSON:
{
  "industryCategory": "${categories.primaryBusinessIndustry}",
  "softwareCategory": "${categories.primarySoftwareCategory}",
  "competitors": [
    {
      "name": "Real product or company name",
      "website": "their actual domain e.g. veolia.com",
      "type": "Direct or Indirect or Alternative",
      "industryFit": "How well they serve the ${categories.primaryBusinessIndustry} industry specifically (1 sentence)",
      "matchReason": "Exactly which features or use cases overlap with ${brief.productName} (1 sentence)",
      "strength": "Their strongest competitive capability in this context (1-2 sentences)",
      "weakness": "Their most significant gap compared to ${brief.productName} for this use case (1 sentence)",
      "marketPosition": "Market leader or Niche player or Emerging challenger or Widely used alternative",
      "differentiation": "How ${brief.productName} specifically outperforms or differs from this competitor (1-2 sentences)"
    }
  ]
}`;

  const compRaw = await callClaude(SYSTEM_ANALYST, compPrompt.trim(), TOKENS.competitors);
  const result = parseJSON(compRaw, 'Competitors');
  // Attach categories for rendering
  result.industryCategory = categories.primaryBusinessIndustry;
  result.softwareCategory  = categories.primarySoftwareCategory;
  result.combinedLabel     = categories.industryPlusCategory;
  return result;
}

// ============================================================
// Information Architecture — UI screens, navigation, screen flow
// ============================================================
export async function getArchitecture(docText, brief) {
  // Give Claude the raw document text so it can identify every actual screen
  let text = docText;
  if (docText.length > 14000) {
    text = docText.slice(0, 10000) + '\n\n[... middle omitted ...]\n\n' + docText.slice(-2000);
  }

  const prompt = `You are a senior UX designer analyzing a product document.
Your task: produce the Information Architecture (IA) — a map of every UI screen, grouped into sections, with navigation flows.
This is a UX deliverable, NOT a technical system diagram.

PRODUCT: ${brief.productName || ''}
USER ROLES: ${(brief.userRoles || []).join(', ')}
MODULES FROM DOCUMENT: ${(brief.coreModules || []).join(', ')}
WORKFLOWS: ${(brief.keyWorkflows || []).slice(0, 5).join(' | ')}

DOCUMENT TEXT:
${text}

Instructions:
1. Read the document and identify every screen, page, form, modal, list, editor, dashboard, and settings panel.
2. Group screens into top-level navigation sections.
3. For each screen note: what the user does there, what type of screen it is, what it links to.
4. List the 3-5 primary end-to-end flows a user takes through the screens.

Return ONLY valid JSON in this exact structure — keep it concise, max 5 sections, max 4 screens per section:
{
  "productName": "${brief.productName || 'Product'}",
  "totalScreens": 0,
  "iaDescription": "2-3 sentences: how many screens total, how they are organised, what navigation model is used",
  "sections": [
    {
      "sectionName": "Section name from document",
      "sectionIcon": "emoji",
      "sectionPurpose": "what this section does",
      "userRole": "who uses this",
      "screens": [
        {
          "screenName": "Screen name from document",
          "screenType": "Dashboard or List View or Form or Editor or Detail View or Modal or Settings or Report",
          "screenPurpose": "what user does here",
          "keyActions": ["action 1", "action 2"],
          "navigatesTo": ["linked screen name"],
          "subScreens": []
        }
      ]
    }
  ],
  "primaryFlows": [
    {
      "flowName": "Flow name",
      "steps": ["Screen A → Screen B → Screen C"]
    }
  ]
}`;

  const raw = await callClaude(SYSTEM, prompt.trim(), TOKENS.architecture);
  return parseJSON(raw, 'Architecture');
}

// ============================================================
// User Journey
// ============================================================
export async function getUserJourney(brief) {
  const prompt = `Using the document brief below, create a realistic user journey map.

BRIEF:
${JSON.stringify(brief)}

Return ONLY this JSON:
{
  "persona": "Specific persona using a real role from userRoles",
  "goal": "Specific goal taken directly from keyWorkflows",
  "steps": [
    {
      "name": "Step name matching actual workflow steps",
      "detail": "What the user does and what the system does — reference real features from coreModules",
      "emotion": "positive or neutral or negative",
      "emotionLabel": "Excited or Confident or Curious or Overwhelmed or Frustrated or Relieved or Satisfied or Confused"
    }
  ]
}

Rules: 6-8 steps. Real screen names from coreModules. Vary emotions. Follow keyWorkflows order.`;
  const raw = await callClaude(SYSTEM, prompt.trim(), TOKENS.journey);
  return parseJSON(raw, 'Journey');
}

// ============================================================
// UX Recommendations
// ============================================================
export async function getRecommendations(brief) {
  const prompt = `Using the document brief below, generate expert UX recommendations.

BRIEF:
${JSON.stringify(brief)}

Return ONLY this JSON:
{
  "recommendations": [
    {
      "priority": "High or Medium or Low",
      "category": "Navigation or Information Architecture or Workflow or Accessibility or Performance or Error Handling or Onboarding or Search or Data Visualization or Mobile",
      "title": "Specific recommendation title",
      "problem": "The specific UX problem or gap found in the document (1 sentence)",
      "solution": "Specific actionable solution referencing actual features from coreModules (2 sentences)",
      "impact": "The business or user outcome this improves (1 sentence)"
    }
  ]
}

Rules: 5-6 items. Every problem references something in the brief. At least 2 High priority. Cover different categories.`;
  const raw = await callClaude(SYSTEM, prompt.trim(), TOKENS.recommendations);
  return parseJSON(raw, 'Recommendations');
}

export async function getSummary(brief) {
  return {
    summary:      brief.summary      || '',
    productName:  brief.productName  || 'Unknown Product',
    domain:       brief.domain       || 'General',
    complexity:   brief.complexity   || 'Medium',
    targetMarket: brief.targetMarket || '',
  };
}

// ============================================================
// Master orchestration
// ============================================================
export async function runAnalysis(docText, selected, onProgress) {
  if (!onProgress) onProgress = () => {};
  const result = {};

  // Stage 1: extract brief
  onProgress('ls1', 'on');
  let brief;
  try {
    brief = await extractDocumentBrief(docText);
    Object.assign(result, {
      summary:      brief.summary,
      productName:  brief.productName,
      domain:       brief.domain,
      complexity:   brief.complexity,
      targetMarket: brief.targetMarket,
    });
    onProgress('ls1', 'done');
  } catch (e) {
    onProgress('ls1', 'done');
    throw new Error('Failed to parse document: ' + e.message);
  }

  // Stage 2: parallel analyses
  const tasks = [];

  if (selected.has('architecture')) {
    onProgress('ls2', 'on');
    tasks.push(
      getArchitecture(docText, brief)
        .then(d => { result.architecture = d; onProgress('ls2', 'done'); })
        .catch(e => {
          console.error('[CS] Architecture FAILED:', e.message);
          // Set a minimal fallback so the tab still renders
          result.architecture = {
            productName: brief.productName || '',
            totalScreens: 0,
            iaDescription: 'Architecture analysis encountered an error: ' + e.message,
            sections: [],
            primaryFlows: []
          };
          onProgress('ls2', 'done');
        })
    );
  }

  if (selected.has('journey')) {
    onProgress('ls3', 'on');
    tasks.push(
      getUserJourney(brief)
        .then(d => { result.userJourney = d; onProgress('ls3', 'done'); })
        .catch(e => { console.warn('[CS] journey:', e.message); onProgress('ls3', 'done'); })
    );
  }

  if (selected.has('competitors')) {
    onProgress('ls4', 'on');
    tasks.push(
      identifyCategoriesAndCompetitors(docText, brief)
        .then(d => {
          result.competitors      = d.competitors || [];
          result.industryCategory = d.industryCategory || '';
          result.softwareCategory = d.softwareCategory || '';
          result.combinedLabel    = d.combinedLabel || '';
          onProgress('ls4', 'done');
        })
        .catch(e => { console.warn('[CS] competitors:', e.message); onProgress('ls4', 'done'); })
    );
  }

  if (selected.has('recommendations')) {
    onProgress('ls5', 'on');
    tasks.push(
      getRecommendations(brief)
        .then(d => { result.recommendations = d.recommendations || []; onProgress('ls5', 'done'); })
        .catch(e => { console.warn('[CS] recs:', e.message); onProgress('ls5', 'done'); })
    );
  }

  await Promise.allSettled(tasks);
  return result;
}
