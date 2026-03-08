# 🦉 Socratic Tutor

An AI tutor that guides students toward answers using the Socratic method — never just handing them out.

## Deploy to Vercel in 5 minutes

### Option A — Drag & Drop (fastest)
1. Run `npm install && npm run build` locally
2. Go to [vercel.com](https://vercel.com) → New Project → drag the `dist/` folder
3. Done. Live in 30 seconds.

### Option B — GitHub (recommended, gets you auto-deploys)
1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. Vercel auto-detects Vite — just click Deploy
4. Done. Every push auto-deploys.

## Running locally

```bash
npm install
npm run dev
# open http://localhost:5173
```

## How it works

- Teachers/parents enter their Anthropic API key once per session
- The key is stored only in `sessionStorage` — never sent anywhere except Anthropic's API
- Students chat with the AI tutor which gives progressive hints, never direct answers
- Click ⚙ Configure to set: max hints, hint style, difficulty, and whether to reveal the answer

## Features

- 💡 Progressive hint system (up to 8 hints)
- ⚙️ Configurable: hint count, style (Socratic vs step-by-step), difficulty, answer reveal
- 🎯 Visual hint meter — students see how many hints remain
- 📱 Works on mobile
- 🔒 API key never leaves the browser

## Stack

- React 18 + Vite
- No backend required
- Anthropic Claude API (claude-sonnet-4-20250514)
