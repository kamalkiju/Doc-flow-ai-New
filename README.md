# DocFlow AI

AI-powered document intelligence platform. Upload any client brief or product spec — get architecture diagrams, user journey maps, competitor analysis, and UX recommendations instantly.

Powered by Claude (Anthropic).

---

## Project Structure

```
docflow-ai/
├── index.html              # App entry point
├── vercel.json             # Vercel routing config
├── api/
│   └── claude.js           # Vercel serverless proxy (keeps API key secure)
├── src/
│   ├── css/main.css
│   ├── js/app.js
│   └── utils/
│       ├── docParser.js    # PDF, DOCX, TXT reading
│       ├── claudeService.js# Claude API calls (routes through proxy on Vercel)
│       └── renderer.js     # HTML builders for result panels
├── .gitignore
└── README.md
```

---

## Deploy on Vercel

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/docflow-ai.git
git push -u origin main
```

### Step 2 — Deploy
1. Go to vercel.com and sign in
2. Click Add New Project and import your GitHub repo
3. Leave all build settings as default
4. Click Deploy

### Step 3 — Add API Key (REQUIRED)
Without this step analysis will not work.

1. Get your key from console.anthropic.com
2. In Vercel: Project Settings → Environment Variables
3. Add: Name = ANTHROPIC_API_KEY, Value = sk-ant-xxxxx
4. Check all environments (Production, Preview, Development)
5. Save then Redeploy

---

## Local Development

```bash
npm install -g vercel
echo "ANTHROPIC_API_KEY=sk-ant-xxxxxxxx" > .env.local
vercel dev
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| ANTHROPIC_API_KEY | Yes | Your key from console.anthropic.com |

---

## License
MIT
