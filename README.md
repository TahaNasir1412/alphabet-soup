# Alphabet Soup — Keyword Sweep Tool

AI-powered Google Autocomplete harvester. Works for any niche — Claude detects intent and generates accurate modifiers automatically.

## Run locally

```bash
npm install
node server.js
# Open http://localhost:3000
```

## Deploy on Render.com (free)

1. Push this folder to a GitHub repo
2. Go to render.com → New → Web Service
3. Connect your GitHub repo
4. Build command: `npm install`
5. Start command: `node server.js`
6. Deploy — you get a public URL

## How it works

1. You enter a keyword
2. Claude analyzes the niche and generates accurate, niche-specific modifiers
3. The tool runs all selected sweeps against Google Autocomplete
4. Keywords are collected, deduplicated, labeled by sweep, and shown in real-time
5. Export CSV or copy all when done

## Sweeps

| ID | Name | What it does |
|----|------|-------------|
| S1 | Suffix A-Z | keyword + a/b/c...z |
| S2 | Prefix A-Z | a/b/c...z + keyword |
| S3 | Questions | how/why/what + keyword, keyword + safe/free/working |
| S4 | Platform | Niche-specific platform/device modifiers (AI-generated) |
| S5 | Problems | Niche-specific error/alternative modifiers (AI-generated) |
| S6 | Context | Niche-specific audience/context modifiers (AI-generated) |
| S7 | Numbers | Version numbers, years, episode numbers (AI-generated) |
| S8 | Double-char | keyword + aa/ab/ac... (deep long-tail) |
| S9 | Custom | Full niche-specific queries (AI-generated) |
| S10 | Wildcard | Intent-variant queries (watch/download/review + keyword) |

## Changing keyword / niche

Just type a new keyword and hit Generate. Claude re-analyzes the niche each time.
No code changes needed for any niche.

## Notes

- Set delay to 800ms+ if you see empty results (Google rate limiting)
- Strict filter keeps only keywords containing your base keyword
- Recursive seeds section suggests related keywords to sweep next
- Export CSV → paste into Ahrefs bulk for volume data
