const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── PROVIDERS ─────────────────────────────────────────────────────────────────
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

app.get('/api/status', (req, res) => {
  const provider = getActiveProvider();
  res.json({
    provider: provider || 'none',
    model: provider ? PROVIDERS[provider].model : null,
    ai_active: !!provider,
    groq_available: !!PROVIDERS.groq.key,
    groq_model: PROVIDERS.groq.model,
    gemini_available: !!PROVIDERS.gemini.key,
    gemini_model: PROVIDERS.gemini.model,
  });
});

function buildPrompt(keyword, nicheHint, outputLang) {
  const lang = outputLang || 'en';
  const langNote = lang !== 'en'
    ? `OUTPUT LANGUAGE IS "${lang}". ALL modifier values, query strings, and example phrases MUST be written in ${lang}. JSON keys stay in English.`
    : 'Output language is English.';

  return `RULES — READ FIRST:
1. Return ONLY a raw JSON object. Zero markdown. Zero explanation. No text outside the JSON.
2. ${langNote}
3. Every modifier list must be EXHAUSTIVE — aim for the MAXIMUM realistic modifiers.
4. Only include modifiers that REAL users actually type.
5. Modifiers must be typed as they appear in a search box — lowercase, natural phrasing.
6. CRITICAL — NATURAL QUERY ORDER: real searchers do NOT always glue a modifier onto the end of the exact keyword phrase. Someone searching for a local service does not always type "[service] in [city] near me" — they're just as likely to type "[city] [service]", "[service] company [city]", "who does [service] in [city]". This applies to every niche — ecommerce ("buy nike shoes online" vs "nike shoes where to buy"), SaaS ("notion pricing" vs "how much does notion cost"), streaming, finance, anything. Model every realistic word order, not just keyword+modifier concatenation.

You are a senior SEO keyword researcher specialising in Google Autocomplete behaviour across every niche and language market. Your outputs power a tool that queries Google Autocomplete using both (a) keyword+modifier concatenation and (b) fully independent natural phrasings you write yourself. Model how real humans type into a search box for THIS SPECIFIC keyword — whatever niche it turns out to be. Never assume the niche from a previous request; evaluate fresh every time.

BASE KEYWORD: "${keyword}"
${nicheHint ? `ADDITIONAL CONTEXT: "${nicheHint}"` : ''}

━━━ STEP 1: UNDERSTAND WHAT THIS KEYWORD ACTUALLY IS ━━━
- Is this a brand, product, service, app, concept, platform, local business category, or topic?
- Does it contain a location? A brand? A generic category?
- What is the searcher's REAL underlying goal?
- Who is the typical searcher, what device, what urgency?

Examples (illustrative only — do not bias unrelated keywords):
"anime salt" → free anime streaming platform, India-heavy, APK/mobile intent.
"salary calculator germany" → take-home pay tool, German speakers.
"plumber london emergency" → urgent local service, NOW intent.
"nike air max 270" → shopping/comparison.
"notion alternative" → SaaS switcher, comparison intent.
"appliance repair in flagstaff" → hyperlocal home service. Real searchers vary phrasing: city-first ("flagstaff appliance repair"), category-first ("appliance repair flagstaff az"), question form ("who repairs appliances in flagstaff"), brand-specific, or zero-location ("appliance repair near me") because Google already geo-targets from IP.

━━━ STEP 2: DETECT THE NICHE ━━━
Identify which pattern (or blend, or something else) fits the CURRENT keyword. Don't force-fit.

STREAMING / FREE WATCH ONLINE:
S4: apk, android, ios, iphone, ipad, pc, windows, mac, firestick, fire tv, android tv, smart tv, web, browser, online, download, install, mod apk, premium apk, no ads, apkpure, uptodown, play store, app store, mirror link, telegram
S5: not working, not opening, not loading, buffering, error, black screen, login problem, banned, blocked, region locked, vpn needed, site down, server down, alternative, new domain, new link, mirror, proxy, unblock, update, latest update
S6: hindi dubbed, tamil dubbed, telugu dubbed, bengali dubbed, malayalam dubbed, kannada dubbed, english dubbed, english sub, japanese audio, korean, urdu dubbed, free, no subscription, no login, hd quality, 1080p, 4k, ad free, latest episodes, all seasons

APK / SOFTWARE DOWNLOAD: mod apk, premium unlocked, cracked apk, no root required, latest version apk, old version apk. S5: not installing, installation failed, parse error, virus detected, is it safe, removed from play store

LOCAL SERVICE (any trade/service + any city): Generate THREE phrasing patterns, not just glued:
(a) modifier-after: "[service] near me"
(b) city/brand-FIRST natural standalone phrases in s9_custom: "[city] [service] company", "who does [service] in [city]"
(c) zero-location generic (Google geo-targets from IP): "[service] near me", "[service] today", "emergency [service]"
S4: near me, nearby, close to me, in my area, open now, open today, 24 hours, 24/7, same day, emergency, urgent, walk in, no appointment needed, free estimate, free quote, phone number, address, today, tonight, this weekend
S5: closed, not available, fully booked, too expensive, bad reviews, scam, alternative, cheaper, who fixes, who does, technician, specialist, company, contractor
S6: cheap, cheapest, affordable, budget, best, top rated, trusted, recommended, verified, licensed, insured, certified, experienced, local, family run, small business, independent

ECOMMERCE: S4: buy, buy online, price, cheapest price, discount, sale, coupon, free shipping, review, reviews, in stock, where to buy, official store. S5: fake, counterfeit, out of stock, refund, return policy, not delivered, damaged, alternative. S6: for men, for women, for kids, as gift, imported, original, luxury, premium, budget, worth buying, vs

FINANCE/SALARY/TAX: S4: calculator, calculate, formula, monthly, annual, gross, net, take home, after tax, online, free calculator, breakdown. S5: wrong result, not accurate, outdated, alternative, error. S6: for salaried, for self employed, for freelancers, by state, by country, 2025 rates

TOOL/CALCULATOR: S4: free, free online, no signup, web based, desktop app, mobile app, api, excel, bulk. S5: not working, wrong answer, inaccurate, bug, alternative. S6: for students, for professionals, for business, beginner friendly, advanced

BLOGGING/INFORMATIONAL: S4: for beginners, step by step, complete guide, tips, hacks, examples, checklist, template. S5: myths, mistakes to avoid, outdated advice, common errors. S6: for men, for women, for teens, for professionals, for seniors, on a budget, at home

SAAS: S4: pricing, plans, cost, free plan, free trial, login, sign up, download, api, integration, how to use. S5: not working, down, bugs, login problem, cancel subscription, refund, too expensive, alternative. S6: for small business, for startups, for enterprise, for freelancers, review, vs

GAMING: S4: pc, mobile, android, ios, console, how to play, free to play, cheat codes, mod, redeem code. S5: ban, account banned, lag, server down, crash. S6: beginner guide, pro tips, best settings, tier list

━━━ STEP 3: GEO DETECTION ━━━
Indian signals→India(in). German→Germany(de). Portuguese/Brazilian→Brazil(br). Spanish/Latin American→Mexico(mx)/Spain(es). Japanese/Korean→Japan(jp)/Korea(kr). Arabic→Saudi(sa)/UAE(ae). UK spelling/cities→UK(gb). US city name→USA(us). Unknown→USA(us).

━━━ STEP 3.5: QUESTION PREFIX COVERAGE (CRITICAL) ━━━
s3_question_prefixes MUST include BOTH the bare form AND the expanded form of every question pattern, because real searchers drop words inconsistently. For example, do not only include "is it" — also separately include bare "is". Do not only include "how do i" — also separately include bare "how". Required minimum bare forms that MUST always appear as standalone entries regardless of niche: "is", "are", "does", "do", "can", "will", "why", "how", "what", "where", "when", "who", "which", "should". Then ALSO add expanded/natural variants on top of these bare forms ("is it", "is the", "how do i", "how to", "why is", "why does", etc). Missing the bare form is a critical coverage gap — a real user typing "is anime salt safe" must be matched by a bare "is" prefix producing exactly "is anime salt", not only by "is it" producing "is it anime salt" which is a different, less common query.

━━━ STEP 4: INTENT CLASSIFICATION RULES ━━━
Classify keywords as: navigational, download, streaming, informational, commercial, transactional, local, troubleshoot.

━━━ OUTPUT FORMAT ━━━
Return this exact JSON:
{
  "niche": "specific niche in 3-5 words",
  "intent": "primary intent type",
  "intent_summary": "one sentence",
  "primary_market": "country name",
  "geo_recommendation": "2-letter code",
  "geo_reason": "one sentence",
  "output_language": "${lang}",
  "sweeps": {
    "s3_question_prefixes": ["minimum 12 question openers"],
    "s3_question_suffixes": ["minimum 18 qualifiers"],
    "s4_platform": ["minimum 25 modifiers — APPENDED after keyword"],
    "s5_problem": ["minimum 20 modifiers — APPENDED after keyword"],
    "s6_context": ["minimum 18 modifiers — APPENDED after keyword"],
    "s7_numbers": ["all relevant numbers"],
    "s9_custom": ["minimum 25 COMPLETE NATURAL QUERIES — NOT keyword+modifier concatenation. Full standalone phrases with the core entity in NATURAL word order, sometimes at start, middle, or implied. Include reordered variants, question forms, zero-extra-word generic forms. MOST important field for real search behaviour."],
    "s10_wildcard": ["minimum 15 intent-variant queries in varied natural order"]
  },
  "intent_rules": {
    "navigational": ["signal words"], "download": ["signal words"], "streaming": ["signal words"],
    "informational": ["signal words"], "commercial": ["signal words"], "transactional": ["signal words"], "troubleshoot": ["signal words"]
  },
  "core_entity_tokens": ["2-6 short tokens that must appear, in ANY order, for a Google suggestion to be considered relevant — strip filler words like 'in/near/the/a'. Example for 'appliance repair in flagstaff': [\\"appliance\\",\\"repair\\",\\"flagstaff\\"]"],
  "suggested_clarifications": [{"question": "...", "options": ["A","B","C"]}],
  "recursive_seeds": ["8-12 related keywords worth their own sweep"],
  "niche_notes": "3-4 sentences on niche characteristics, what to watch for, what noise looks like"
}`;
}

// ── RETRY WRAPPER ─────────────────────────────────────────────────────────────
// "Premature close" means the connection dropped mid-response — common on
// Railway when AI responses are large. Retry up to 3 times with backoff
// before giving up. Only retries on network errors, not API errors (quota etc).
async function withRetry(fn, label, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const isPrematureClose = e.message?.includes('Premature close') ||
                               e.message?.includes('network') ||
                               e.message?.includes('ECONNRESET') ||
                               e.message?.includes('fetch failed') ||
                               e.code === 'ECONNRESET';
      if (!isPrematureClose) throw e; // don't retry API errors (quota, auth, etc)
      if (attempt < maxAttempts) {
        const wait = attempt * 2000; // 2s, 4s backoff
        console.warn(`${label} attempt ${attempt} failed (${e.message}) — retrying in ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

// ── FETCH WITH TIMEOUT ────────────────────────────────────────────────────────
// node-fetch doesn't support AbortController timeout natively in all versions,
// so we wrap with a manual Promise.race timeout.
async function fetchWithTimeout(url, options, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: controller.signal });
    return r;
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(prompt) {
  return withRetry(async () => {
    const cfg = PROVIDERS.gemini;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.key}`;
    const r = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: 'application/json' }
      })
    }, 60000);
    const d = await r.json();
    if (d.error) {
      const code = d.error.code || d.error.status || 'unknown';
      throw new Error(`Gemini [${code}]: ${d.error.message || JSON.stringify(d.error)}`);
    }
    const candidate = d.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error('Gemini: response truncated (MAX_TOKENS)');
    }
    const text = candidate?.content?.parts?.[0]?.text || '';
    if (!text) throw new Error(`Gemini: empty response (finishReason: ${candidate?.finishReason || 'none'})`);
    return text;
  }, 'Gemini');
}

async function callAnthropic(prompt) {
  return withRetry(async () => {
    const cfg = PROVIDERS.anthropic;
    const r = await fetchWithTimeout(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
    }, 60000);
    const d = await r.json();
    if (d.error) throw new Error(`Anthropic: ${d.error.message}`);
    return d.content?.map(c => c.text || '').join('') || '';
  }, 'Anthropic');
}

async function callGroq(prompt) {
  return withRetry(async () => {
    const cfg = PROVIDERS.groq;
    const r = await fetchWithTimeout(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, max_tokens: 6000, messages: [{ role: 'user', content: prompt }], temperature: 0.2 })
    }, 60000);
    const d = await r.json();
    if (d.error) throw new Error(`Groq: ${d.error.message}`);
    return d.choices?.[0]?.message?.content || '';
  }, 'Groq');
}

async function callOpenAI(prompt) {
  return withRetry(async () => {
    const cfg = PROVIDERS.openai;
    const r = await fetchWithTimeout(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }], temperature: 0.2, response_format: { type: 'json_object' } })
    }, 60000);
    const d = await r.json();
    if (d.error) throw new Error(`OpenAI: ${d.error.message}`);
    return d.choices?.[0]?.message?.content || '';
  }, 'OpenAI');
}

function ruleBased(keyword, outputLang) {
  const kw = keyword.toLowerCase();
  const base = keyword;
  const lang = outputLang || 'en';

  const PACKS = {
    streaming_en: {
      s4: ['apk','android','ios','iphone','ipad','pc','windows','mac','laptop','chromebook','firestick','android tv','smart tv','kodi','web','browser','online','download','install','mod apk','premium apk','no ads','apkpure','uptodown','mirror link','telegram','play store'],
      s5: ['not working','not opening','not loading','not playing','buffering','banned','blocked','down','server down','alternative','alternatives','new link','new domain','mirror','proxy','vpn','region locked','login problem','black screen','error 404','site down','update not working'],
      s6: ['hindi dubbed','hindi dub','tamil dubbed','telugu dubbed','bengali dubbed','malayalam dubbed','kannada dubbed','english dubbed','english sub','english subtitles','urdu dubbed','in hindi','in tamil','in telugu','free','no subscription','no login','hd','1080p','4k','ad free','without ads','latest episodes','all seasons'],
      s7: ['1','2','3','4','5','6','7','8','9','10','v9','v10','9.8','episode 1','episode 2','episode 3','season 1','season 2','season 3','2023','2024','2025','2026'],
      s9: [`watch ${base} online`,`${base} hindi dubbed`,`${base} apk download`,`is ${base} safe`,`${base} not working fix`,`${base} alternatives`,`${base} official site`,`download ${base} apk`,`${base} english sub`,`${base} mod apk`,`${base} for pc`,`${base} no ads`,`${base} latest version`,`${base} mirror site`,`is ${base} legal`],
      s10: [`watch ${base}`,`download ${base}`,`stream ${base}`,`free ${base}`,`best ${base}`,`${base} official`,`${base} link`,`is ${base} legal`,`${base} review`,`unblock ${base}`,`${base} new domain`],
    },
    local_en: {
      s4: ['near me','nearby','close to me','open now','open today','24 hours','24/7','same day','emergency','no appointment','free estimate','free quote','phone number','address','today','tonight'],
      s5: ['closed','not available','too expensive','bad reviews','scam','alternative','better option','cheaper','who fixes','technician','company','contractor'],
      s6: ['cheap','affordable','best','top rated','trusted','licensed','insured','certified','experienced','local','small business'],
      s7: ['2024','2025'],
      s9: [`best ${base} near me`,`cheap ${base} near me`,`${base} open now`,`${base} reviews`,`${base} price`,`emergency ${base}`,`${base} same day`,`24 hour ${base}`,`who does ${base}`,`${base} company near me`,`${base} technician`],
      s10: [`best ${base}`,`cheap ${base}`,`${base} near me`,`${base} reviews`,`emergency ${base}`,`find ${base}`,`affordable ${base}`],
    },
    ecommerce_en: {
      s4: ['buy online','price','cheapest price','discount','sale','offer','coupon','cod','free shipping','review','reviews','in stock','where to buy','official store'],
      s5: ['fake','counterfeit','original vs fake','out of stock','refund','return','complaint','not delivered','damaged','alternative','substitute'],
      s6: ['for men','for women','for kids','as gift','imported','original','luxury','premium','budget','worth buying','honest review'],
      s7: ['under 500','under 1000','under 5000','2024','2025'],
      s9: [`buy ${base} online`,`${base} price`,`${base} review`,`${base} discount`,`${base} vs`,`best ${base}`,`${base} sale`,`original ${base} vs fake`,`${base} return policy`,`cheapest ${base}`],
      s10: [`buy ${base}`,`best ${base}`,`cheap ${base}`,`${base} review`,`${base} vs`,`${base} discount`,`${base} alternative`,`${base} worth it`],
    },
    finance_en: {
      s4: ['calculator','formula','monthly','annual','gross','net','take home','after tax','online','excel','free calculator','breakdown','estimate'],
      s5: ['wrong result','not accurate','outdated','alternative','error','not matching'],
      s6: ['for salaried','for self employed','for freelancers','for freshers','by state','by country','2025 rates'],
      s7: ['2024','2025','30000','50000','100000'],
      s9: [`${base} calculator`,`how to calculate ${base}`,`${base} 2025`,`${base} after tax`,`${base} formula`,`free ${base} calculator`],
      s10: [`calculate ${base}`,`${base} calculator`,`${base} formula`,`best ${base} calculator`],
    },
  };

  const niches = [
    { test: /apk|mod apk|cracked|premium unlocked|stream|anime|movie|series|episode|cartoon|dubbed|ott|netflix|crunchyroll|hotstar|jio|zee5|hulu|disney|watch online/, label:'Streaming / APK', intent:'streaming', geo:'in', pack:'streaming_en' },
    { test: /plumber|dentist|lawyer|restaurant|salon|barber|mechanic|electrician|cleaner|locksmith|doctor|gym|spa|hotel|appliance repair|near me|in [a-z]+$/, label:'Local Service', intent:'local', geo:'us', pack:'local_en' },
    { test: /buy|price|shop|sale|deal|discount|amazon|flipkart/, label:'Ecommerce Product', intent:'transactional', geo:'us', pack:'ecommerce_en' },
    { test: /salary|tax|income|loan|emi|investment|insurance|finance|budget|gross|net pay|calculator/, label:'Finance / Salary', intent:'informational', geo:'in', pack:'finance_en' },
  ];

  let detected = null;
  for (const n of niches) {
    if (n.test.test(kw)) { detected = n; break; }
  }

  const pack = detected ? PACKS[detected.pack] : PACKS['ecommerce_en'];

  const stopwords = new Set(['in','at','near','the','a','an','for','of','on','to']);
  const coreTokens = keyword.toLowerCase().split(/\s+/).filter(t => !stopwords.has(t) && t.length > 1);

  return {
    niche: detected?.label || 'General',
    intent: detected?.intent || 'informational',
    intent_summary: `User is searching for information related to ${keyword}`,
    primary_market: detected?.geo === 'in' ? 'India' : 'United States',
    geo_recommendation: detected?.geo || 'us',
    geo_reason: 'Detected from keyword signals (rule-based fallback)',
    output_language: lang,
    sweeps: {
      s3_question_prefixes: ['is','are','does','do','can','will','why','how','what','where','when','who','which','should','how to','why is','why does','what is','can i','does it','where to','when does','who makes','how does','should i','is it','is the'],
      s3_question_suffixes: ['safe','free','working','legal','real','good','worth it','legit','available','updated','down','official'],
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
    core_entity_tokens: coreTokens,
    suggested_clarifications: [{ question:'What is this keyword?', options:['A streaming platform/app','A product to buy','A local service','A topic to write about'] }],
    recursive_seeds: [`${keyword} app`,`${keyword} alternative`,`best ${keyword}`,`free ${keyword}`,`${keyword} review`,`${keyword} not working`,`${keyword} download`],
    niche_notes: 'Rule-based fallback active — both Gemini and Groq failed or are not configured.',
    _source: 'rule-based',
  };
}

let emptyStreak = 0;
const RATE_LIMIT_THRESHOLD = 5;

app.get('/api/suggest', async (req, res) => {
  const { q, gl, hl } = req.query;
  if (!q) return res.json({ suggestions: [], rate_limited: false, raw_count: 0 });

  const clients = ['firefox', 'chrome', 'toolbar'];
  let suggestions = [];
  let lastError = null;

  for (const client of clients) {
    try {
      const url = `http://suggestqueries.google.com/complete/search?client=${client}&q=${encodeURIComponent(q)}&hl=${hl||'en'}&gl=${gl||'us'}`;
      const r = await fetch(url, { timeout: 7000 });
      const d = await r.json();
      suggestions = d[1] || [];
      if (suggestions.length > 0) { emptyStreak = 0; break; }
    } catch(e) { lastError = e.message; }
  }

  if (suggestions.length === 0) emptyStreak++;
  else emptyStreak = 0;

  res.json({
    suggestions,
    raw_count: suggestions.length,
    rate_limited: emptyStreak >= RATE_LIMIT_THRESHOLD,
    empty_streak: emptyStreak,
    error: suggestions.length === 0 ? lastError : null,
  });
});

app.post('/api/modifiers', async (req, res) => {
  const { keyword, niche_hint, output_lang } = req.body;
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  const provider = getActiveProvider();
  const prompt = buildPrompt(keyword, niche_hint, output_lang);

  if (!provider) {
    console.log('No AI provider configured — using rule-based fallback');
    return res.json(ruleBased(keyword, output_lang));
  }

  let primaryError = null;
  try {
    let raw = '';
    if (provider === 'gemini')         raw = await callGemini(prompt);
    else if (provider === 'anthropic') raw = await callAnthropic(prompt);
    else if (provider === 'groq')      raw = await callGroq(prompt);
    else if (provider === 'openai')    raw = await callOpenAI(prompt);

    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    parsed._source = provider;
    parsed._model = PROVIDERS[provider].model;
    parsed._active_provider = provider;
    return res.json(parsed);

  } catch(e) {
    primaryError = e.message;
    console.error(`${provider} failed: ${e.message}`);
  }

  if (provider !== 'groq' && PROVIDERS.groq.key) {
    try {
      console.log(`${provider} failed — trying Groq as fallback...`);
      const raw = await callGroq(prompt);
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      parsed._source = 'groq';
      parsed._model = PROVIDERS.groq.model;
      parsed._active_provider = 'groq';
      parsed._fallback_from = provider;
      parsed._primary_error = primaryError;
      return res.json(parsed);
    } catch(e2) {
      console.error(`Groq also failed: ${e2.message}`);
      primaryError = `${provider}: ${primaryError} | groq: ${e2.message}`;
    }
  }

  const fb = ruleBased(keyword, output_lang);
  fb._source = 'rule-based';
  fb._ai_error = primaryError;
  fb._active_provider = 'rule-based';
  res.json(fb);
});

// ── SORT ENDPOINT — AI classifies a batch of ALREADY-COLLECTED keywords ──────
// Used after a sweep completes (or on Review items) to split into
// relevant vs review/filtered based on actual intent understanding,
// not literal token matching. Never runs mid-sweep.
function buildSortPrompt(keyword, niche, intentSummary, keywords) {
  const list = keywords.map((k, i) => `${i+1}. ${k}`).join('\n');
  return `You are sorting a batch of real Google Autocomplete suggestions that were collected for the keyword/niche below. Your job is to decide, using your understanding of the niche and intent — NOT literal word matching — which suggestions are genuinely relevant to someone interested in this keyword, and which are not.

KEYWORD: "${keyword}"
NICHE: ${niche || 'unknown — infer from the keyword and the suggestions themselves'}
INTENT SUMMARY: ${intentSummary || 'infer from context'}

A suggestion counts as RELEVANT if a person interested in "${keyword}" would plausibly want to see it — even if it does not contain the exact keyword text, as long as it matches the same underlying intent, audience, or topic. A suggestion counts as NOT RELEVANT if it is about something different that merely shares a word (e.g. a different meaning of a word in the keyword, an unrelated place, an unrelated product).

SUGGESTIONS TO SORT (numbered, ${keywords.length} total):
${list}

Return ONLY raw JSON, no markdown, in this exact shape:
{
  "relevant": [list of the exact suggestion strings that are relevant],
  "not_relevant": [list of the exact suggestion strings that are not relevant]
}
Every suggestion from the input list must appear in exactly one of the two arrays. Do not invent new strings — only use the exact text given.`;
}

app.post('/api/sort', async (req, res) => {
  const { keyword, niche, intent_summary, keywords } = req.body;
  if (!keywords?.length) return res.json({ relevant: [], not_relevant: [] });

  const provider = getActiveProvider();
  if (!provider) {
    // No AI available — return everything as relevant, nothing sorted
    return res.json({ relevant: keywords, not_relevant: [], _source: 'none', _note: 'No AI provider configured, all items passed through as relevant.' });
  }

  // Chunk large lists to stay within token limits — 60 keywords per call
  const CHUNK = 60;
  const chunks = [];
  for (let i = 0; i < keywords.length; i += CHUNK) chunks.push(keywords.slice(i, i + CHUNK));

  let allRelevant = [];
  let allNotRelevant = [];
  let usedProvider = provider;
  let lastErr = null;

  for (const chunk of chunks) {
    const prompt = buildSortPrompt(keyword, niche, intent_summary, chunk);
    try {
      let raw = '';
      if (provider === 'gemini')         raw = await callGemini(prompt);
      else if (provider === 'anthropic') raw = await callAnthropic(prompt);
      else if (provider === 'groq')      raw = await callGroq(prompt);
      else if (provider === 'openai')    raw = await callOpenAI(prompt);

      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      allRelevant.push(...(parsed.relevant || []));
      allNotRelevant.push(...(parsed.not_relevant || []));
    } catch (e) {
      lastErr = e.message;
      // Try groq fallback for this chunk if primary wasn't groq
      if (provider !== 'groq' && PROVIDERS.groq.key) {
        try {
          const raw = await callGroq(prompt);
          const clean = raw.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(clean);
          allRelevant.push(...(parsed.relevant || []));
          allNotRelevant.push(...(parsed.not_relevant || []));
          usedProvider = 'groq';
          continue;
        } catch (e2) {
          lastErr = `${provider}: ${e.message} | groq: ${e2.message}`;
        }
      }
      // Chunk failed entirely — pass its items through as not_relevant
      // so nothing silently vanishes; user can see them and re-run.
      allNotRelevant.push(...chunk);
    }
  }

  res.json({
    relevant: allRelevant,
    not_relevant: allNotRelevant,
    _source: usedProvider,
    _error: lastErr,
  });
});

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
      if (signals.some(s => kl.includes(s))) return { kw, intent };
    }
    return { kw, intent: 'informational' };
  });

  res.json({ classified });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const p = getActiveProvider();
  console.log(`\nAlphabet Soup v5 → http://localhost:${PORT}`);
  console.log(`AI Provider : ${p ? `${p} (${PROVIDERS[p].model})` : 'NONE — rule-based active'}`);
  console.log(`Gemini key  : ${PROVIDERS.gemini.key ? 'present' : 'missing'}`);
  console.log(`Groq key    : ${PROVIDERS.groq.key ? 'present' : 'missing'}`);
  console.log(`─────────────────────────────────────────\n`);
});
