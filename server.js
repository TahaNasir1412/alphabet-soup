const express = require('express');
// Node 22 has native fetch built-in — no node-fetch needed
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
  groq:      { key: process.env.GROQ_API_KEY,       url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b' },
  openai:    { key: process.env.OPENAI_API_KEY,     url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
};

function getActiveProvider() {
  for (const [name, cfg] of Object.entries(PROVIDERS)) {
    if (cfg.key) return name;
  }
  return null;
}

// ── NATIVE ALPHABETS ──────────────────────────────────────────────────────────
// Used for S1 (Suffix A-Z), S2 (Prefix A-Z), S8 (Deep double-char) so those
// sweeps glue on real letters from the target language's script instead of
// always defaulting to Latin a-z. The AI is asked to generate this per-request
// (it knows far more scripts than we can hardcode), but these are a safety net
// for when the AI omits the field, or when running in rule-based fallback mode.
const ALPHABETS = {
  en: 'abcdefghijklmnopqrstuvwxyz'.split(''),
  ar: ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'],
  ur: ['ا','ب','پ','ت','ٹ','ث','ج','چ','ح','خ','د','ڈ','ذ','ر','ڑ','ز','ژ','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ک','گ','ل','م','ن','و','ہ','ی'],
  ru: ['а','б','в','г','д','е','ё','ж','з','и','й','к','л','м','н','о','п','р','с','т','у','ф','х','ц','ч','ш','щ','ъ','ы','ь','э','ю','я'],
};
function defaultAlphabet(lang) {
  return ALPHABETS[lang] || ALPHABETS.en;
}

// Ensures every /api/modifiers response — AI or rule-based — always has these
// fields in a safe shape, even if the AI model omits or malforms them.
function fillModifierDefaults(parsed, lang) {
  if (!Array.isArray(parsed.native_alphabet) || parsed.native_alphabet.length === 0) {
    parsed.native_alphabet = defaultAlphabet(lang);
  }
  if (typeof parsed.dialect_used !== 'string') parsed.dialect_used = '';
  if (typeof parsed.arabizi_keyword !== 'string') parsed.arabizi_keyword = '';
  parsed.sweeps = parsed.sweeps || {};
  if (!Array.isArray(parsed.sweeps.s11_arabizi)) parsed.sweeps.s11_arabizi = [];
  if (!Array.isArray(parsed.sweeps.s12_spelling_variants)) parsed.sweeps.s12_spelling_variants = [];
  // s11 is Arabic-only by design — never let a non-Arabic response carry content here,
  // regardless of what the model returned.
  if (lang !== 'ar') parsed.sweeps.s11_arabizi = [];
  return parsed;
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
    ? `OUTPUT LANGUAGE IS "${lang}". ALL modifier values, query strings, and example phrases INSIDE "sweeps" (and "arabizi_keyword" if present) MUST be written in ${lang}. JSON keys stay in English. See rule 10 below for the fields that stay in English regardless.`
    : 'Output language is English.';

  return `RULES — READ FIRST:
1. Return ONLY a raw JSON object. Zero markdown. Zero explanation. No text outside the JSON.
2. ${langNote}
3. Every modifier list must be EXHAUSTIVE — aim for the MAXIMUM realistic modifiers.
4. Only include modifiers that REAL users actually type.
5. Modifiers must be typed as they appear in a search box — lowercase, natural phrasing.
6. CRITICAL — NATURAL QUERY ORDER: real searchers do NOT always glue a modifier onto the end of the exact keyword phrase. Someone searching for a local service does not always type "[service] in [city] near me" — they're just as likely to type "[city] [service]", "[service] company [city]", "who does [service] in [city]". This applies to every niche — ecommerce ("buy nike shoes online" vs "nike shoes where to buy"), SaaS ("notion pricing" vs "how much does notion cost"), streaming, finance, anything. Model every realistic word order, not just keyword+modifier concatenation.
7. GRAMMATICAL CORRECTNESS: every modifier, when concatenated with the keyword, must form a grammatically correct, natural phrase in ${lang} — never a literal word-for-word translation of an English template glued onto the keyword. Inflect adjectives/nouns for gender, number, and case exactly as required to agree with the keyword's head noun wherever ${lang} has such agreement (e.g. Arabic, Russian, Spanish, French, German). If gluing a modifier directly after the keyword would be ungrammatical or unnatural in ${lang}, do not force it — put that idea in s9/s10 as a properly-ordered natural query instead.
8. DELIBERATE CODE-SWITCHING ONLY: real ${lang} speakers often keep certain terms in English/Latin script even mid-sentence — brand names, platform/protocol names (iOS, Android, PWA, API, Chrome), some tech jargon. Use English/Latin-script terms ONLY where that reflects genuine real-world search behavior for ${lang} speakers. Translate everyday generic words (free, download, best, near me, safe, price, review, working, alternative) into ${lang} — do not default to English out of convenience.
9. NUMERALS: for sweeps.s7_numbers, use the numeral glyphs real ${lang} speakers actually type into Google search. For the overwhelming majority of languages/markets — including Arabic, Hindi, Urdu — this means ordinary Western digits (0-9) even though the language has its own native numeral system, because that is what people actually type online. Only use native numeral glyphs (e.g. Eastern Arabic-Indic ١٢٣) if you are confident that specific market genuinely searches that way, not merely because the script has its own numerals.
10. ENGLISH-ONLY META FIELDS: regardless of ${lang}, the following fields must ALWAYS be written in English so the person running this tool (who may not read ${lang}) can understand what you detected: "niche", "intent", "intent_summary", "geo_reason", "niche_notes", "dialect_used", and the "question"/"options" text inside "suggested_clarifications". Every other text field — everything inside "sweeps" — must be written in ${lang}, per rule 2. Do not mix these two groups.

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
Identify which niche fits. Use your training knowledge of what modifiers real users type for each niche type. Key niche signals:

STREAMING/APK: focus on device access (apk, android, ios, pc, firestick, smart tv), availability issues (not working, banned, blocked, mirror, vpn), language variants (hindi dubbed, tamil dubbed, english sub), and free/no-login access patterns.

LOCAL SERVICE (trade + city): THREE patterns — (a) glued modifier after keyword e.g. "near me", (b) city-FIRST natural phrases in s9 e.g. "[city] [service] company", (c) zero-location generic e.g. "emergency [service]". S4 focuses on proximity/availability, S5 on trust/alternatives, S6 on quality signals.

ECOMMERCE: purchase intent (buy, price, discount, coupon), trust issues (fake, return policy), audience segments (for men, for women, as gift).

FINANCE/SALARY: calculation focus (calculator, formula, monthly, after tax), accuracy concerns (wrong result, outdated), demographic variants (for salaried, by country).

SAAS: pricing/trial, login/signup, integrations, cancellation, alternatives.

GAMING: platform access, cheats/mods, account issues, tier lists.

BLOGGING/INFO: content angles (guide, tips, checklist), counterpoints (myths, mistakes), audiences (for beginners, for seniors).

For EVERY niche: s9_custom must contain minimum 25 COMPLETE NATURAL QUERIES as full standalone phrases in varied word order — not keyword+modifier concatenation. s10_wildcard must have 15+ action-first variants.

━━━ STEP 3: GEO DETECTION ━━━
Indian signals→India(in). German→Germany(de). Portuguese/Brazilian→Brazil(br). Spanish/Latin American→Mexico(mx)/Spain(es). Japanese/Korean→Japan(jp)/Korea(kr). Arabic→Saudi(sa)/UAE(ae). UK spelling/cities→UK(gb). US city name→USA(us). Unknown→USA(us).

If output_language is "ar" (Arabic): real search behavior varies significantly by dialect, not just Modern Standard Arabic (MSA). Based on the detected geo_recommendation, bias every Arabic modifier and s9/s10/s11 query toward that region's actual colloquial phrasing — Egyptian Arabic for Egypt, Gulf/Khaleeji for Saudi/UAE/Kuwait/Qatar, Levantine for Jordan/Lebanon/Syria/Palestine, Maghrebi for Morocco/Algeria/Tunisia — rather than defaulting to formal MSA, unless the keyword itself is formal/religious/legal in register (in which case MSA is correct and expected). Record which dialect you used in the "dialect_used" output field.

━━━ STEP 3.5: QUESTION PREFIX COVERAGE (CRITICAL) ━━━
s3_question_prefixes MUST include BOTH the bare form AND the expanded form of every question pattern IN ${lang}, because real searchers drop words inconsistently in every language, not just English.

Required minimum CONCEPTS that must always appear as standalone bare-form entries — the words below are naming the CONCEPT only, you must translate each into ${lang} exactly as a native ${lang} speaker would type it alone. Do NOT return these English words themselves unless lang is actually "en": is, are, does, do, can, will, why, how, what, where, when, who, which, should.
- For English (lang=en): use the literal English words above.
- For Arabic (lang=ar): هل (is/does), لماذا (why), كيف (how), ما / ماذا (what), أين (where), متى (when), من (who), أي (which), يمكن / هل يمكن (can), سوف / هل سوف (will).
- For Russian (lang=ru): это (is), почему (why), как (how), что (what), где (where), когда (when), кто (who), какой (which), можно (can).
- For any other language: apply the same principle — translate each concept into that language's own natural bare interrogative/auxiliary word.
Then ALSO add expanded/natural variants on top of these bare forms, in ${lang} (the equivalent of "is it", "how do i", "why is", etc — NOT the English phrases themselves for non-English output). Missing the bare form in ${lang} is a critical coverage gap — a real user typing the ${lang} equivalent of "is anime salt safe" must be matched by the bare translated "is"-equivalent producing exactly that short query, not only by a longer expanded form.

━━━ STEP 4: INTENT CLASSIFICATION RULES ━━━
Classify keywords as: navigational, download, streaming, informational, commercial, transactional, local, troubleshoot.

━━━ STEP 5: NATIVE ALPHABET FOR PREFIX/SUFFIX SWEEPS (CRITICAL for non-English) ━━━
Separately from the modifier lists above, this tool also runs a raw "Suffix A-Z" and "Prefix A-Z" sweep — appending/prepending each letter of the alphabet to the base keyword, one at a time (e.g. in English: "${keyword} a", "${keyword} b", ... "${keyword} z"). This must use the REAL native script of "${lang}", not English letters, whenever the output language is not English.
- If ${lang} uses an alphabet or abjad (Arabic, Russian/Cyrillic, Spanish, French, German, Turkish, Polish, etc.), return the ordered list of its individual letters exactly as a native speaker would type them one at a time in a search box.
- If ${lang} uses a non-alphabetic script where single-letter typing isn't how autocomplete is normally explored (e.g. Japanese, Korean, Hindi/Devanagari, Chinese), return your best approximation of the atomic characters/symbols real users incrementally type in that script (e.g. Japanese hiragana gojūon order, Hangul basic consonants, Devanagari consonants+vowels) — do not just return English a-z as a placeholder.
- For English, return exactly the 26 letters a-z in order.
- Do NOT include this list inside "sweeps" — it is a separate top-level field.

━━━ STEP 6: SPELLING VARIANTS ━━━
For ANY language: if this specific language/keyword has a common source of spelling ambiguity real searchers actually type differently — Arabic hamza confusion (أ/إ/آ vs bare ا) or ة vs ه, French/Spanish accents included vs dropped, German ä/ö/ü/ß vs ae/oe/ue/ss — provide up to 5 alternate valid spellings of the exact base keyword in "sweeps.s12_spelling_variants". Return an empty array if no such ambiguity genuinely applies to this keyword.

(Arabizi/chat-script transliteration is generated by a separate call — do not attempt it here.)

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
  "native_alphabet": ["ordered list of individual native-script letters/characters for the Suffix A-Z / Prefix A-Z sweeps — see STEP 5 above. For English: [\\"a\\",\\"b\\",...,\\"z\\"]"],
  "dialect_used": "if output_language is \\"ar\\": which Arabic dialect the modifiers above are biased toward (e.g. \\"Egyptian Arabic\\", \\"Gulf/Khaleeji Arabic\\", \\"Modern Standard Arabic\\") — see STEP 3. Empty string otherwise.",
  "sweeps": {
    "s3_question_prefixes": ["minimum 12 question openers"],
    "s3_question_suffixes": ["minimum 18 qualifiers"],
    "s4_platform": ["minimum 25 modifiers — APPENDED after keyword"],
    "s5_problem": ["minimum 20 modifiers — APPENDED after keyword"],
    "s6_context": ["minimum 18 modifiers — APPENDED after keyword"],
    "s7_numbers": ["all relevant numbers"],
    "s9_custom": ["minimum 25 COMPLETE NATURAL QUERIES — NOT keyword+modifier concatenation. Full standalone phrases with the core entity in NATURAL word order, sometimes at start, middle, or implied. Include reordered variants, question forms, zero-extra-word generic forms. MOST important field for real search behaviour."],
    "s10_wildcard": ["minimum 15 intent-variant queries in varied natural order"],
    "s12_spelling_variants": ["up to 5 alternate valid spellings of the exact base keyword — see STEP 6. Empty array if not applicable."]
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
// Retries on network errors AND Gemini 503 (high demand) with backoff.
// Does NOT retry real API errors (auth failures, quota exceeded, bad request).
async function withRetry(fn, label, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const isRetryable = e.message?.includes('Premature close') ||
                          e.message?.includes('network') ||
                          e.message?.includes('ECONNRESET') ||
                          e.message?.includes('fetch failed') ||
                          e.message?.includes('[503]') ||
                          e.message?.includes('aborted') ||
                          e.message?.includes('operation was aborted') ||
                          e.name === 'AbortError' ||
                          e.code === 'ECONNRESET';
      if (!isRetryable) throw e;
      if (attempt < maxAttempts) {
        const wait = attempt * 2000;
        console.warn(`${label} attempt ${attempt} failed (${e.message}) — retrying in ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

// ── FETCH WITH TIMEOUT ────────────────────────────────────────────────────────
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

// ── SAFE JSON PARSE FROM RESPONSE ─────────────────────────────────────────────
// Reads response as text first, checks for HTML/gateway errors before parsing.
async function safeJson(r, label) {
  const text = await r.text();
  if (!text || text.trim().startsWith('<') || text.includes('upstream error')) {
    throw new Error(`${label}: gateway error — ${text.slice(0, 120)}`);
  }
  return JSON.parse(text);
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
        generationConfig: { temperature: 0.2, maxOutputTokens: 65536, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } }
      })
    }, 180000);
    const d = await safeJson(r, 'Gemini');
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
      body: JSON.stringify({ model: cfg.model, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] })
    }, 120000);
    const d = await safeJson(r, 'Anthropic');
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
      body: JSON.stringify({ model: cfg.model, max_tokens: 8000, messages: [{ role: 'user', content: prompt }], temperature: 0.2 })
    }, 120000);
    const d = await safeJson(r, 'Groq');
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
      body: JSON.stringify({ model: cfg.model, max_tokens: 8000, messages: [{ role: 'user', content: prompt }], temperature: 0.2, response_format: { type: 'json_object' } })
    }, 120000);
    const d = await safeJson(r, 'OpenAI');
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
    native_alphabet: defaultAlphabet(lang),
    dialect_used: '',
    arabizi_keyword: '',
    sweeps: {
      s3_question_prefixes: ['is','are','does','do','can','will','why','how','what','where','when','who','which','should','how to','why is','why does','what is','can i','does it','where to','when does','who makes','how does','should i','is it','is the'],
      s3_question_suffixes: ['safe','free','working','legal','real','good','worth it','legit','available','updated','down','official'],
      s4_platform: pack.s4,
      s5_problem: pack.s5,
      s6_context: pack.s6,
      s7_numbers: pack.s7,
      s9_custom: pack.s9,
      s10_wildcard: pack.s10,
      s11_arabizi: [],
      s12_spelling_variants: [],
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
      const url = `http://suggestqueries.google.com/complete/search?client=${client}&q=${encodeURIComponent(q)}&hl=${hl||'en'}&gl=${gl||'us'}&ie=utf-8&oe=utf-8`;
      const sc = new AbortController();
      const st = setTimeout(() => sc.abort(), 7000);
      const r = await fetch(url, { signal: sc.signal });
      clearTimeout(st);
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
    const parsed = fillModifierDefaults(JSON.parse(clean), output_lang);
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
      const parsed = fillModifierDefaults(JSON.parse(clean), output_lang);
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

// ── ARABIC EXTRAS ENDPOINT (Arabizi) ──────────────────────────────────────────
// Split out from the main /api/modifiers call on purpose: generating 15+ full
// natural-language sentences in a second script (Arabizi) inside the same
// mega-prompt was a meaningful contributor to Gemini's MAX_TOKENS truncation.
// This is its own small call so a failure here never breaks S1-S10.
function buildArabicExtrasPrompt(keyword, nicheHint, dialectUsed) {
  return `Return ONLY raw JSON, no markdown, no explanation outside the JSON.

You are transliterating an Arabic search keyword into "Arabizi" — Arabic typed using Latin letters plus chat numerals for sounds with no direct Latin equivalent (2=ء, 3=ع, gh/3'=غ, kh/5=خ, 6=ط, 6'=ظ, 7=ح, 8 or 9=ق) — the way many Arabic speakers, especially mobile and younger users, actually type when Arabic script isn't convenient. A meaningful share of real Google Autocomplete search volume for Arabic topics happens in Arabizi, not Arabic script, so this matters for real keyword coverage.

ARABIC KEYWORD: "${keyword}"
${nicheHint ? `CONTEXT: ${nicheHint}` : ''}
${dialectUsed ? `DIALECT IN USE: ${dialectUsed} — write the Arabizi in this dialect's natural informal phrasing, not a word-for-word transliteration of formal MSA.` : ''}

Return this exact JSON:
{
  "arabizi_keyword": "the base keyword transliterated into realistic Arabizi",
  "s11_arabizi": ["minimum 15 COMPLETE natural search queries written fully in Arabizi script — real informal phrasing an Arabizi typer would use, varied word order, mix of questions and direct phrases — not the Arabic-script keyword with letters swapped one-for-one"]
}`;
}

app.post('/api/arabic-extras', async (req, res) => {
  const { keyword, niche_hint, dialect_used } = req.body;
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  const provider = getActiveProvider();
  if (!provider) return res.json({ arabizi_keyword: '', s11_arabizi: [] });

  const prompt = buildArabicExtrasPrompt(keyword, niche_hint, dialect_used);

  async function callProvider(p) {
    let raw = '';
    if (p === 'gemini') raw = await callGemini(prompt);
    else if (p === 'anthropic') raw = await callAnthropic(prompt);
    else if (p === 'groq') raw = await callGroq(prompt);
    else if (p === 'openai') raw = await callOpenAI(prompt);
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  }

  try {
    const parsed = await callProvider(provider);
    return res.json({
      arabizi_keyword: typeof parsed.arabizi_keyword === 'string' ? parsed.arabizi_keyword : '',
      s11_arabizi: Array.isArray(parsed.s11_arabizi) ? parsed.s11_arabizi : [],
    });
  } catch (e) {
    console.error(`Arabic extras (${provider}) failed: ${e.message}`);
  }

  if (provider !== 'groq' && PROVIDERS.groq.key) {
    try {
      const parsed = await callProvider('groq');
      return res.json({
        arabizi_keyword: typeof parsed.arabizi_keyword === 'string' ? parsed.arabizi_keyword : '',
        s11_arabizi: Array.isArray(parsed.s11_arabizi) ? parsed.s11_arabizi : [],
      });
    } catch (e2) {
      console.error(`Arabic extras groq fallback failed: ${e2.message}`);
    }
  }

  // Honest failure — empty, never fabricated Latin+Arabic mashups.
  res.json({ arabizi_keyword: '', s11_arabizi: [] });
});

// ── TRANSLATE ENDPOINT ────────────────────────────────────────────────────────
// Batch-translates collected/relevant keywords into English so the person
// running the tool can understand what a non-English keyword actually means,
// regardless of which language the sweep itself was run in.
function buildTranslatePrompt(keywords, sourceLang) {
  const list = keywords.map((k, i) => `${i + 1}. ${k}`).join('\n');
  return `Translate each of the following search queries into short, natural English — a plain gloss that lets an English speaker understand what the query means and is searching for. Not a flowery rewrite. Keep brand/product names as-is.

SOURCE LANGUAGE: ${sourceLang || 'auto-detect'}
QUERIES (numbered, ${keywords.length} total):
${list}

Return ONLY raw JSON, no markdown:
{ "translations": [{"kw": "<exact original query text, unchanged>", "en": "<English translation>"}] }
Every query from the input must appear exactly once, using the EXACT original string for "kw".`;
}

app.post('/api/translate', async (req, res) => {
  const { keywords, source_lang } = req.body;
  if (!keywords?.length) return res.json({ translations: [] });

  const provider = getActiveProvider();
  if (!provider) {
    return res.json({ translations: keywords.map(kw => ({ kw, en: null })), _note: 'No AI provider configured' });
  }

  const CHUNK = 50;
  const chunks = [];
  for (let i = 0; i < keywords.length; i += CHUNK) chunks.push(keywords.slice(i, i + CHUNK));

  let all = [];
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    if (ci > 0) await new Promise(r => setTimeout(r, 4000));

    const prompt = buildTranslatePrompt(chunk, source_lang);
    try {
      let raw = '';
      if (provider === 'gemini') raw = await callGemini(prompt);
      else if (provider === 'anthropic') raw = await callAnthropic(prompt);
      else if (provider === 'groq') raw = await callGroq(prompt);
      else if (provider === 'openai') raw = await callOpenAI(prompt);
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      all.push(...(parsed.translations || []));
    } catch (e) {
      console.error(`Translate chunk ${ci + 1} primary failed: ${e.message}`);
      if (provider !== 'groq' && PROVIDERS.groq.key) {
        try {
          await new Promise(r => setTimeout(r, 3000));
          const raw = await callGroq(prompt);
          const clean = raw.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(clean);
          all.push(...(parsed.translations || []));
          continue;
        } catch (e2) {
          console.error(`Translate chunk ${ci + 1} groq fallback failed: ${e2.message}`);
        }
      }
      // Honest failure for this chunk — null, not a fabricated/untranslated guess.
      all.push(...chunk.map(kw => ({ kw, en: null })));
    }
  }

  res.json({ translations: all });
});

// ── SORT ENDPOINT ─────────────────────────────────────────────────────────────
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
    return res.json({ relevant: keywords, not_relevant: [], _source: 'none', _note: 'No AI provider configured — all items passed through.' });
  }

  // Smaller chunks + delay between them to avoid Groq TPM rate limits
  // Groq free tier = 12k tokens/min. Each chunk ~40 keywords ≈ 4-5k tokens.
  // 6 second delay between chunks keeps us well under the limit.
  const CHUNK = 40;
  const chunks = [];
  for (let i = 0; i < keywords.length; i += CHUNK) chunks.push(keywords.slice(i, i + CHUNK));

  let allRelevant = [];
  let allNotRelevant = [];
  let usedProvider = provider;
  let lastErr = null;

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];

    // Delay between chunks to respect Groq TPM limit
    if (ci > 0) {
      console.log(`Sort chunk ${ci+1}/${chunks.length} — waiting 6s for rate limit reset...`);
      await new Promise(r => setTimeout(r, 6000));
    }

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
      console.error(`Sort chunk ${ci+1} primary failed: ${e.message}`);

      // Try Groq fallback for this chunk
      if (provider !== 'groq' && PROVIDERS.groq.key) {
        try {
          // Extra wait before Groq fallback to let rate limit recover
          await new Promise(r => setTimeout(r, 4000));
          const raw = await callGroq(prompt);
          const clean = raw.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(clean);
          allRelevant.push(...(parsed.relevant || []));
          allNotRelevant.push(...(parsed.not_relevant || []));
          usedProvider = 'groq';
          continue;
        } catch (e2) {
          console.error(`Sort chunk ${ci+1} Groq fallback also failed: ${e2.message}`);
          lastErr = `${provider}: ${e.message} | groq: ${e2.message}`;
        }
      }

      // Both failed for this chunk — send to not_relevant so nothing vanishes
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
