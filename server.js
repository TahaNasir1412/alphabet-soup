const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── PROVIDERS ────────────────────────────────────────────────────────────────
const PROVIDERS = {
  anthropic: { key: process.env.ANTHROPIC_API_KEY, url: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-6' },
  groq:      { key: process.env.GROQ_API_KEY,      url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-70b-versatile' },
  gemini:    { key: process.env.GEMINI_API_KEY,     model: 'gemini-1.5-flash' },
  openai:    { key: process.env.OPENAI_API_KEY,     url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
};

function getActiveProvider() {
  for (const [name, cfg] of Object.entries(PROVIDERS)) {
    if (cfg.key) return name;
  }
  return null;
}

// ── PROMPT ───────────────────────────────────────────────────────────────────
function buildPrompt(keyword, nicheHint, outputLang) {
  const langInstruction = outputLang && outputLang !== 'en'
    ? `LANGUAGE INSTRUCTION: The user is targeting a ${outputLang}-language market. Generate ALL modifiers, custom queries, and wildcard patterns in ${outputLang} language — not English. The JSON keys must remain in English but all modifier VALUES must be in ${outputLang}. For example if outputLang is "pt" (Portuguese/Brazilian), write modifiers like "grátis", "como usar", "não está funcionando", "alternativa", etc.`
    : `LANGUAGE INSTRUCTION: Generate all modifiers in English.`;

  return `CRITICAL RULES:
1. Return ONLY valid JSON. No markdown. No explanation. No text before or after the JSON.
2. ${langInstruction}
3. JSON keys must always be in English regardless of output language.
4. Generate modifiers that REAL users actually type — not what sounds logical but what people actually search.

You are a senior SEO keyword researcher. Analyze this keyword and generate the most accurate Google Autocomplete sweep modifiers possible.

KEYWORD: "${keyword}"
${nicheHint ? `USER CONTEXT: "${nicheHint}"` : ''}
OUTPUT LANGUAGE: ${outputLang || 'en'}

WHAT THIS TOOL DOES:
It appends modifiers to the keyword and collects Google Autocomplete suggestions. Example: keyword "anime salt" + modifier "apk" → Google suggests "anime salt apk download", "anime salt apk latest version" etc. Your modifiers must be words/phrases real users type AFTER or BEFORE this keyword on Google.

STEP 1 — UNDERSTAND THE KEYWORD DEEPLY:
What type of thing is "${keyword}"? Brand name? App? Service? Product? Tool? Concept? Platform?
What does the searcher ACTUALLY want — not what the words say, but the real goal?
Examples of correct reasoning:
- "anime salt" → looks like food but is actually a free anime streaming platform. Searcher wants to watch anime free.
- "salary calculator germany" → user wants their exact take-home pay after German taxes.
- "plumber london" → user needs someone to fix pipes RIGHT NOW.
- "nike air max" → user wants to buy shoes or check price.
- "notion alternative" → user is frustrated with Notion and wants something else.

STEP 2 — DETECT THE NICHE:
Apply the correct niche profile. If the keyword fits multiple, pick the dominant one and blend modifiers.

STREAMING/OTT/WATCH ONLINE: Any platform, site, or app where users watch videos, anime, movies, series, cartoons for free. Signals: watch, stream, anime, movie, series, dubbed, any OTT name.
→ Modifiers focus on: device access (apk/android/pc/firestick), language of content (dubbed/subbed/original), problems (not working/banned/new link/mirror), versions

APK/APP DOWNLOAD: Any Android app, APK file, mobile software. Signals: apk, app name without obvious category, install, android.
→ Modifiers focus on: versions (v9/v10/latest), device types, safety (virus/safe/malware), installation issues

LOCAL SERVICE: Any service business, professional, or physical location. Signals: plumber, dentist, salon, restaurant, lawyer, doctor, mechanic, any profession + city name.
→ Modifiers focus on: proximity (near me/open now), urgency (emergency/same day), trust (reviews/licensed), price

ECOMMERCE/PRODUCT: Physical product, brand, or shopping intent. Signals: brand + product type, buy, price, any product name.
→ Modifiers focus on: price/deals, authenticity (original/fake), delivery, comparison

TOOL/CALCULATOR/UTILITY: Digital tool, calculator, generator, converter. Signals: calculator, tool, generator, checker, converter, planner.
→ Modifiers focus on: free/paid, accuracy, integrations (excel/sheets), use cases

FINANCE/SALARY/TAX: Financial calculations, money, investments. Signals: salary, tax, loan, EMI, investment, income, budget.
→ Modifiers focus on: calculation terms (gross/net/monthly), specific amounts, professions

BLOGGING/INFORMATIONAL: Pure information seeking, how-to, listicle topics. Signals: how to, best, tips, guide, tutorial, what is, benefits, mistakes, ideas.
→ Modifiers focus on: content angles (for beginners/advanced), timeframes, specific audiences

SAAS/SOFTWARE: Named software product, platform, or service subscription. Signals: recognizable software brand name.
→ Modifiers focus on: pricing, alternatives, integrations, tutorials, comparisons

GAMING: Video games, gaming platforms, in-game items. Signals: game names, gaming terms, UID, rank, server, clan, cheat, hack.
→ Modifiers focus on: platforms (pc/mobile/console), game modes, items, hacks/cheats, clans

STEP 3 — GENERATE LANGUAGE-CORRECT MODIFIERS:
All modifier VALUES must be in the OUTPUT LANGUAGE (${outputLang || 'en'}).
Think: what would a real user in that language market actually type into Google?

Return this exact JSON structure:
{
  "niche": "3-5 word niche label in English",
  "intent": "navigational|informational|transactional|download|streaming|local|commercial|gaming",
  "intent_summary": "One sentence in English describing exactly what the searcher wants",
  "primary_market": "Country name in English",
  "geo_recommendation": "2-letter ISO country code",
  "geo_reason": "One sentence in English explaining the geo choice",
  "output_language": "${outputLang || 'en'}",
  "sweeps": {
    "s3_question_prefixes": ["8-10 question starters in OUTPUT LANGUAGE — universal ones plus niche-specific"],
    "s3_question_suffixes": ["12-15 qualifiers in OUTPUT LANGUAGE — reflect real user anxieties for this niche"],
    "s4_platform": ["12-18 platform/access modifiers in OUTPUT LANGUAGE — HOW users access this"],
    "s5_problem": ["12-16 problem/failure modifiers in OUTPUT LANGUAGE — real failure modes for this niche"],
    "s6_context": ["10-14 audience/context modifiers in OUTPUT LANGUAGE — WHO searches and in what situation"],
    "s7_numbers": ["all relevant numbers for this niche — version numbers/years/prices/episodes/sizes"],
    "s9_custom": ["14-20 complete search phrases in OUTPUT LANGUAGE — full queries a real user would type"],
    "s10_wildcard": ["10-14 intent variants in OUTPUT LANGUAGE — different action words around this keyword"]
  },
  "suggested_clarifications": [
    {"question": "A question you would ask to generate even better modifiers", "options": ["Option A", "Option B", "Option C"]}
  ],
  "recursive_seeds": ["6-10 related keywords worth running their own sweep on"],
  "niche_notes": "2-3 sentences on what makes autocomplete research unique for this niche"
}`;
}

// ── API CALLERS ───────────────────────────────────────────────────────────────
async function callAnthropic(prompt) {
  const cfg = PROVIDERS.anthropic;
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.map(c => c.text || '').join('') || '';
}

async function callGroq(prompt) {
  const cfg = PROVIDERS.groq;
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }], temperature: 0.2 })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.choices?.[0]?.message?.content || '';
}

async function callGemini(prompt) {
  const cfg = PROVIDERS.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.key}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2000, responseMimeType: 'application/json' }
    })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAI(prompt) {
  const cfg = PROVIDERS.openai;
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }], temperature: 0.2, response_format: { type: 'json_object' } })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.choices?.[0]?.message?.content || '';
}

// ── RULE-BASED FALLBACK ───────────────────────────────────────────────────────
function ruleBased(keyword, outputLang) {
  const kw = keyword.toLowerCase();
  const base = keyword;
  const lang = outputLang || 'en';

  const T = {
    en: {
      streaming: { s4:['apk','android','ios','iphone','pc','windows','mac','firestick','smart tv','android tv','web','browser','online','download','install','mod apk','no ads','apkpure','play store'], s5:['not working','not opening','not loading','buffering','banned','blocked','down','server down','alternative','alternatives','new link','new domain','mirror','proxy','vpn','region locked','login problem','black screen'], s6:['hindi dubbed','tamil dubbed','telugu dubbed','english dubbed','english sub','japanese','korean','in hindi','in tamil','free','no ads','hd','4k'], s7:['episode 1','episode 2','season 1','season 2','2024','2025','2026','v9','v10','9.8'], s9:[`watch ${base} online`,`${base} hindi dubbed`,`${base} apk download`,`is ${base} safe`,`${base} not working fix`,`${base} alternatives`,`${base} official site`,`${base} new link`,`download ${base} apk`,`${base} english sub`], s10:[`watch ${base}`,`download ${base}`,`stream ${base}`,`free ${base}`,`best ${base}`,`${base} official`,`${base} link`,`is ${base} legal`]},
      local:     { s4:['near me','open now','open sunday','open today','24 hours','same day','emergency','walk in','free estimate','online booking','phone number'], s5:['closed','not available','too expensive','bad reviews','long wait','scam','complaints','alternative'], s6:['cheap','affordable','best','top rated','licensed','insured','certified','trusted','local','family owned'], s7:['2024','2025'], s9:[`best ${base} near me`,`cheap ${base} near me`,`${base} open now`,`${base} reviews`,`${base} price`,`emergency ${base}`,`${base} appointment`,`24 hour ${base}`], s10:[`best ${base}`,`cheap ${base}`,`free ${base} estimate`,`${base} near me`,`${base} reviews`,`find ${base}`]},
      ecommerce: { s4:['buy online','price','discount','sale','offer','coupon','cod','cash on delivery','free shipping','emi','review','best price','compare','size chart','warranty'], s5:['fake','duplicate','out of stock','refund','return','complaint','not delivered','wrong product','damaged','alternative'], s6:['for men','for women','for kids','gift','imported','branded','original','authentic','luxury','budget'], s7:['under 500','under 1000','under 5000','2024','2025'], s9:[`buy ${base} online`,`${base} price`,`${base} review`,`${base} discount`,`${base} vs`,`best ${base}`,`${base} sale`,`${base} original vs fake`,`${base} return policy`], s10:[`buy ${base}`,`best ${base}`,`cheap ${base}`,`${base} review`,`${base} vs`,`${base} discount`]},
      finance:   { s4:['calculator','formula','monthly','annual','gross','net','after tax','take home','online','excel','pdf'], s5:['wrong calculation','not accurate','outdated','alternative','error'], s6:['for salaried','for self employed','for freelancers','for freshers','by state','by country','with deductions'], s7:['2024','2025','30000','50000','100000','500000','1000000'], s9:[`${base} calculator`,`how to calculate ${base}`,`${base} 2025`,`${base} after tax`,`${base} monthly`,`${base} for freshers`,`${base} deductions`], s10:[`calculate ${base}`,`${base} calculator`,`${base} formula`,`${base} 2025`]},
    },
    pt: {
      streaming: { s4:['apk','android','ios','pc','windows','smart tv','firestick','navegador','online','baixar','instalar','sem anúncios','grátis'], s5:['não está funcionando','não abre','caindo','banido','bloqueado','fora do ar','alternativa','novo link','espelho','vpn','problema de login'], s6:['dublado','legendado','em português','grátis','sem anúncios','hd','4k'], s7:['episódio 1','episódio 2','temporada 1','temporada 2','2024','2025','2026'], s9:[`assistir ${base} online`,`${base} dublado`,`baixar ${base} apk`,`${base} é seguro`,`${base} não funciona solução`,`${base} alternativas`,`${base} site oficial`,`${base} novo link`], s10:[`assistir ${base}`,`baixar ${base}`,`${base} grátis`,`melhor ${base}`,`${base} oficial`,`${base} é legal`]},
      local:     { s4:['perto de mim','aberto agora','aberto domingo','24 horas','mesmo dia','emergência','sem agendamento','orçamento grátis','telefone'], s5:['fechado','não disponível','caro demais','avaliações ruins','demora','golpe','reclamações','alternativa'], s6:['barato','acessível','melhor','bem avaliado','licenciado','confiável','local'], s7:['2024','2025'], s9:[`melhor ${base} perto de mim`,`${base} barato perto de mim`,`${base} aberto agora`,`${base} avaliações`,`${base} preço`,`${base} emergência`], s10:[`melhor ${base}`,`${base} barato`,`${base} perto de mim`,`${base} avaliações`]},
      ecommerce: { s4:['comprar online','preço','desconto','promoção','frete grátis','parcelado','avaliação','melhor preço','comparar'], s5:['falso','esgotado','devolução','reclamação','não entregou','produto errado','danificado','alternativa'], s6:['para homem','para mulher','para criança','presente','importado','original','barato','luxo'], s7:['até 100','até 500','até 1000','2024','2025'], s9:[`comprar ${base} online`,`${base} preço`,`${base} avaliação`,`${base} desconto`,`melhor ${base}`,`${base} promoção`], s10:[`comprar ${base}`,`melhor ${base}`,`${base} barato`,`${base} avaliação`,`${base} promoção`]},
      finance:   { s4:['calculadora','fórmula','mensal','anual','bruto','líquido','depois do imposto','online','excel','pdf'], s5:['cálculo errado','desatualizado','alternativa','erro'], s6:['para assalariado','para autônomo','para freelancer','por estado','com deduções'], s7:['2024','2025','1000','2000','5000','10000'], s9:[`calculadora de ${base}`,`como calcular ${base}`,`${base} 2025`,`${base} depois do imposto`,`${base} mensal`], s10:[`calcular ${base}`,`calculadora ${base}`,`${base} 2025`]},
    },
    de: {
      streaming: { s4:['apk','android','ios','pc','windows','smart tv','browser','online','herunterladen','installieren','werbefrei','kostenlos'], s5:['funktioniert nicht','öffnet nicht','gesperrt','verboten','offline','alternative','neuer link','spiegel','vpn','login problem'], s6:['deutsch','englisch untertitel','kostenlos','werbefrei','hd','4k'], s7:['folge 1','folge 2','staffel 1','staffel 2','2024','2025','2026'], s9:[`${base} online ansehen`,`${base} deutsch`,`${base} apk herunterladen`,`ist ${base} sicher`,`${base} funktioniert nicht lösung`,`${base} alternativen`,`${base} neue link`], s10:[`${base} ansehen`,`${base} herunterladen`,`${base} kostenlos`,`bestes ${base}`,`${base} offiziell`]},
      local:     { s4:['in meiner nähe','jetzt geöffnet','sonntags geöffnet','24 stunden','notfall','ohne termin','kostenloses angebot','telefonnummer'], s5:['geschlossen','nicht verfügbar','zu teuer','schlechte bewertungen','alternative'], s6:['günstig','erschwinglich','beste','zertifiziert','vertrauenswürdig','lokal'], s7:['2024','2025'], s9:[`bester ${base} in meiner nähe`,`günstiger ${base}`,`${base} jetzt geöffnet`,`${base} bewertungen`,`${base} notfall`], s10:[`bester ${base}`,`günstiger ${base}`,`${base} in meiner nähe`,`${base} bewertungen`]},
      ecommerce: { s4:['online kaufen','preis','rabatt','angebot','gutschein','kostenloser versand','ratenkauf','bewertung','preisvergleich'], s5:['gefälscht','ausverkauft','rückgabe','reklamation','nicht geliefert','beschädigt','alternative'], s6:['für männer','für frauen','für kinder','geschenk','importiert','original','günstig'], s7:['unter 50','unter 100','unter 500','2024','2025'], s9:[`${base} online kaufen`,`${base} preis`,`${base} bewertung`,`${base} rabatt`,`bestes ${base}`,`${base} angebot`], s10:[`${base} kaufen`,`bestes ${base}`,`günstiges ${base}`,`${base} bewertung`,`${base} vergleich`]},
      finance:   { s4:['rechner','formel','monatlich','jährlich','brutto','netto','nach steuer','online','excel'], s5:['falsche berechnung','veraltet','alternative','fehler'], s6:['für angestellte','für selbstständige','für freelancer','nach bundesland','mit abzügen'], s7:['2024','2025','1000','2000','5000'], s9:[`${base} rechner`,`wie berechnet man ${base}`,`${base} 2025`,`${base} nach steuer`,`${base} monatlich`], s10:[`${base} berechnen`,`${base} rechner`,`${base} 2025`]},
    },
    es: {
      streaming: { s4:['apk','android','ios','pc','windows','smart tv','navegador','en línea','descargar','instalar','sin anuncios','gratis'], s5:['no funciona','no abre','caído','bloqueado','banneado','fuera de línea','alternativa','nuevo enlace','espejo','vpn','problema de inicio de sesión'], s6:['en español','doblado','subtitulado','gratis','sin anuncios','hd','4k'], s7:['episodio 1','episodio 2','temporada 1','temporada 2','2024','2025','2026'], s9:[`ver ${base} online`,`${base} en español`,`descargar ${base} apk`,`es ${base} seguro`,`${base} no funciona solución`,`${base} alternativas`,`${base} sitio oficial`,`${base} nuevo enlace`], s10:[`ver ${base}`,`descargar ${base}`,`${base} gratis`,`mejor ${base}`,`${base} oficial`]},
      local:     { s4:['cerca de mí','abierto ahora','abierto domingo','24 horas','mismo día','emergencia','sin cita','presupuesto gratis','teléfono'], s5:['cerrado','no disponible','muy caro','malas reseñas','lista de espera','estafa','reclamaciones','alternativa'], s6:['barato','asequible','mejor','mejor valorado','certificado','confiable','local'], s7:['2024','2025'], s9:[`mejor ${base} cerca de mí`,`${base} barato cerca de mí`,`${base} abierto ahora`,`${base} reseñas`,`${base} precio`,`${base} emergencia`], s10:[`mejor ${base}`,`${base} barato`,`${base} cerca de mí`,`${base} reseñas`]},
      ecommerce: { s4:['comprar online','precio','descuento','oferta','envío gratis','pago a plazos','reseña','mejor precio','comparar'], s5:['falso','sin stock','devolución','reclamación','no llegó','producto equivocado','dañado','alternativa'], s6:['para hombre','para mujer','para niños','regalo','importado','original','barato','lujo'], s7:['menos de 50','menos de 100','menos de 500','2024','2025'], s9:[`comprar ${base} online`,`${base} precio`,`${base} reseña`,`${base} descuento`,`mejor ${base}`,`${base} oferta`], s10:[`comprar ${base}`,`mejor ${base}`,`${base} barato`,`${base} reseña`]},
      finance:   { s4:['calculadora','fórmula','mensual','anual','bruto','neto','después de impuestos','online','excel'], s5:['cálculo incorrecto','desactualizado','alternativa','error'], s6:['para asalariado','para autónomo','para freelancer','por comunidad','con deducciones'], s7:['2024','2025','1000','2000','5000'], s9:[`calculadora de ${base}`,`cómo calcular ${base}`,`${base} 2025`,`${base} después de impuestos`,`${base} mensual`], s10:[`calcular ${base}`,`calculadora ${base}`,`${base} 2025`]},
    },
  };

  const niches = [
    { test: /apk|mod apk|cracked|premium unlocked/, label:'APK Download', intent:'download', geo:'in', pack:'streaming' },
    { test: /watch|stream|anime|movie|series|episode|cartoon|dubbed|ott|netflix|crunchyroll|hotstar|jio|zee5|hulu|disney/, label:'Streaming Platform', intent:'streaming', geo:'in', pack:'streaming' },
    { test: /plumber|dentist|lawyer|restaurant|salon|barber|mechanic|electrician|cleaner|pest control|locksmith|tutor|doctor|gym|spa|hotel|near me|perto de mim|cerca de mí|in meiner nähe|notfall/, label:'Local Service', intent:'local', geo:'us', pack:'local' },
    { test: /notion|canva|slack|figma|shopify|hubspot|wordpress|wix|mailchimp|zapier|airtable|monday|asana|trello|zoom|dropbox|salesforce/, label:'SaaS Product', intent:'commercial', geo:'us', pack:'ecommerce' },
    { test: /\bhow to\b|\btips\b|\bguide\b|\btutorial\b|\bchecklist\b|\bmistakes\b|\bbenefits\b|\bways to\b|\bstep by step\b|\bcomo\b|\btips para\b|\bguía\b|\bwie man\b|\bvorteile\b|\bcomo fazer\b/, label:'Blogging / Informational', intent:'informational', geo:'us', pack:'ecommerce' },
    { test: /buy|price|shop|store|sale|deal|discount|amazon|flipkart|comprar|precio|kaufen|preis|acheter|prix/, label:'Ecommerce Product', intent:'transactional', geo:'us', pack:'ecommerce' },
    { test: /calculator|tool|checker|generator|converter|tracker|planner|calculadora|rechner|kalkulator/, label:'Tool / Calculator', intent:'tool', geo:'us', pack:'finance' },
    { test: /salary|tax|income|loan|emi|investment|insurance|finance|budget|gross|salário|imposto|renda|gehalt|steuer|salario|impuesto/, label:'Finance / Salary', intent:'informational', geo:'in', pack:'finance' },
    { test: /game|gaming|fortnite|minecraft|roblox|free fire|pubg|valorant|cod|clan|server|rank|uid|cheat|hack/, label:'Gaming', intent:'gaming', geo:'us', pack:'streaming' },
  ];

  const langPacks = T[lang] || T['en'];

  for (const n of niches) {
    if (n.test.test(kw)) {
      const pack = langPacks[n.pack] || T['en'][n.pack];
      return {
        niche: n.label, intent: n.intent,
        intent_summary: `User wants to ${n.intent} related to ${keyword}`,
        primary_market: n.geo === 'in' ? 'India' : 'United States',
        geo_recommendation: n.geo, geo_reason: 'Detected from keyword signals',
        output_language: lang,
        sweeps: {
          s3_question_prefixes: lang === 'pt' ? ['como','por que','o que é','é','posso','onde','quando','quem','qual'] : lang === 'de' ? ['wie','warum','was ist','ist','kann ich','wo','wann','wer','welche'] : lang === 'es' ? ['cómo','por qué','qué es','es','puedo','dónde','cuándo','quién','cuál'] : ['how to','why','what is','is','can i','does','where to','when does','who makes','which'],
          s3_question_suffixes: lang === 'pt' ? ['seguro','grátis','funcionando','legal','real','bom','vale a pena','legítimo','disponível','atualizado','offline','oficial'] : lang === 'de' ? ['sicher','kostenlos','funktioniert','legal','echt','gut','lohnt sich','legitim','verfügbar','aktualisiert','offline','offiziell'] : lang === 'es' ? ['seguro','gratis','funcionando','legal','real','bueno','vale la pena','legítimo','disponible','actualizado','offline','oficial'] : ['safe','free','working','legal','real','good','worth it','legit','available','updated','down','official'],
          s4_platform: pack.s4, s5_problem: pack.s5, s6_context: pack.s6, s7_numbers: pack.s7,
          s9_custom: pack.s9, s10_wildcard: pack.s10,
        },
        suggested_clarifications: [],
        recursive_seeds: [`${keyword} apk`, `${keyword} alternative`, `best ${keyword}`, `${keyword} review`],
        niche_notes: `Rule-based fallback. Detected: ${n.label}. Add an AI API key for deeper analysis.`,
        _source: 'rule-based'
      };
    }
  }

  return {
    niche:'General', intent:'informational', intent_summary:`User searching for ${keyword}`,
    primary_market:'United States', geo_recommendation:'us', geo_reason:'Default fallback',
    output_language: lang,
    sweeps: {
      s3_question_prefixes: ['how to','why','what is','is','can i','does','where','when','who','which'],
      s3_question_suffixes: ['safe','free','good','best','working','worth it','legit','updated','real','available'],
      s4_platform: ['free','online','download','app','web','mobile','desktop','api'],
      s5_problem: ['not working','alternative','error','down','problem','fix','broken','slow'],
      s6_context: ['for beginners','advanced','for business','professional','best','cheap','free'],
      s7_numbers: ['2023','2024','2025','2026','1','2','3','5','10'],
      s9_custom: [`best ${keyword}`,`free ${keyword}`,`${keyword} review`,`${keyword} alternative`,`how to use ${keyword}`,`${keyword} tutorial`,`${keyword} vs`,`${keyword} guide`],
      s10_wildcard: [`best ${keyword}`,`free ${keyword}`,`${keyword} review`,`${keyword} vs`,`${keyword} official`,`${keyword} tutorial`],
    },
    suggested_clarifications: [{ question: 'What type of thing is this keyword?', options: ['A website/app','A product','A service','A topic/concept'] }],
    recursive_seeds: [`${keyword} alternative`,`best ${keyword}`,`free ${keyword}`,`${keyword} review`],
    niche_notes: 'Generic fallback. Add an AI API key for accurate niche detection.',
    _source: 'generic-fallback'
  };
}

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.get('/api/suggest', async (req, res) => {
  const { q, gl, hl } = req.query;
  const clients = ['firefox', 'chrome', 'toolbar'];
  let suggestions = [];
  for (const client of clients) {
    try {
      const url = `http://suggestqueries.google.com/complete/search?client=${client}&q=${encodeURIComponent(q)}&hl=${hl||'en'}&gl=${gl||'us'}`;
      const r = await fetch(url, { timeout: 6000 });
      const d = await r.json();
      suggestions = d[1] || [];
      if (suggestions.length > 0) break;
    } catch(e) { continue; }
  }
  res.json({ suggestions });
});

app.post('/api/modifiers', async (req, res) => {
  const { keyword, niche_hint, output_lang } = req.body;
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  const provider = getActiveProvider();
  const prompt = buildPrompt(keyword, niche_hint, output_lang);

  if (!provider) {
    return res.json(ruleBased(keyword, output_lang));
  }

  try {
    let raw = '';
    if (provider === 'anthropic') raw = await callAnthropic(prompt);
    else if (provider === 'groq')  raw = await callGroq(prompt);
    else if (provider === 'gemini') raw = await callGemini(prompt);
    else if (provider === 'openai') raw = await callOpenAI(prompt);

    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    parsed._source = provider;
    res.json(parsed);
  } catch(e) {
    console.error(`AI failed: ${e.message} — using rule-based`);
    res.json(ruleBased(keyword, output_lang));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Alphabet Soup → http://localhost:${PORT} | Provider: ${getActiveProvider() || 'rule-based'}`));
