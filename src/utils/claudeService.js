/**
 * claudeService.js — Local Analysis Engine
 *
 * Analyses documents entirely in-browser using text processing heuristics.
 * No API key or network calls required — everything runs locally.
 *
 * Pipeline:
 *  1. extractLocalBrief   — detect product name, domain, modules, roles, workflows
 *  2. buildLocalArchitecture — construct IA from document headings & bullets
 *  3. buildLocalJourney      — build user journey from workflow patterns
 *  4. buildLocalCompetitors  — map domain → real competitor list
 *  5. buildLocalRecommendations — generate UX recommendations from content signals
 */

// ─────────────────────────────────────────────────────────────
// Text utilities
// ─────────────────────────────────────────────────────────────

function getLines(text) {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

function getSentences(text) {
  return text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
}

function countWords(text) {
  return (text.match(/\b\w+\b/g) || []).length;
}

/** Extract heading-like lines from text */
function extractHeadings(text) {
  const lines = getLines(text);
  return lines.filter(line => {
    if (/^#{1,4}\s+/.test(line)) return true;                              // Markdown headings
    if (line === line.toUpperCase() && line.length > 3 && line.length < 80 && /[A-Z]/.test(line)) return true; // ALL CAPS
    if (line.length < 60 && !line.endsWith('.') && !/^[-•*▪▸→✓✔\d]/.test(line) && /^[A-Z]/.test(line)) return true;
    return false;
  })
    .map(h => h.replace(/^#+\s*/, '').replace(/[*_]/g, '').trim())
    .filter(h => h.length > 2 && h.length < 80);
}

/** Extract bullet-point items */
function extractBullets(text) {
  const lines = getLines(text);
  return lines
    .filter(line => /^[-•*▪▸→✓✔]|\d+[.\)]\s/.test(line))
    .map(line => line.replace(/^[-•*▪▸→✓✔]|\d+[.\)]\s+/, '').trim())
    .filter(b => b.length > 5 && b.length < 200);
}

// ─────────────────────────────────────────────────────────────
// Product name detection
// ─────────────────────────────────────────────────────────────

function detectProductName(text) {
  const patterns = [
    /(?:product|app|application|system|platform|solution|project|tool)\s*[:\-]\s*([A-Z][A-Za-z0-9\s\-]{2,40})/i,
    /^([A-Z][A-Za-z0-9\s]{2,30})\s*[-–—]\s/m,
    /(?:called|named|built|creating|developing)\s+["']?([A-Z][A-Za-z0-9\s\-]{2,30})["']?/i,
    /^#\s+(.+)$/m,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) return m[1].trim().slice(0, 50);
  }
  const headings = extractHeadings(text);
  if (headings.length > 0) return headings[0].slice(0, 50);
  return 'Document Analysis';
}

// ─────────────────────────────────────────────────────────────
// Domain / industry detection
// ─────────────────────────────────────────────────────────────

const DOMAIN_KEYWORDS = {
  'Healthcare':               ['patient', 'doctor', 'medical', 'hospital', 'clinic', 'health', 'ehr', 'emr', 'diagnosis', 'treatment', 'pharmacy', 'nurse', 'physician', 'appointment', 'prescription'],
  'Finance & Banking':        ['payment', 'transaction', 'bank', 'financial', 'invoice', 'accounting', 'budget', 'tax', 'loan', 'credit', 'debit', 'ledger', 'payroll', 'reconciliation'],
  'E-commerce & Retail':      ['product', 'cart', 'checkout', 'order', 'shipping', 'inventory', 'store', 'shop', 'purchase', 'catalog', 'sku', 'warehouse', 'fulfilment'],
  'Logistics & Supply Chain': ['shipment', 'delivery', 'tracking', 'fleet', 'route', 'cargo', 'freight', 'dispatch', 'driver', 'logistics', 'courier', 'parcel'],
  'Education & E-Learning':   ['course', 'student', 'teacher', 'learning', 'quiz', 'assignment', 'grade', 'curriculum', 'classroom', 'enrollment', 'lesson', 'lms'],
  'Real Estate':              ['property', 'listing', 'agent', 'tenant', 'landlord', 'lease', 'mortgage', 'apartment', 'rental', 'unit', 'occupancy'],
  'HR & Workforce':           ['employee', 'hr', 'payroll', 'onboarding', 'leave', 'attendance', 'performance', 'recruitment', 'hiring', 'applicant', 'workforce'],
  'CRM & Sales':              ['lead', 'opportunity', 'pipeline', 'crm', 'sales', 'deal', 'prospect', 'contact', 'quote', 'proposal', 'follow-up'],
  'Project Management':       ['task', 'project', 'milestone', 'sprint', 'deadline', 'team', 'kanban', 'backlog', 'assignee', 'roadmap', 'epic'],
  'SaaS Platform':            ['subscription', 'dashboard', 'analytics', 'settings', 'integration', 'api', 'tenant', 'plan', 'saas', 'feature', 'module'],
};

function detectDomain(text) {
  const lower = text.toLowerCase();
  const scores = {};
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    scores[domain] = keywords.filter(k => lower.includes(k)).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : 'Technology Platform';
}

// ─────────────────────────────────────────────────────────────
// User role detection
// ─────────────────────────────────────────────────────────────

const ROLE_PATTERNS = [
  /\badmin(?:istrator)?\b/gi,
  /\bmanager\b/gi,
  /\bsupervisor\b/gi,
  /\bcustomer\b/gi,
  /\bclient\b/gi,
  /\bagent\b/gi,
  /\boperator\b/gi,
  /\bstaff\b/gi,
  /\bdoctor\b|\bphysician\b|\bnurse\b|\bclinician\b/gi,
  /\bdriver\b|\bcourier\b/gi,
  /\bvendor\b|\bsupplier\b/gi,
  /\breviewer\b|\bauditor\b|\bapprover\b/gi,
  /\bstudent\b|\blearner\b/gi,
  /\binstructor\b|\bteacher\b/gi,
  /\bend[\s-]user\b|\bregular[\s-]user\b|\buser\b/gi,
];

function detectUserRoles(text) {
  const found = new Set();
  for (const pattern of ROLE_PATTERNS) {
    const matches = text.match(pattern) || [];
    matches.forEach(m => {
      const clean = m.trim();
      found.add(clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase());
    });
  }
  const roles = Array.from(found).slice(0, 6);
  return roles.length > 0 ? roles : ['Admin', 'User', 'Manager'];
}

// ─────────────────────────────────────────────────────────────
// Module / feature extraction
// ─────────────────────────────────────────────────────────────

const STOP_WORDS = new Set(['the','a','an','and','or','but','if','then','when','where','how','why','what','which','who','in','on','at','to','for','of','with','by','from','up','about','into','through','during','before','after','above','below','between','out','off','over','under','again','further','once','this','that','these','those','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','shall','can','need','each','every','any','all','both','few','more','most','some','such','no','not','only','own','same','so','than','too','very']);

function extractModules(text) {
  const headings = extractHeadings(text).slice(1); // skip first (likely product name)
  const bullets  = extractBullets(text).slice(0, 25);

  const candidates = [...headings, ...bullets]
    .filter(m => m.length > 3 && m.length < 80)
    .filter(m => {
      const firstWord = m.split(/\s+/)[0].toLowerCase();
      return !STOP_WORDS.has(firstWord);
    });

  // Deduplicate (case-insensitive)
  const seen = new Set();
  const unique = [];
  for (const m of candidates) {
    const key = m.toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(m); }
  }

  return unique.slice(0, 12).length > 0 ? unique.slice(0, 12) : ['Dashboard', 'User Management', 'Reports', 'Settings'];
}

// ─────────────────────────────────────────────────────────────
// Workflow extraction
// ─────────────────────────────────────────────────────────────

const WORKFLOW_KEYWORDS = ['process', 'flow', 'step', 'submit', 'approve', 'create', 'update', 'manage', 'generate', 'track', 'review', 'complete', 'assign', 'schedule', 'upload', 'download', 'verify'];

function extractWorkflows(text) {
  const sentences = getSentences(text);
  const workflows = sentences
    .filter(s => WORKFLOW_KEYWORDS.some(k => s.toLowerCase().includes(k)))
    .map(s => s.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(s => s.length > 20 && s.length < 180)
    .slice(0, 6);

  return workflows.length > 0
    ? workflows
    : [
        'User logs in and navigates to the main dashboard',
        'Creates and submits a new record through the form',
        'Pending items are reviewed and approved by a manager',
        'Generates reports and exports data for stakeholders',
      ];
}

// ─────────────────────────────────────────────────────────────
// Summary generation
// ─────────────────────────────────────────────────────────────

function generateSummary(text, productName, domain, modules, userRoles) {
  const wordCount   = countWords(text);
  const complexity  = wordCount > 2000 ? 'High' : wordCount > 500 ? 'Medium' : 'Low';
  const modList     = modules.slice(0, 3).join(', ');
  const roleList    = userRoles.slice(0, 2).join(' and ');

  const summary =
    `${productName} is a ${domain.toLowerCase()} platform designed to streamline operations through digital automation. ` +
    `The system provides core capabilities including ${modList}, serving ${roleList} roles with structured, workflow-driven interactions. ` +
    `The document outlines key modules, user interactions, and requirements for a ${complexity.toLowerCase()}-complexity implementation. ` +
    `The platform aims to improve visibility, reduce manual effort, and deliver measurable operational value to its target users.`;

  return { summary, complexity };
}

// ─────────────────────────────────────────────────────────────
// Brief extraction (Stage 1)
// ─────────────────────────────────────────────────────────────

function extractLocalBrief(docText) {
  const productName = detectProductName(docText);
  const domain      = detectDomain(docText);
  const modules     = extractModules(docText);
  const userRoles   = detectUserRoles(docText);
  const workflows   = extractWorkflows(docText);
  const { summary, complexity } = generateSummary(docText, productName, domain, modules, userRoles);

  const roleStr    = userRoles.slice(0, 2).join(' and ');
  const targetMarket = `${domain} organisations requiring ${roleStr} management`;

  const DATA_WORDS = ['record', 'entry', 'form', 'report', 'document', 'profile', 'account', 'order', 'request', 'ticket', 'invoice', 'case', 'task'];
  const lower = docText.toLowerCase();
  const dataEntities = DATA_WORDS
    .filter(k => lower.includes(k))
    .map(k => k.charAt(0).toUpperCase() + k.slice(1))
    .slice(0, 6);

  return {
    productName,
    domain,
    complexity,
    targetMarket,
    summary,
    coreModules:   modules,
    userRoles,
    keyWorkflows:  workflows,
    dataEntities:  dataEntities.length > 0 ? dataEntities : ['Record', 'Report', 'Profile'],
    integrations:  [],
    techStack:     [],
    businessRules: [],
    painPoints:    [],
  };
}

// ─────────────────────────────────────────────────────────────
// Architecture builder (Stage 2)
// ─────────────────────────────────────────────────────────────

const SECTION_ICONS = ['📋', '📊', '👥', '📝', '🔧', '🗂', '📬', '🔍'];

function buildLocalArchitecture(docText, brief) {
  const modules = brief.coreModules.slice(0, 4);
  const sections = [];

  // 1. Dashboard section (always present)
  sections.push({
    sectionName:    'Dashboard & Home',
    sectionIcon:    '🏠',
    sectionPurpose: 'Central landing area with key metrics, activity feed, and navigation shortcuts',
    userRole:       brief.userRoles[0] || 'User',
    screens: [
      {
        screenName:    'Main Dashboard',
        screenType:    'Dashboard',
        screenPurpose: 'Overview of key metrics, recent activity, pending tasks, and quick-action shortcuts',
        keyActions:    ['View statistics', 'Access recent items', 'Quick create'],
        navigatesTo:   modules.slice(0, 3),
        subScreens:    [],
      },
      {
        screenName:    'Notifications Centre',
        screenType:    'List View',
        screenPurpose: 'View, filter, and act on all system notifications and alerts in one place',
        keyActions:    ['Mark as read', 'Filter by type', 'Clear all'],
        navigatesTo:   ['Main Dashboard'],
        subScreens:    [],
      },
    ],
  });

  // 2. One section per major module
  modules.forEach((module, idx) => {
    sections.push({
      sectionName:    module,
      sectionIcon:    SECTION_ICONS[idx % SECTION_ICONS.length],
      sectionPurpose: `Manage and track all ${module.toLowerCase()} operations from one place`,
      userRole:       brief.userRoles[idx % brief.userRoles.length] || 'User',
      screens: [
        {
          screenName:    `${module} List`,
          screenType:    'List View',
          screenPurpose: `Browse, search, sort, and filter all ${module.toLowerCase()} records`,
          keyActions:    ['Search & filter', 'Create new', 'Bulk actions', 'Export CSV'],
          navigatesTo:   [`${module} Detail`, `Create ${module}`],
          subScreens:    [],
        },
        {
          screenName:    `${module} Detail`,
          screenType:    'Detail View',
          screenPurpose: `View complete record information, history, and take actions on a single ${module.toLowerCase()}`,
          keyActions:    ['Edit record', 'Change status', 'Add comment', 'Delete'],
          navigatesTo:   [`${module} List`, 'Edit Form'],
          subScreens:    [],
        },
      ],
    });
  });

  // 3. Reports section (if document mentions reporting)
  if (docText.toLowerCase().includes('report') || docText.toLowerCase().includes('analytics')) {
    sections.push({
      sectionName:    'Reports & Analytics',
      sectionIcon:    '📊',
      sectionPurpose: 'View data insights, generate custom reports, and export data',
      userRole:       brief.userRoles.find(r => /manager|admin|supervisor/i.test(r)) || brief.userRoles[0] || 'Manager',
      screens: [
        {
          screenName:    'Reports Dashboard',
          screenType:    'Dashboard',
          screenPurpose: 'Interactive charts and KPIs for at-a-glance business performance monitoring',
          keyActions:    ['Filter by date range', 'Export PDF', 'Schedule report'],
          navigatesTo:   ['Custom Report Builder'],
          subScreens:    [],
        },
        {
          screenName:    'Custom Report Builder',
          screenType:    'Editor',
          screenPurpose: 'Build, save, and schedule custom reports from available data fields',
          keyActions:    ['Select fields', 'Apply filters', 'Preview', 'Save & share'],
          navigatesTo:   ['Reports Dashboard'],
          subScreens:    [],
        },
      ],
    });
  }

  // 4. Settings section (always present)
  sections.push({
    sectionName:    'Settings & Administration',
    sectionIcon:    '⚙️',
    sectionPurpose: 'System configuration, user management, roles, permissions, and preferences',
    userRole:       brief.userRoles.find(r => /admin/i.test(r)) || 'Admin',
    screens: [
      {
        screenName:    'User Management',
        screenType:    'List View',
        screenPurpose: 'Add, edit, deactivate users and manage role-based access permissions',
        keyActions:    ['Add user', 'Edit role', 'Deactivate', 'Reset password'],
        navigatesTo:   ['User Profile', 'Roles & Permissions'],
        subScreens:    [],
      },
      {
        screenName:    'System Settings',
        screenType:    'Settings',
        screenPurpose: 'Configure global system preferences, notifications, and integrations',
        keyActions:    ['Save changes', 'Reset defaults', 'Test connection'],
        navigatesTo:   ['Main Dashboard'],
        subScreens:    [],
      },
    ],
  });

  const totalScreens = sections.reduce((t, s) => t + s.screens.length, 0);

  const primaryFlows = [
    {
      flowName: `New ${modules[0] || 'Record'} Creation`,
      steps:    [`Main Dashboard → ${modules[0] || 'Module'} List → Create Form → Review & Submit → Confirmation`],
    },
    {
      flowName: 'User Onboarding',
      steps:    ['Login → Password Setup → Dashboard Tour → Profile Complete → First Task'],
    },
    {
      flowName: 'Review & Approval Workflow',
      steps:    ['Notifications → Pending Items List → Record Detail → Approve / Reject → Status Updated'],
    },
    {
      flowName: 'Report Generation',
      steps:    ['Reports Dashboard → Select Filters → Preview → Export / Schedule Delivery'],
    },
  ];

  return {
    productName:   brief.productName,
    totalScreens,
    iaDescription: `${brief.productName} is structured into ${sections.length} main navigation sections with ${totalScreens} key screens. ` +
      `The information architecture follows a hub-and-spoke model with the Dashboard as the central entry point. ` +
      `Navigation is organised by functional area — each section provides list, detail, and form views for complete record management.`,
    sections,
    primaryFlows,
  };
}

// ─────────────────────────────────────────────────────────────
// User Journey builder (Stage 3)
// ─────────────────────────────────────────────────────────────

function buildLocalJourney(brief) {
  const persona = brief.userRoles[0] || 'Primary User';
  const module  = brief.coreModules[0] || 'core feature';
  const goal    = brief.keyWorkflows[0] || `Complete a ${module} task end-to-end`;

  const steps = [
    {
      name:         'Login & Authentication',
      detail:       `The ${persona} navigates to the application and signs in with their credentials. The system validates access and routes them to a personalised dashboard showing pending tasks and recent activity.`,
      emotion:      'positive',
      emotionLabel: 'Confident',
    },
    {
      name:         'Dashboard Overview',
      detail:       `The ${persona} scans the dashboard to understand their current workload, upcoming deadlines, and unread notifications. They locate the ${module} section from the main navigation menu.`,
      emotion:      'neutral',
      emotionLabel: 'Curious',
    },
    {
      name:         `Initiate ${module}`,
      detail:       `The ${persona} clicks the create button to start a new ${module} entry. They begin filling in the required fields, drawing on context from previous records or external documents.`,
      emotion:      'neutral',
      emotionLabel: 'Focused',
    },
    {
      name:         'Data Entry & Validation',
      detail:       `While filling in the form, the ${persona} encounters required fields that need information they must look up elsewhere. Inline validation flags errors before submission, which requires some back-and-forth.`,
      emotion:      'negative',
      emotionLabel: 'Frustrated',
    },
    {
      name:         'Review & Submit',
      detail:       `After completing all required fields, the ${persona} reviews the summary screen to verify accuracy before clicking submit. The system triggers the next step in the approval workflow automatically.`,
      emotion:      'positive',
      emotionLabel: 'Confident',
    },
    {
      name:         'Awaiting Processing',
      detail:       `A confirmation screen shows the submission was received. The ${persona} is now waiting for the workflow to progress — either auto-processing or review by another team member.`,
      emotion:      'neutral',
      emotionLabel: 'Satisfied',
    },
    {
      name:         'Notification & Resolution',
      detail:       `The ${persona} receives a notification that their submission has been reviewed and resolved. They access the record to see the outcome, any comments left by the reviewer, and suggested next steps.`,
      emotion:      'positive',
      emotionLabel: 'Relieved',
    },
  ];

  return { persona, goal, steps };
}

// ─────────────────────────────────────────────────────────────
// Competitor map (domain → real competitors)
// ─────────────────────────────────────────────────────────────

const COMPETITOR_MAP = {
  'Healthcare': [
    { name: 'Epic Systems', website: 'epic.com', type: 'Direct', marketPosition: 'Market leader',
      strength: 'Industry-leading EHR with comprehensive clinical workflows and broad enterprise hospital adoption worldwide.',
      weakness: 'Extremely complex to implement, very expensive licensing, and often overwhelming for smaller clinics or specialised use cases.',
      differentiation: 'Designed for focused workflows with a simpler UX, faster onboarding, and lower total cost of ownership.' },
    { name: 'Cerner (Oracle Health)', website: 'cerner.com', type: 'Direct', marketPosition: 'Market leader',
      strength: 'Robust clinical data platform with strong population health management and analytics capabilities at scale.',
      weakness: 'Legacy interface and complex configuration that requires significant IT resources and ongoing vendor support.',
      differentiation: 'Modern UI and rapid deployment reduce training burden and accelerate time-to-value for clinical teams.' },
    { name: 'Athenahealth', website: 'athenahealth.com', type: 'Indirect', marketPosition: 'Niche player',
      strength: 'Cloud-native practice management and billing for ambulatory care with strong revenue cycle features.',
      weakness: 'Limited depth for inpatient or specialised workflows beyond primary care settings.',
      differentiation: 'Provides deeper domain-specific features tailored to the exact operational context described in the document.' },
  ],
  'Finance & Banking': [
    { name: 'QuickBooks', website: 'quickbooks.intuit.com', type: 'Indirect', marketPosition: 'Market leader',
      strength: 'Widely adopted SMB accounting tool with strong bookkeeping, invoicing, and bank reconciliation features.',
      weakness: 'Not designed for complex multi-entity, compliance-heavy, or enterprise-grade financial workflows.',
      differentiation: 'Supports the specific financial operations described with tighter workflow control and audit compliance.' },
    { name: 'Sage Intacct', website: 'sage.com', type: 'Direct', marketPosition: 'Widely used alternative',
      strength: 'Cloud-based financial management with strong multi-entity accounting and reporting for mid-market companies.',
      weakness: 'Steep learning curve and higher licensing costs with limited flexibility for highly customised workflows.',
      differentiation: 'Purpose-built for the financial processes described with faster user adoption and simpler configuration.' },
    { name: 'Xero', website: 'xero.com', type: 'Alternative', marketPosition: 'Niche player',
      strength: 'User-friendly accounting with real-time bank feeds and a strong third-party ecosystem for SMBs.',
      weakness: 'Limited advanced reporting and not suited to the complex approval or compliance workflows described.',
      differentiation: 'Provides deeper process automation and compliance features aligned with the described requirements.' },
  ],
  'E-commerce & Retail': [
    { name: 'Shopify', website: 'shopify.com', type: 'Alternative', marketPosition: 'Market leader',
      strength: 'Leading e-commerce platform with a massive app ecosystem, easy storefront creation, and strong payment processing.',
      weakness: 'Limited B2B workflows, custom business logic, and complex order management beyond standard retail.',
      differentiation: 'Designed for the specific order management and inventory operations described, with no-code workflow customisation.' },
    { name: 'Magento (Adobe Commerce)', website: 'business.adobe.com', type: 'Direct', marketPosition: 'Widely used alternative',
      strength: 'Highly customisable enterprise e-commerce platform supporting complex catalogues, multi-store, and B2B commerce.',
      weakness: 'Requires significant developer resources to deploy and maintain; complex for non-technical product managers.',
      differentiation: 'Delivers a more user-friendly management interface with purpose-built tools for the described retail workflows.' },
    { name: 'WooCommerce', website: 'woocommerce.com', type: 'Alternative', marketPosition: 'Widely used alternative',
      strength: 'Open-source WordPress plugin with complete ownership, large extension library, and zero licensing cost.',
      weakness: 'Performance and scalability issues at high volume; ongoing maintenance requires developer involvement.',
      differentiation: 'Offers managed, scalable infrastructure and built-in analytics to handle the operational complexity described.' },
  ],
  'Logistics & Supply Chain': [
    { name: 'Onfleet', website: 'onfleet.com', type: 'Direct', marketPosition: 'Niche player',
      strength: 'Last-mile delivery management with real-time tracking, driver dispatch, and delivery analytics for urban fleets.',
      weakness: 'Limited warehouse management and supply chain visibility beyond the last-mile execution layer.',
      differentiation: 'Provides end-to-end supply chain visibility from warehouse to delivery as described in the document.' },
    { name: 'project44', website: 'project44.com', type: 'Direct', marketPosition: 'Emerging challenger',
      strength: 'Advanced supply chain visibility with carrier integration, predictive ETAs, and exception management at scale.',
      weakness: 'Enterprise pricing and implementation complexity makes it inaccessible for mid-market logistics operators.',
      differentiation: 'Delivers comparable visibility with simpler setup and a UX tailored to the workflows described.' },
    { name: 'Samsara', website: 'samsara.com', type: 'Indirect', marketPosition: 'Market leader',
      strength: 'Connected operations platform for fleet management, driver safety, and equipment monitoring at scale.',
      weakness: 'Hardware-dependent and primarily focused on physical fleet telemetry rather than logistics workflow management.',
      differentiation: 'Focuses on the operational workflow layer rather than hardware, adaptable to the use cases described.' },
  ],
  'Education & E-Learning': [
    { name: 'Canvas LMS', website: 'instructure.com', type: 'Direct', marketPosition: 'Market leader',
      strength: 'Leading LMS used by universities and K–12 with strong course creation, grading, and communication tools.',
      weakness: 'Heavy and complex for corporate learning or specialised training outside academic institutions.',
      differentiation: 'Built for the learning context described, with a streamlined UX that reduces cognitive load for learners.' },
    { name: 'Moodle', website: 'moodle.org', type: 'Alternative', marketPosition: 'Widely used alternative',
      strength: 'Open-source LMS with high customisability, active community support, and zero licensing cost.',
      weakness: 'Dated interface, requires technical resources to host, and lacks modern UX and engagement patterns.',
      differentiation: 'Provides a modern, maintained interface with the engagement and tracking features described.' },
    { name: 'Teachable', website: 'teachable.com', type: 'Indirect', marketPosition: 'Niche player',
      strength: 'Simple course creation and monetisation platform for individual creators and small training providers.',
      weakness: 'Limited organisation-level management, reporting, and compliance features for institutional learning programmes.',
      differentiation: 'Supports institutional learning workflows with role-based access and structured curricula as described.' },
  ],
  'Real Estate': [
    { name: 'Buildium', website: 'buildium.com', type: 'Direct', marketPosition: 'Market leader',
      strength: 'Full-featured property management with tenant screening, rent collection, maintenance tracking, and accounting.',
      weakness: 'Complex pricing tiers and a bloated feature set that overwhelms smaller property managers or specialised use cases.',
      differentiation: 'Focused on the specific property workflows described with a leaner, faster-to-adopt interface.' },
    { name: 'AppFolio', website: 'appfolio.com', type: 'Direct', marketPosition: 'Widely used alternative',
      strength: 'Modern, mobile-first property management with AI leasing tools and strong resident communication features.',
      weakness: 'Minimum unit thresholds and premium pricing limits access for small-to-mid portfolio managers.',
      differentiation: 'Provides comparable modern features with a more accessible pricing model aligned to the portfolio described.' },
    { name: 'CoStar', website: 'costar.com', type: 'Indirect', marketPosition: 'Market leader',
      strength: 'Leading commercial real estate data and analytics with market comps, deal tracking, and listing intelligence.',
      weakness: 'Primarily a data and research tool — not an operational lease or property management system.',
      differentiation: 'Delivers the operational management layer that CoStar lacks, covering the day-to-day workflows described.' },
  ],
  'HR & Workforce': [
    { name: 'BambooHR', website: 'bamboohr.com', type: 'Direct', marketPosition: 'Market leader',
      strength: 'User-friendly HR platform covering employee data, onboarding, performance, and e-signatures for SMBs.',
      weakness: 'Limited advanced payroll and compliance features for complex, multi-jurisdiction, or high-volume workforces.',
      differentiation: 'Provides deeper workflow automation and compliance capabilities aligned with the HR operations described.' },
    { name: 'Workday', website: 'workday.com', type: 'Indirect', marketPosition: 'Market leader',
      strength: 'Enterprise-grade HCM, payroll, and finance with deep analytics and global compliance coverage at scale.',
      weakness: 'Very expensive, highly complex to implement, and over-engineered for organisations without large IT teams.',
      differentiation: 'Delivers Workday-calibre HR process management at a fraction of the implementation cost and complexity.' },
    { name: 'Gusto', website: 'gusto.com', type: 'Alternative', marketPosition: 'Niche player',
      strength: 'Full-service payroll, benefits, and compliance for small businesses with a simple, guided user experience.',
      weakness: 'Limited performance management, talent modules, and customisation for complex HR programme requirements.',
      differentiation: 'Addresses the full HR lifecycle including talent and performance management workflows described.' },
  ],
  'CRM & Sales': [
    { name: 'Salesforce', website: 'salesforce.com', type: 'Indirect', marketPosition: 'Market leader',
      strength: 'World\'s largest CRM with virtually unlimited customisation, integrations, and a mature app ecosystem.',
      weakness: 'Extremely high cost, complex to configure without expertise, and often over-scoped for focused use cases.',
      differentiation: 'Provides focused CRM capabilities without the overhead — faster deployment and lower total cost of ownership.' },
    { name: 'HubSpot CRM', website: 'hubspot.com', type: 'Direct', marketPosition: 'Widely used alternative',
      strength: 'Free-to-start CRM with strong marketing automation, email sequences, and an intuitive sales pipeline interface.',
      weakness: 'Advanced features locked behind expensive tiers; limited for complex B2B sales process customisation.',
      differentiation: 'Delivers the B2B sales workflow depth described with more flexible pricing and custom pipeline logic.' },
    { name: 'Pipedrive', website: 'pipedrive.com', type: 'Direct', marketPosition: 'Niche player',
      strength: 'Visual, pipeline-centric CRM built for sales teams with strong deal tracking and activity reminders.',
      weakness: 'Limited marketing automation, reporting depth, and customer service features beyond core pipeline management.',
      differentiation: 'Covers the full customer lifecycle including post-sale workflows as described in the document.' },
  ],
  'Project Management': [
    { name: 'Jira', website: 'atlassian.com/software/jira', type: 'Direct', marketPosition: 'Market leader',
      strength: 'Industry-standard issue tracking and agile project management with deep customisation and dev tool integrations.',
      weakness: 'Notoriously complex configuration, steep learning curve, and slow performance for non-technical teams.',
      differentiation: 'Delivers project tracking with a simpler UX and far less configuration burden for the target users described.' },
    { name: 'Asana', website: 'asana.com', type: 'Direct', marketPosition: 'Widely used alternative',
      strength: 'Clean task and project management with strong timeline views, automation rules, and cross-team workflow templates.',
      weakness: 'Limited reporting depth and no built-in time tracking; portfolio management requires premium tier pricing.',
      differentiation: 'Provides the reporting and time-tracking capabilities described in the document within a single unified tool.' },
    { name: 'Monday.com', website: 'monday.com', type: 'Alternative', marketPosition: 'Emerging challenger',
      strength: 'Flexible, visually-driven work OS with highly customisable boards, automations, and broad use-case coverage.',
      weakness: 'Per-seat pricing escalates quickly and can become disorganised without strong governance and naming conventions.',
      differentiation: 'Delivers structured project workflows with built-in governance aligned to the team structure described.' },
  ],
  'SaaS Platform': [
    { name: 'Notion', website: 'notion.so', type: 'Alternative', marketPosition: 'Widely used alternative',
      strength: 'Flexible all-in-one workspace combining notes, databases, wikis, and project management in a highly customisable UI.',
      weakness: 'Lacks specialised domain features; performance degrades with large datasets and complex relational structures.',
      differentiation: 'Purpose-built for the specific workflows described with optimised performance and domain-specific data models.' },
    { name: 'Airtable', website: 'airtable.com', type: 'Alternative', marketPosition: 'Emerging challenger',
      strength: 'Flexible database-spreadsheet hybrid with multiple views, automations, and a strong API for custom integrations.',
      weakness: 'Not designed for complex approval workflows or high-volume transactional data at enterprise scale.',
      differentiation: 'Provides robust workflow orchestration and approval processes native to the system as described.' },
    { name: 'Retool', website: 'retool.com', type: 'Indirect', marketPosition: 'Niche player',
      strength: 'Low-code internal tool builder enabling rapid development of custom dashboards and data-management interfaces.',
      weakness: 'Developer-centric — end users cannot self-serve without technical support to build or modify workflows.',
      differentiation: 'Delivers a purpose-built product with end-user self-service for the non-technical users described.' },
  ],
  'Technology Platform': [
    { name: 'Notion', website: 'notion.so', type: 'Alternative', marketPosition: 'Widely used alternative',
      strength: 'Flexible all-in-one workspace with notes, databases, and project tools in a highly customisable interface.',
      weakness: 'Lacks specialised domain features; performance degrades with large datasets.',
      differentiation: 'Purpose-built with domain-specific data models and workflow automation for the use case described.' },
    { name: 'Airtable', website: 'airtable.com', type: 'Alternative', marketPosition: 'Emerging challenger',
      strength: 'Flexible database-spreadsheet hybrid with multiple views and strong API integrations.',
      weakness: 'Not suited for complex multi-step approval workflows at scale.',
      differentiation: 'Provides native workflow orchestration and approval logic without requiring workarounds.' },
    { name: 'Monday.com', website: 'monday.com', type: 'Indirect', marketPosition: 'Widely used alternative',
      strength: 'Visual work OS with strong automations and broad use-case templates.',
      weakness: 'Generic — requires heavy configuration to match a specific operational domain.',
      differentiation: 'Delivers a domain-focused solution that is immediately usable without extensive setup.' },
  ],
};

function detectSoftwareCategory(brief, docText) {
  const lower = docText.toLowerCase();
  if (lower.includes('mobile app') || lower.includes('android') || lower.includes('ios')) return 'Mobile Application';
  if (lower.includes('portal') || lower.includes('self-service')) return 'Self-Service Portal';
  if (lower.includes('analytics') || lower.includes('business intelligence')) return 'Analytics Dashboard';
  if (lower.includes('workflow') || lower.includes('automation')) return 'Workflow Automation Platform';
  if (lower.includes('marketplace')) return 'Digital Marketplace';
  if (lower.includes('management system')) return 'Management System';
  return 'Web Application Platform';
}

function buildLocalCompetitors(brief, docText) {
  const domain      = brief.domain;
  const rawList     = COMPETITOR_MAP[domain] || COMPETITOR_MAP['Technology Platform'];
  const softwareCat = detectSoftwareCategory(brief, docText);

  const competitors = rawList.map(c => ({
    ...c,
    industryFit: `Directly serves the ${domain} sector with overlapping target users and similar workflow patterns.`,
    matchReason:  `Overlaps with ${brief.productName} on ${(brief.coreModules.slice(0, 2).join(' and '))} functionality.`,
  }));

  return {
    competitors,
    industryCategory: domain,
    softwareCategory: softwareCat,
    combinedLabel:    `${softwareCat} for ${domain}`,
  };
}

// ─────────────────────────────────────────────────────────────
// Recommendations builder (Stage 5)
// ─────────────────────────────────────────────────────────────

function buildLocalRecommendations(brief, docText) {
  const lower = docText.toLowerCase();
  const recs  = [];

  recs.push({
    priority: 'High',
    category: 'Onboarding',
    title:    'Add guided onboarding for first-time users',
    problem:  `New ${brief.userRoles[0] || 'users'} face a steep learning curve across ${brief.coreModules.length} modules with no contextual guidance.`,
    solution: `Introduce a progressive onboarding flow with step-by-step tooltips on the first session. Surface only the most critical features in ${brief.coreModules[0] || 'the main module'} initially, and progressively reveal advanced functionality as users gain confidence over time.`,
    impact:   'Reduces time-to-first-value, lowers support ticket volume, and measurably improves 30-day retention.',
  });

  recs.push({
    priority: 'High',
    category: 'Search',
    title:    'Implement global search with contextual filters',
    problem:  `Users managing multiple ${brief.coreModules[0] || 'records'} have no fast path to locate specific items across modules.`,
    solution: `Add a global search bar (keyboard shortcut Cmd/Ctrl+K) with real-time results grouped by section and type. Include saved filters and recent search history to accelerate repeat lookups for power users.`,
    impact:   'Significantly reduces time-on-task for experienced users and supports high-volume workflows at scale.',
  });

  recs.push({
    priority: 'Medium',
    category: 'Navigation',
    title:    'Preserve filter state and add breadcrumb navigation',
    problem:  'Users navigating from list views to detail records and back lose their scroll position and applied filters, forcing repeated work.',
    solution: `Add persistent breadcrumbs across all multi-step views and preserve list filter state when users navigate back using the browser history API — no page reload required.`,
    impact:   'Reduces navigation friction and eliminates frustration-driven drop-off in multi-step workflows.',
  });

  if (lower.includes('form') || lower.includes('submit') || lower.includes('input')) {
    recs.push({
      priority: 'High',
      category: 'Workflow',
      title:    'Auto-save drafts on all data-entry forms',
      problem:  'Long or multi-step forms risk data loss if the session expires or the user accidentally navigates away before submitting.',
      solution: `Implement auto-save every 30 seconds on all forms with a visible "Draft saved" indicator. Show an in-progress drafts panel on the dashboard so users can resume incomplete submissions without searching.`,
      impact:   'Eliminates data-loss anxiety, encourages more thorough form completion, and reduces abandonment rates.',
    });
  }

  if (lower.includes('report') || lower.includes('export') || lower.includes('analytics')) {
    recs.push({
      priority: 'Medium',
      category: 'Data Visualization',
      title:    'Add interactive charts and scheduled report delivery',
      problem:  'Reports are currently static exports with no ability to drill down interactively or schedule recurring delivery to stakeholders.',
      solution: `Replace static reports with interactive dashboards featuring drill-down charts. Add a report scheduler that delivers PDF or CSV exports to nominated recipients on a recurring basis without manual intervention.`,
      impact:   'Increases reporting frequency and enables data-driven decisions without adding manual effort for the reporting user.',
    });
  }

  recs.push({
    priority: 'Medium',
    category: 'Mobile',
    title:    'Optimise high-frequency actions for mobile screen sizes',
    problem:  `Core ${brief.coreModules[0] || 'module'} actions require users to be at a desktop, blocking field-based or on-the-go team members from completing time-sensitive tasks.`,
    solution: `Identify the 3 most-used actions and optimise their layouts for mobile using bottom-sheet navigation, large tap targets, and simplified one-screen forms. Validate on both iOS Safari and Android Chrome.`,
    impact:   'Enables remote and field-based users to act in real time, reducing task backlog and processing delays.',
  });

  recs.push({
    priority: 'Low',
    category: 'Accessibility',
    title:    'Achieve WCAG 2.1 AA compliance across all screens',
    problem:  'Colour contrast ratios, keyboard focus states, and screen reader support have not been validated against accessibility standards.',
    solution: `Conduct an automated audit using axe-core and fix critical contrast failures, missing ARIA labels, and keyboard navigation gaps. Add a skip-to-content link and ensure all interactive elements are reachable via Tab.`,
    impact:   'Expands the addressable user base, reduces legal compliance risk, and demonstrates inclusive product design.',
  });

  return recs.slice(0, 6);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// Master orchestration  (exported — called by app.js)
// ─────────────────────────────────────────────────────────────

export async function runAnalysis(docText, selected, onProgress) {
  if (!onProgress) onProgress = () => {};
  const result = {};

  // Step 1: Extract brief from document text
  onProgress('ls1', 'on');
  await delay(700);
  const brief = extractLocalBrief(docText);
  Object.assign(result, {
    summary:      brief.summary,
    productName:  brief.productName,
    domain:       brief.domain,
    complexity:   brief.complexity,
    targetMarket: brief.targetMarket,
  });
  onProgress('ls1', 'done');
  await delay(300);

  // Step 2: Information architecture
  if (selected.has('architecture')) {
    onProgress('ls2', 'on');
    await delay(900);
    result.architecture = buildLocalArchitecture(docText, brief);
    onProgress('ls2', 'done');
    await delay(250);
  }

  // Step 3: User journey
  if (selected.has('journey')) {
    onProgress('ls3', 'on');
    await delay(750);
    result.userJourney = buildLocalJourney(brief);
    onProgress('ls3', 'done');
    await delay(250);
  }

  // Step 4: Competitor landscape
  if (selected.has('competitors')) {
    onProgress('ls4', 'on');
    await delay(1000);
    const comp = buildLocalCompetitors(brief, docText);
    result.competitors      = comp.competitors;
    result.industryCategory = comp.industryCategory;
    result.softwareCategory = comp.softwareCategory;
    result.combinedLabel    = comp.combinedLabel;
    onProgress('ls4', 'done');
    await delay(250);
  }

  // Step 5: UX recommendations
  if (selected.has('recommendations')) {
    onProgress('ls5', 'on');
    await delay(700);
    result.recommendations = buildLocalRecommendations(brief, docText);
    onProgress('ls5', 'done');
  }

  return result;
}
