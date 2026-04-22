/**
 * api/claude.js — Vercel Serverless Function
 *
 * This is a secure backend proxy between the browser and Anthropic's API.
 *
 * Why this exists:
 * - Browsers cannot call api.anthropic.com directly (CORS blocked)
 * - The API key must NEVER be in frontend code (security risk)
 * - This function runs on Vercel's server, reads the key from environment
 *   variables, and forwards the request to Anthropic safely.
 *
 * Setup on Vercel:
 * 1. Go to your Vercel project → Settings → Environment Variables
 * 2. Add: ANTHROPIC_API_KEY = sk-ant-xxxxxxxxxxxxxxxx
 * 3. Redeploy
 *
 * The frontend calls /api/claude (this file) instead of api.anthropic.com directly.
 */

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers — allow requests from your Vercel domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Read API key from environment variable (set in Vercel dashboard)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[proxy] ANTHROPIC_API_KEY environment variable is not set');
    return res.status(500).json({
      error: {
        message: 'API key not configured. Add ANTHROPIC_API_KEY in Vercel Environment Variables.'
      }
    });
  }

  try {
    const { model, max_tokens, system, messages } = req.body;

    // Validate required fields
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: { message: 'Invalid request: messages array required' } });
    }

    // Forward to Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'x-api-key':            apiKey,
        'anthropic-version':    '2023-06-01',
      },
      body: JSON.stringify({
        model:      model      || 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 1000,
        system,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[proxy] Anthropic error:', data);
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('[proxy] Unexpected error:', err);
    return res.status(500).json({
      error: { message: 'Proxy error: ' + err.message }
    });
  }
}
