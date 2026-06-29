const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── PROVIDERS ─────────────────────────────────────────────────────────────────
// Set ONE env var: GEMINI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, OPENAI_API_KEY
const PROVIDERS = {
  gemini:    { key: process.env.GEMINI_API_KEY,     model: 'gemini-2.5-flash' },
  anthropic: { key: process.env.ANTHROPIC_API_KEY,  url: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-6' },
  groq:      { key: process.env.GROQ_API_KEY,       url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
  openai:    { key: process.env.OPENAI_API_KEY,     url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
};

function getActiveProvider() {
  for (const [name, cfg] of Object.entries(PROVIDERS)) {
    if (cfg.key) return name;
  }
  return null;
}

// ── STATUS ENDPOINT (for UI health check) ─────────────────────────────────────
app.get('/api/status', (req, res) => {
  const provider = getActiveProvider();
  res.json({
    provider: provider || 'none',
    model: provider ? PROVIDERS[provider].model : null,
    ai_active: !!provider,
  });
});

// ── MASTER PROMPT ─────────────────────────────────────────────────────────────
function buildPrompt(keyword, nicheHint, outputLang) {
  const lang = outputLang || 'en';
  const langNote = lang !== 'en'
    ? `OUTPUT LANGUAGE IS "${lang}". ALL modifier values, query strings, and example phrases MUST be written in ${lang}. JSON keys stay in English. Think about what a native ${lang} speaker actually types into Google — not a translation of English phrases.`
    : 'Output language is English.';

  return `RULES — READ FIRST:
1. Return ONLY a raw JSON object. Zero markdown. Zero explanation. No text outside the JSON.
2. ${langNote}
3. Every modifier list must be EXHAUSTIVE — aim for the MAXIMUM realistic modifiers, not a short sample. Quantity matters here because each modifier becomes a separate Google query. Thin lists = missed keywords.
4. Only include modifiers that REAL users actually type. No theoretical phrases, no grammatically correct but unnatural combinations.
5. Modifiers must be typed as they appear in a search box — lowercase, natural phrasing, no punctuation unless users actually include it.

You are a senior SEO keyword researcher specialising in Google Autocomplete behaviour across every niche and language market. Your outputs power a tool that appends each modifier to the base keyword and queries Google Autocomplete. The quality of the final keyword list depends entirely on how good your modifiers are.

BASE KEYWORD: "${keyword}"
${nicheHint ? `ADDITIONAL CONTEXT: "${nicheHint}"` : ''}

━━━ STEP 1: UNDERSTAND WHAT THIS KEYWORD ACTUALLY IS ━━━
Read the keyword carefully. Ask:
- Is this a brand name, product, service, app, concept, platform, or topic?
- What is the searcher's REAL underlying goal — not what the words say on the surface?
- Who is the typical searcher? Age, country, device, intent?
- What problem are they trying to solve?

Correct reasoning examples:
"anime salt" → not food. It's a free anime streaming platform. Searcher wants to watch anime for free, often in Indian regional languages. Primary market: India. High mobile/APK intent.
"salary calculator germany" → user wants exact take-home pay after German taxes. Finance tool intent. German speakers likely.
"plumber london emergency" → someone's pipes are broken RIGHT NOW. Hyper-local, urgent, mobile search.
"nike air max 270" → shopping or price comparison. May want review, size guide, or discount.
"notion alternative" → frustrated SaaS user wanting to switch. High comparison intent.
"how to lose weight fast" → informational blog content. Listicle and guide intent.

━━━ STEP 2: DETECT THE NICHE — APPLY ALL RELEVANT LOGIC ━━━

STREAMING / FREE WATCH ONLINE (anime, movies, series, cartoons, OTT platforms):
S4 must include: apk, android, ios, iphone, ipad, pc, windows, mac, laptop, chromebook, firestick, fire tv, android tv, smart tv, kodi, web, browser, online, download, install, mod apk, premium apk, no ads, ad free, apkpure, uptodown, apkmirror, play store, google play, app store, mirror link, telegram
S5 must include: not working, not opening, not loading, not playing, video not loading, buffering, slow, error, 404 error, black screen, white screen, login problem, sign in issue, forgot password, banned, blocked, region locked, geo restricted, vpn needed, site down, server down, down today, alternative, alternatives, new domain, new link, new url, new website, mirror, proxy, unblock, how to unblock, update, latest update, new version update, old version not working
S6 must include: hindi dubbed, hindi dub, tamil dubbed, tamil dub, telugu dubbed, telugu dub, bengali dubbed, malayalam dubbed, kannada dubbed, marathi, english dubbed, english sub, english subtitles, english subbed, japanese audio, korean, urdu dubbed, in hindi, in tamil, in telugu, in bengali, free, totally free, no subscription, no login, no sign up, no registration, hd quality, 1080p, 4k, ad free, without ads, latest episodes, all seasons, complete series
S7 must include: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, 1.0, 2.0, 9.8, episode 1, episode 2, season 1, season 2, season 3, 2023, 2024, 2025, 2026

APK / SOFTWARE DOWNLOAD:
Same as streaming S4 but heavier on: mod apk, premium unlocked, cracked apk, no root required, root required, lite version, pro version, paid version free, without watermark, unlimited coins, unlimited gems, god mode, anti ban, latest version apk, old version apk, previous version
S5: not installing, installation failed, parse error, not compatible, requires newer android, permission denied, virus detected, is it safe, malware, trojan, removed from play store, banned by google, update broke it

LOCAL SERVICE (plumber, dentist, restaurant, salon, lawyer, doctor, mechanic, etc + any city):
S4: near me, nearby, close to me, in my area, open now, open today, open sunday, open saturday, open bank holiday, open 24 hours, 24/7, open late, open early morning, same day, next day, emergency, urgent, walk in, no appointment needed, free estimate, free consultation, free quote, home visit, mobile service, online booking, phone number, contact number, WhatsApp number, address, directions
S5: closed, permanently closed, not available, fully booked, long wait, too expensive, overpriced, bad experience, bad reviews, scam, complaints, ripped off, alternative, better option, cheaper option, nearest alternative
S6: cheap, cheapest, affordable, budget, best, top rated, highest rated, most reviewed, trusted, recommended, verified, licensed, insured, certified, qualified, experienced, family run, women only, male only, disabled access, parking available, near train station, near bus stop

ECOMMERCE / PRODUCT (any buyable product, brand, or shopping intent):
S4: buy, buy online, buy now, order online, price, cheapest price, lowest price, best price, price comparison, discount, sale, offer, deal, promo code, coupon code, voucher, cashback, cod, cash on delivery, free shipping, fast delivery, next day delivery, same day delivery, emi, no cost emi, installment, review, reviews, unboxing, size guide, size chart, fit guide, colour options, colour variants, in stock, pre order, where to buy, official store, authorised seller
S5: fake, counterfeit, duplicate, how to spot fake, original vs fake, out of stock, discontinued, recalled, refund, return policy, exchange, complaint, not delivered, lost in transit, wrong size, wrong colour, damaged, defective, warranty claim, alternative, substitute, similar product, cheaper alternative
S6: for men, for women, for kids, for teenagers, for elderly, for beginners, for professionals, as gift, gift ideas, birthday gift, anniversary gift, imported, made in, branded, luxury, premium, budget, value for money, worth buying, honest review

FINANCE / SALARY / TAX:
S4: calculator, calculate, how to calculate, formula, formula excel, monthly, monthly calculation, annual, yearly, gross, net, take home, in hand, after tax, before tax, including tax, excluding tax, online calculator, free calculator, excel template, pdf, download, comparison, breakdown, estimate
S5: wrong result, incorrect, not accurate, outdated, not matching payslip, different from expectation, alternative calculator, better calculator, official calculator
S6: for salaried employee, for self employed, for freelancer, for contractor, for part time, for freshers, for experienced, entry level, senior level, by state, by city, by country, with bonus, with overtime, with allowances, with deductions, without deductions, 2024 rates, 2025 rates, new tax regime, old tax regime

TOOL / CALCULATOR / UTILITY:
S4: free, free online, free to use, no signup, no registration, no download, web based, browser based, offline, download, desktop app, mobile app, chrome extension, firefox extension, api, embed, wordpress plugin, google sheets, excel, pdf export, csv export, bulk, batch
S5: not working, wrong answer, inaccurate, error, bug, broken, slow, crashed, alternative, free alternative, open source alternative, better tool, more accurate, deprecated, no longer updated
S6: for students, for teachers, for professionals, for business, for personal use, beginner friendly, advanced, simple, detailed, with explanation, step by step, with examples, with formula shown

BLOGGING / INFORMATIONAL:
S4 (content angles): for beginners, step by step, complete guide, ultimate guide, quick guide, cheat sheet, tips, top tips, pro tips, expert tips, hacks, tricks, ideas, examples, case study, real examples, with pictures, with video, with diagram, infographic, checklist, template, worksheet, free template, downloadable
S5 (counterpoints): myths, misconceptions, mistakes to avoid, what not to do, outdated advice, wrong way, common errors, why it fails, why it doesnt work
S6 (audiences): for men, for women, for teens, for college students, for working professionals, for stay at home moms, for seniors, on a budget, under 30 minutes, at home, without equipment, without gym, without investment, for absolute beginners, for intermediate, for advanced

SAAS / SOFTWARE PRODUCT:
S4: pricing, plans, cost, how much, free plan, free trial, free forever, freemium, paid plan, pro plan, enterprise plan, student discount, nonprofit discount, discount code, lifetime deal, appsumo, login, sign in, sign up, download, desktop app, mobile app, chrome extension, api, webhook, integration, zapier integration, slack integration, how to use, getting started, tutorial, documentation, help center
S5: not working, down, outage, status, slow, bugs, glitches, data lost, sync issue, login problem, forgot password, cancel subscription, refund, how to export data, how to delete account, too expensive, alternative, cheaper alternative, open source alternative, self hosted alternative
S6: for small business, for startups, for enterprise, for solopreneur, for freelancers, for agencies, for teams, for students, for nonprofits, review, honest review, pros and cons, worth it, compared to, better than, vs

GAMING:
S4: pc, mobile, android, ios, console, ps4, ps5, xbox, nintendo switch, steam, how to play, how to download, free to play, pay to win, cheat codes, cheat engine, hack, mod, modded, aimbot, wallhack, esp, unlimited money, unlimited coins, free skins, free characters, free diamonds, top up, recharge, redeem code, promo code, gift code, event code
S5: ban, permanent ban, account banned, how to unban, lag, ping issue, server down, maintenance, not loading, crash, fps drop, connection error, account hacked, lost account
S6: beginner guide, pro tips, best settings, best sensitivity, best loadout, best characters, tier list, ranked mode, competitive, casual, solo, duo, squad, clan recruitment, clan war

━━━ STEP 3: GEO DETECTION ━━━
Determine the most likely PRIMARY MARKET from the keyword itself:
- Indian brand names, Bollywood/regional language signals, .in domains, Hindi/Urdu words → India (in)
- German words, .de signals, Compound German nouns → Germany (de)
- Portuguese words, Brazilian brand names → Brazil (br)
- Spanish words, Latin American signals → Mexico (mx) or Spain (es)
- Japanese/Korean signals → Japan (jp) / Korea (kr)
- Arabic words → Saudi Arabia (sa) or UAE (ae)
- UK spelling, UK brands, UK cities → UK (gb)
- Unknown / global → USA (us) as default

━━━ STEP 4: INTENT CLASSIFICATION RULES ━━━
For each keyword that comes back from Google Autocomplete, classify its intent as one of:
- navigational: user wants to reach a specific site/page (login, official site, download page)
- download: user wants to download/install something (apk, pc version, mod)
- streaming: user wants to watch/stream content
- informational: user wants to learn/understand something (what is, how to, why)
- commercial: user is comparing/researching before buying (review, vs, best, alternatives)
- transactional: user wants to buy/sign up right now (buy, price, order, subscribe)
- local: user wants something near them (near me, open now, city name)
- troubleshoot: user has a problem to fix (not working, error, fix, solution)

Return these intent labels in the output so the UI can colour-code and filter keywords by intent.

━━━ OUTPUT FORMAT ━━━
Return this exact JSON — no extra fields, no missing fields:
{
  "niche": "specific niche in 3-5 words",
  "intent": "primary intent type",
  "intent_summary": "one sentence describing what the searcher actually wants",
  "primary_market": "country name in English",
  "geo_recommendation": "2-letter country code",
  "geo_reason": "one sentence",
  "output_language": "${lang}",
  "sweeps": {
    "s3_question_prefixes": ["minimum 12 question openers in ${lang} — universal plus niche-specific"],
    "s3_question_suffixes": ["minimum 18 qualifiers in ${lang} — reflect REAL user anxieties for this niche, include both trust signals AND problem signals"],
    "s4_platform": ["minimum 25 platform/access/device modifiers in ${lang} — be exhaustive, reference the niche profiles above"],
    "s5_problem": ["minimum 20 problem/failure/alternative modifiers in ${lang} — every realistic failure mode"],
    "s6_context": ["minimum 18 audience/context modifiers in ${lang} — WHO searches and in what situation, include language variants if relevant"],
    "s7_numbers": ["all numbers meaningful for this niche — versions, years, prices, sizes, episodes, seasons, amounts"],
    "s9_custom": ["minimum 20 complete search queries in ${lang} — full natural phrases a real user types, covering: access/download, language variants, troubleshooting, comparison, trust verification, specific content"],
    "s10_wildcard": ["minimum 15 intent-variant queries in ${lang} — action verbs + keyword, keyword + action verbs, covering all intent types"]
  },
  "intent_rules": {
    "navigational": ["words/patterns that signal navigational intent — login, official, site, homepage, link"],
    "download": ["words that signal download intent — apk, download, install, get, pc version"],
    "streaming": ["words that signal streaming intent — watch, stream, play, see, episode"],
    "informational": ["words that signal informational intent — what is, how to, why, guide, tutorial"],
    "commercial": ["words that signal commercial/comparison intent — review, vs, alternative, best, compare"],
    "transactional": ["words that signal buy intent — buy, price, order, subscribe, signup"],
    "troubleshoot": ["words that signal problem intent — not working, error, fix, solution, broken, down"]
  },
  "suggested_clarifications": [
    {"question": "clarifying question that would improve modifiers", "options": ["Option A", "Option B", "Option C"]}
  ],
  "recursive_seeds": ["8-12 related keywords that deserve their own full sweep to expand coverage — think: competitor names, specific content types, specific show/product names, problem-variant keywords"],
  "niche_notes": "3-4 sentences on unique characteristics of this niche for autocomplete research, what patterns to watch for, and what the noise (irrelevant suggestions) typically looks like so the user can recognise it"
}`;
}

// ── API CALLERS ───────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const cfg = PROVIDERS.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.key}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 8192, responseMimeType: 'application/json' }
    })
  });
  const d = await r.json();
  if (d.error) throw new Error(`Gemini: ${d.error.message || JSON.stringify(d.error)}`);
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

async function callAnthropic(prompt) {
  const cfg = PROVIDERS.anthropic;
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
  });
  const d = await r.json();
  if (d.error) throw new Error(`Anthropic: ${d.error.message}`);
  return d.content?.map(c => c.text || '').join('') || '';
}

async function callGroq(prompt) {
  const cfg = PROVIDERS.groq;
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }], temperature: 0.15 })
  });
  const d = await r.json();
  if (d.error) throw new Error(`Groq: ${d.error.message}`);
  return d.choices?.[0]?.message?.content || '';
}

async function callOpenAI(prompt) {
  const cfg = PROVIDERS.openai;
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }], temperature: 0.15, response_format: { type: 'json_object' } })
  });
  const d = await r.json();
  if (d.error) throw new Error(`OpenAI: ${d.error.message}`);
  return d.choices?.[0]?.message?.content || '';
}

// ── RULE-BASED FALLBACK ───────────────────────────────────────────────────────
function ruleBased(keyword, outputLang) {
  const kw = keyword.toLowerCase();
  const base = keyword;
  const lang = outputLang || 'en';

  // Extended modifier packs per language
  const PACKS = {
    streaming_en: {
      s4: ['apk','android','ios','iphone','ipad','pc','windows','mac','laptop','chromebook','firestick','android tv','smart tv','kodi','web','browser','online','download','install','mod apk','premium apk','no ads','apkpure','uptodown','mirror link','telegram','play store'],
      s5: ['not working','not opening','not loading','not playing','buffering','banned','blocked','down','server down','alternative','alternatives','new link','new domain','mirror','proxy','vpn','region locked','login problem','black screen','error 404','site down','update not working'],
      s6: ['hindi dubbed','hindi dub','tamil dubbed','telugu dubbed','bengali dubbed','malayalam dubbed','kannada dubbed','english dubbed','english sub','english subtitles','urdu dubbed','in hindi','in tamil','in telugu','free','no subscription','no login','hd','1080p','4k','ad free','without ads','latest episodes','all seasons'],
      s7: ['1','2','3','4','5','6','7','8','9','10','v9','v10','9.8','episode 1','episode 2','episode 3','season 1','season 2','season 3','2023','2024','2025','2026'],
      s9: [`watch ${base} online`,`${base} hindi dubbed`,`${base} apk download`,`is ${base} safe`,`${base} not working fix`,`${base} alternatives`,`${base} official site`,`${base} new link 2025`,`download ${base} apk`,`${base} english sub`,`${base} mod apk`,`${base} for pc`,`${base} no ads`,`${base} latest version`,`${base} mirror site`,`${base} telegram link`,`is ${base} legal`,`${base} vs crunchyroll`],
      s10: [`watch ${base}`,`download ${base}`,`stream ${base}`,`free ${base}`,`best ${base}`,`${base} official`,`${base} link`,`is ${base} legal`,`${base} review`,`unblock ${base}`,`${base} not working today`,`${base} new domain`],
    },
    local_en: {
      s4: ['near me','nearby','close to me','open now','open today','open sunday','open 24 hours','24/7','same day','emergency','walk in','no appointment','free estimate','free quote','home visit','mobile service','online booking','phone number','whatsapp','address'],
      s5: ['closed','not available','fully booked','too expensive','bad reviews','scam','complaints','alternative','better option','cheaper'],
      s6: ['cheap','affordable','best','top rated','trusted','licensed','insured','certified','experienced','local','family run'],
      s7: ['2024','2025'],
      s9: [`best ${base} near me`,`cheap ${base} near me`,`${base} open now`,`${base} reviews`,`${base} price`,`emergency ${base}`,`${base} same day`,`24 hour ${base}`,`${base} free estimate`,`${base} phone number`],
      s10: [`best ${base}`,`cheap ${base}`,`${base} near me`,`${base} reviews`,`emergency ${base}`,`find ${base}`,`affordable ${base}`],
    },
    ecommerce_en: {
      s4: ['buy online','price','cheapest price','discount','sale','offer','coupon','promo code','cod','cash on delivery','free shipping','emi','review','reviews','unboxing','size guide','in stock','where to buy','official store'],
      s5: ['fake','counterfeit','original vs fake','out of stock','refund','return','complaint','not delivered','damaged','defective','alternative','substitute'],
      s6: ['for men','for women','for kids','as gift','imported','original','luxury','premium','budget','worth buying','honest review'],
      s7: ['under 500','under 1000','under 5000','2024','2025'],
      s9: [`buy ${base} online`,`${base} price`,`${base} review`,`${base} discount`,`${base} vs`,`best ${base}`,`${base} sale`,`original ${base} vs fake`,`${base} return policy`,`${base} coupon code`,`${base} free shipping`,`cheapest ${base}`],
      s10: [`buy ${base}`,`best ${base}`,`cheap ${base}`,`${base} review`,`${base} vs`,`${base} discount`,`${base} alternative`,`${base} worth it`],
    },
    finance_en: {
      s4: ['calculator','formula','monthly','annual','gross','net','take home','after tax','before tax','online','excel','pdf','free calculator','breakdown','estimate'],
      s5: ['wrong result','not accurate','outdated','alternative','error','not matching','different result'],
      s6: ['for salaried','for self employed','for freelancers','for freshers','by state','by country','with deductions','without deductions','2025 rates','new regime','old regime'],
      s7: ['2024','2025','30000','50000','100000','500000','1000000','10 lakh','20 lakh'],
      s9: [`${base} calculator`,`how to calculate ${base}`,`${base} 2025`,`${base} after tax`,`${base} monthly`,`${base} formula`,`${base} for freshers`,`${base} deductions`,`${base} breakdown`,`free ${base} calculator`],
      s10: [`calculate ${base}`,`${base} calculator`,`${base} formula`,`${base} 2025`,`best ${base} calculator`,`${base} explained`],
    },
  };

  // Niche detection
  const niches = [
    { test: /apk|mod apk|cracked|premium unlocked|stream|anime|movie|series|episode|cartoon|dubbed|ott|netflix|crunchyroll|hotstar|jio|zee5|hulu|disney|watch online/, label:'Streaming / APK', intent:'streaming', geo:'in', pack:'streaming_en' },
    { test: /plumber|dentist|lawyer|restaurant|salon|barber|mechanic|electrician|cleaner|locksmith|doctor|gym|spa|hotel|near me/, label:'Local Service', intent:'local', geo:'us', pack:'local_en' },
    { test: /buy|price|shop|sale|deal|discount|amazon|flipkart/, label:'Ecommerce Product', intent:'transactional', geo:'us', pack:'ecommerce_en' },
    { test: /salary|tax|income|loan|emi|investment|insurance|finance|budget|gross|net pay/, label:'Finance / Salary', intent:'informational', geo:'in', pack:'finance_en' },
  ];

  let detected = null;
  for (const n of niches) {
    if (n.test.test(kw)) { detected = n; break; }
  }

  const pack = detected ? PACKS[detected.pack] : PACKS['ecommerce_en'];

  return {
    niche: detected?.label || 'General',
    intent: detected?.intent || 'informational',
    intent_summary: `User is searching for information related to ${keyword}`,
    primary_market: detected?.geo === 'in' ? 'India' : 'United States',
    geo_recommendation: detected?.geo || 'us',
    geo_reason: 'Detected from keyword signals (rule-based fallback)',
    output_language: lang,
    sweeps: {
      s3_question_prefixes: ['how to','why','what is','is','can i','does','where to','when does','which','who makes','how does','should i'],
      s3_question_suffixes: ['safe','free','working','legal','real','good','worth it','legit','available','updated','down','official','safe to use','trustworthy','scam','virus','malware','free to use','no subscription'],
      s4_platform: pack.s4,
      s5_problem: pack.s5,
      s6_context: pack.s6,
      s7_numbers: pack.s7,
      s9_custom: pack.s9,
      s10_wildcard: pack.s10,
    },
    intent_rules: {
      navigational: ['login','official','site','homepage','link','website','url'],
      download: ['apk','download','install','get','pc version','setup','exe'],
      streaming: ['watch','stream','play','see','episode','online'],
      informational: ['what is','how to','why','guide','tutorial','explained'],
      commercial: ['review','vs','alternative','best','compare','comparison','worth'],
      transactional: ['buy','price','order','subscribe','signup','purchase'],
      troubleshoot: ['not working','error','fix','solution','broken','down','issue','problem'],
    },
    suggested_clarifications: [{ question:'What is this keyword?', options:['A streaming platform/app','A product to buy','A local service','A topic to write about'] }],
    recursive_seeds: [`${keyword} app`,`${keyword} alternative`,`best ${keyword}`,`free ${keyword}`,`${keyword} review`,`${keyword} not working`,`${keyword} download`],
    niche_notes: 'Rule-based fallback active — AI key not configured or call failed. Add GEMINI_API_KEY for accurate niche-specific modifiers. Noise keywords (without base keyword) are saved in the Noise tab.',
    _source: 'rule-based',
  };
}

// ── GOOGLE AUTOCOMPLETE PROXY ─────────────────────────────────────────────────
// Tracks consecutive empty responses to detect rate limiting
let emptyStreak = 0;
const RATE_LIMIT_THRESHOLD = 5;

app.get('/api/suggest', async (req, res) => {
  const { q, gl, hl } = req.query;
  if (!q) return res.json({ suggestions: [], rate_limited: false });

  const clients = ['firefox', 'chrome', 'toolbar'];
  let suggestions = [];
  let attempts = 0;

  for (const client of clients) {
    try {
      const url = `http://suggestqueries.google.com/complete/search?client=${client}&q=${encodeURIComponent(q)}&hl=${hl||'en'}&gl=${gl||'us'}`;
      const r = await fetch(url, { timeout: 7000 });
      const d = await r.json();
      suggestions = d[1] || [];
      if (suggestions.length > 0) { emptyStreak = 0; break; }
      attempts++;
    } catch(e) { attempts++; }
  }

  if (suggestions.length === 0) {
    emptyStreak++;
  } else {
    emptyStreak = 0;
  }

  res.json({
    suggestions,
    rate_limited: emptyStreak >= RATE_LIMIT_THRESHOLD,
    empty_streak: emptyStreak,
  });
});

// ── MODIFIERS ENDPOINT ────────────────────────────────────────────────────────
app.post('/api/modifiers', async (req, res) => {
  const { keyword, niche_hint, output_lang } = req.body;
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  const provider = getActiveProvider();
  const prompt = buildPrompt(keyword, niche_hint, output_lang);

  if (!provider) {
    console.log('No AI provider configured — using rule-based fallback');
    return res.json(ruleBased(keyword, output_lang));
  }

  try {
    let raw = '';
    if (provider === 'gemini')    raw = await callGemini(prompt);
    else if (provider === 'anthropic') raw = await callAnthropic(prompt);
    else if (provider === 'groq')  raw = await callGroq(prompt);
    else if (provider === 'openai') raw = await callOpenAI(prompt);

    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    parsed._source = provider;
    parsed._model = PROVIDERS[provider].model;
    res.json(parsed);
  } catch(e) {
    console.error(`AI call failed (${e.message}) — falling back to rule-based`);
    const fb = ruleBased(keyword, output_lang);
    fb._source = 'rule-based';
    fb._ai_error = e.message;
    res.json(fb);
  }
});

// ── INTENT CLASSIFIER ENDPOINT ────────────────────────────────────────────────
app.post('/api/classify', async (req, res) => {
  const { keywords, intent_rules } = req.body;
  if (!keywords?.length) return res.json({ classified: [] });

  const rules = intent_rules || {
    navigational: ['login','official','site','homepage','link','website'],
    download: ['apk','download','install','get','setup','exe'],
    streaming: ['watch','stream','play','episode','online'],
    informational: ['what is','how to','why','guide','tutorial','explained'],
    commercial: ['review','vs','alternative','best','compare','worth'],
    transactional: ['buy','price','order','subscribe','purchase'],
    troubleshoot: ['not working','error','fix','solution','broken','down','problem'],
  };

  const classified = keywords.map(kw => {
    const kl = kw.toLowerCase();
    for (const [intent, signals] of Object.entries(rules)) {
      if (signals.some(s => kl.includes(s))) {
        return { kw, intent };
      }
    }
    return { kw, intent: 'informational' };
  });

  res.json({ classified });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const p = getActiveProvider();
  console.log(`\nAlphabet Soup v4 → http://localhost:${PORT}`);
  console.log(`AI Provider : ${p ? `${p} (${PROVIDERS[p].model})` : 'NONE — rule-based active'}`);
  console.log(`─────────────────────────────────────────\n`);
});
