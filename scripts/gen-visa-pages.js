#!/usr/bin/env node
/**
 * gen-visa-pages.js — static visa-checker page generator for Layovered.
 *
 * Reads the visa dataset (local data/visa-data.json if present, else the
 * Layovered API via VISA_API_URL / VISA_API_KEY at build time) and writes
 * fully static, SEO-complete HTML pages under /visa-free/ and /can-i-enter/,
 * then refreshes their entries in sitemap.xml.
 *
 * Usage:
 *   node scripts/gen-visa-pages.js
 *   VISA_API_URL=https://api.example/visa-export VISA_API_KEY=xxx node scripts/gen-visa-pages.js
 *
 * Idempotent: every run wipes the generated folders and rebuilds them from
 * the data. Only TEASER fields ever reach the HTML (see TEASER_FIELDS).
 */
'use strict';

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ config */

const ROOT = path.join(__dirname, '..');
const SITE_BASE = 'https://layovered.app';
const DATA_FILE = path.join(ROOT, 'data', 'visa-data.json');

// Placeholders — wired to the real Branch/Firebase link and ESP endpoint later.
const APP_DEEPLINK_BASE = 'https://layovered.app/download.html'; // existing store-redirect page; harmlessly ignores ?passport/&country params
const CAPTURE_ENDPOINT = '';                 // unused while email capture is disabled
const ENABLE_EMAIL_CAPTURE = false;          // flip to true once an ESP/form endpoint is wired into CAPTURE_ENDPOINT

const WAVE1 = ['india', 'philippines', 'nigeria', 'pakistan', 'bangladesh'];
const YEAR = new Date().getFullYear();
const TODAY = new Date().toISOString().slice(0, 10);

const MAX_COUNTRY_PAGES = 50; // top ~50 country pages per passport
const HUB_LINK_COUNT = 10;    // hub/variant pages link to top ~10 country pages
const MIN_HUB_COUNTRIES = 3;  // skip a hub whose result set is trivially small
const MIN_VISA_UNLOCK = 1;    // skip a visa-variant page that unlocks nothing

// The ONLY country fields allowed into generated HTML. Gated fields
// (documents, apply/eVisa/eTA links, guidance) are stripped on load.
const TEASER_FIELDS = ['code', 'name', 'slug', 'region', 'access', 'durationDays', 'stay', 'price', 'unlockedBy'];

const ACCESS = {
  visa_free: { group: 'free',  badge: 'b-free',  label: 'Visa-free' },
  voa:       { group: 'voa',   badge: 'b-voa',   label: 'Visa on arrival' },
  evisa:     { group: 'evisa', badge: 'b-evisa', label: 'eVisa / eTA' },
  eta:       { group: 'evisa', badge: 'b-evisa', label: 'eVisa / eTA' },
};

const GROUPS = [
  { key: 'free',  title: 'Visa-free',        icon: 'fa-circle-check' },
  { key: 'voa',   title: 'Visa on arrival',  icon: 'fa-plane-arrival' },
  { key: 'evisa', title: 'eVisa / eTA',      icon: 'fa-laptop' },
];

// §7 — unique regional body line per passport (verbatim from the brief).
const REGIONAL_LINE = {
  india: 'Already hold a US, Schengen, UK, Canada or UAE visa? Several countries admit Indian passport holders on the strength of a visa they already have — add the visas you hold above to reveal those extra destinations.',
  philippines: 'As an ASEAN member, Filipino passport holders enjoy visa-free travel across much of Southeast Asia; add any US/Schengen/UK/Canada/UAE visa you hold above to unlock even more.',
  nigeria: 'As an ECOWAS member, Nigerian passport holders move visa-free across much of West Africa; a US/Schengen/UK/Canada/UAE visa you already hold unlocks several more — add yours above.',
  pakistan: 'Because visas are often the hardest part of travel on a Pakistani passport, a visa you already hold is especially valuable — several countries admit Pakistani holders carrying a US/Schengen/UK/Canada/UAE visa. Add yours above.',
  bangladesh: 'A visa you already hold can widen your options considerably — several countries admit Bangladeshi passport holders carrying a US/Schengen/UK/Canada/UAE visa. Add yours above.',
};

/* ------------------------------------------------------------- data loading */

async function loadVisaData() {
  if (fs.existsSync(DATA_FILE)) {
    console.log(`• Data source: local file ${path.relative(ROOT, DATA_FILE)}`);
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  const url = process.env.VISA_API_URL;
  if (!url) {
    throw new Error('No data/visa-data.json found and VISA_API_URL is not set.');
  }
  console.log(`• Data source: build-time fetch from VISA_API_URL`);
  const headers = {};
  if (process.env.VISA_API_KEY) headers['Authorization'] = `Bearer ${process.env.VISA_API_KEY}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`VISA_API_URL responded ${res.status} ${res.statusText}`);
  return res.json();
}

// Whitelist-copy every country so gated fields can never leak into pages,
// no matter what the data source contains.
function sanitize(data) {
  return {
    visas: data.visas.map(v => ({ code: v.code, name: v.name, slug: v.slug })),
    passports: data.passports.map(p => ({
      code: p.code,
      name: p.name,
      nationality: p.nationality,
      slug: p.slug,
      countries: (p.countries || []).map(c => {
        const t = {};
        for (const f of TEASER_FIELDS) if (c[f] !== undefined) t[f] = c[f];
        return t;
      }),
    })),
  };
}

/* ----------------------------------------------------------------- helpers */

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function flagEmoji(iso2) {
  return String(iso2).toUpperCase().replace(/./g, ch => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

function stay(c) {
  if (c.stay) return c.stay;                       // real data: free string ("6 months")
  if (c.durationDays) return `${c.durationDays} days`; // sample data: numeric
  return '—';
}
function hasStay(c) {
  return Boolean(c.stay || c.durationDays);
}
function stayPhrase(c) {
  return hasStay(c) ? `up to ${stay(c)}` : 'a limited period';
}

function jsonLdTag(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

function faqJsonLd(faqs) {
  return jsonLdTag({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  });
}

function breadcrumbJsonLd(items) {
  return jsonLdTag({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, url], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item: url,
    })),
  });
}

function visaShortName(visa) {
  return visa.name.replace(/\s+visa$/i, '');
}

function isAccessible(c) {
  return Boolean(ACCESS[c.access]);
}

function baseCountries(pp) {
  return pp.countries.filter(c => isAccessible(c) && !(c.unlockedBy && c.unlockedBy.length));
}

function unlockedBy(pp, visaCode) {
  return pp.countries.filter(c => isAccessible(c) && c.unlockedBy && c.unlockedBy.includes(visaCode));
}

function countsOf(list) {
  const n = { free: 0, voa: 0, evisa: 0 };
  for (const c of list) n[ACCESS[c.access].group]++;
  return n;
}

/* -------------------------------------------------------------- page shell */

const CSS = `
:root{
  --orange:#ff4c00; --orange-dark:#e64a19; --ink:#1f271b; --muted:#6b7280;
  --line:#e5e7eb; --bg:#fafafa; --card:#ffffff; --green:#14a83b; --greenbg:#e9f8ee;
  --blue:#2563eb; --bluebg:#eef4ff; --amber:#b45309; --amberbg:#fff7e6; --red:#b91c1c; --redbg:#fdecec;
  --radius:18px; --shadow:0 10px 40px rgba(20,30,25,.08);
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Plus Jakarta Sans",sans-serif;color:var(--ink);background:var(--bg);line-height:1.5}
.container{max-width:1080px;margin:0 auto;padding:0 22px}
a{text-decoration:none;color:inherit}
nav{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.85);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.nav-in{display:flex;align-items:center;justify-content:space-between;height:64px}
.logo{display:flex;align-items:center;gap:9px;font-weight:800;font-size:1.15rem}
.logo .dot{width:26px;height:26px;border-radius:8px;background:var(--orange);display:grid;place-items:center;color:#fff;font-size:.8rem}
.nav-links{display:flex;align-items:center;gap:26px;font-weight:600;font-size:.93rem}
.nav-links .muted{color:var(--muted)}
.nav-cta{background:var(--orange);color:#fff;padding:9px 17px;border-radius:11px;font-weight:700;transition:.25s}
.nav-cta:hover{background:var(--orange-dark)}
@media(max-width:640px){.nav-links a.muted{display:none}}
.head{padding:34px 0 6px}
.crumb{font-size:.8rem;color:var(--muted);font-weight:600;margin-bottom:14px}
.crumb a:hover{color:var(--orange)}
.tag{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);padding:6px 13px;border-radius:30px;font-size:.78rem;font-weight:700;color:var(--orange);margin-bottom:14px}
.tag .pulse{width:7px;height:7px;border-radius:50%;background:var(--orange);box-shadow:0 0 0 0 rgba(255,76,0,.5);animation:pulse 1.8s infinite}
@keyframes pulse{70%{box-shadow:0 0 0 8px rgba(255,76,0,0)}100%{box-shadow:0 0 0 0 rgba(255,76,0,0)}}
h1{font-size:2.1rem;font-weight:800;letter-spacing:-.02em;line-height:1.12}
h1 .accent{color:var(--orange)}
.sub{color:var(--muted);font-size:1.02rem;margin-top:12px;max-width:640px}
.checker{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:24px;margin-top:26px}
.field-label{font-weight:700;font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:9px;display:flex;align-items:center;gap:7px}
.passport-row{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end}
.select-wrap{flex:1;min-width:220px}
select{width:100%;padding:13px 14px;border:1.5px solid var(--line);border-radius:12px;font-family:inherit;font-size:1rem;font-weight:600;background:#fff;cursor:pointer}
select:focus{outline:none;border-color:var(--orange)}
.visa-block{margin-top:20px}
.chips{display:flex;gap:10px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:8px;padding:10px 15px;border:1.5px solid var(--line);border-radius:30px;font-weight:700;font-size:.9rem;cursor:pointer;user-select:none;transition:.18s;background:#fff}
.chip i{font-size:.78rem;opacity:.5}
.chip.on{border-color:var(--orange);background:#fff5f0;color:var(--orange)}
.chip.on i{opacity:1}
.go{margin-top:22px;width:100%;background:var(--orange);color:#fff;border:none;padding:15px;border-radius:13px;font-family:inherit;font-weight:800;font-size:1.02rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:.25s}
.go:hover{background:var(--orange-dark)}
.summary{margin:30px 0 8px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.summary .big{font-size:2.4rem;font-weight:800;color:var(--orange);line-height:1}
.summary .txt{font-weight:700;font-size:1.05rem}
.summary .txt span{color:var(--muted);font-weight:600;display:block;font-size:.9rem;margin-top:3px}
.filters{display:flex;gap:9px;flex-wrap:wrap;margin:18px 0 6px}
.fpill{font-size:.8rem;font-weight:700;padding:6px 12px;border-radius:30px;border:1px solid var(--line);background:#fff;color:var(--muted)}
.fpill b{color:var(--ink)}
.group-h{margin:28px 0 2px;font-size:1.2rem;font-weight:800;display:flex;align-items:center;gap:10px}
.group-h i{color:var(--orange);font-size:1rem}
.group-h .gcount{font-size:.82rem;font-weight:700;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px;margin-top:14px}
.cc{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:16px;display:flex;flex-direction:column;gap:12px;transition:.2s}
.cc:hover{box-shadow:var(--shadow);transform:translateY(-2px)}
.cc-top{display:flex;align-items:center;gap:11px}
.flag{font-size:1.7rem;line-height:1}
.cc-name{font-weight:800;font-size:1.05rem}
a.cc-name:hover{color:var(--orange)}
.cc-region{font-size:.78rem;color:var(--muted);font-weight:600}
.badge{margin-left:auto;font-size:.72rem;font-weight:800;padding:5px 10px;border-radius:8px;white-space:nowrap}
.b-free{background:var(--greenbg);color:var(--green)}
.b-voa{background:var(--bluebg);color:var(--blue)}
.b-evisa{background:var(--amberbg);color:var(--amber)}
.unlock{display:inline-flex;align-items:center;gap:6px;font-size:.72rem;font-weight:800;color:var(--orange);background:#fff5f0;border:1px solid #ffd9c7;padding:4px 9px;border-radius:7px;width:fit-content}
.facts{display:flex;gap:10px}
.fact{flex:1;background:#fafafa;border:1px solid var(--line);border-radius:10px;padding:9px 11px}
.fact .k{font-size:.68rem;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);font-weight:700}
.fact .v{font-weight:800;font-size:.98rem;margin-top:2px}
.locked{border-top:1px dashed var(--line);padding-top:11px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.locked .lk{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:.84rem;font-weight:600}
.locked .lk i{color:#9ca3af}
.open-app{background:var(--ink);color:#fff;font-size:.78rem;font-weight:700;padding:8px 12px;border-radius:9px;white-space:nowrap;cursor:pointer;transition:.2s}
.open-app:hover{background:#000}
.band{margin-top:30px;border-radius:var(--radius);padding:26px;color:#fff;background:linear-gradient(135deg,#ff5722,#ff4c00)}
.band h3{font-size:1.3rem;font-weight:800}
.band p{opacity:.92;margin-top:6px;font-weight:500}
.cap{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
.cap input{flex:1;min-width:220px;padding:13px 15px;border:none;border-radius:11px;font-family:inherit;font-size:1rem}
.cap button{background:var(--ink);color:#fff;border:none;padding:13px 22px;border-radius:11px;font-weight:800;font-family:inherit;cursor:pointer}
.routing{margin-top:16px;background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.routing .ic{width:46px;height:46px;border-radius:12px;background:#fff5f0;color:var(--orange);display:grid;place-items:center;font-size:1.2rem}
.routing .rt b{font-weight:800}
.routing .rt p{color:var(--muted);font-size:.9rem}
.routing a{margin-left:auto;color:var(--orange);font-weight:800;font-size:.92rem}
.body-seo{margin:40px 0 10px;max-width:760px}
.body-seo h2{font-size:1.25rem;font-weight:800;margin:22px 0 8px}
.body-seo p{color:#374151;margin-bottom:10px}
.body-seo ul{margin:0 0 10px 18px;color:#374151}
.body-seo ul li{margin-bottom:5px}
.body-seo ul a{color:var(--orange);font-weight:600}
.body-seo ul a:hover{text-decoration:underline}
.faq{border-top:1px solid var(--line);margin-top:8px}
.faq details{border-bottom:1px solid var(--line);padding:14px 0}
.faq summary{font-weight:700;cursor:pointer;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";float:right;color:var(--orange);font-weight:800}
.faq details[open] summary::after{content:"–"}
.faq p{color:var(--muted);margin-top:8px}
.answer-card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:24px;margin-top:26px}
.answer-card .verdict{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.answer-card .verdict .flag{font-size:2.2rem}
.answer-card .verdict .v-txt{font-weight:800;font-size:1.2rem}
footer{margin-top:40px;border-top:1px solid var(--line);padding:24px 0;color:var(--muted);font-size:.85rem;text-align:center}
`.trim();

function pageShell({ title, description, canonical, breadcrumbItems, faqs, body, nav }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Layovered">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="icon" href="/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
${breadcrumbJsonLd(breadcrumbItems)}
${faqJsonLd(faqs)}
<style>
${CSS}
</style>
</head>
<body>

<nav>
  <div class="container nav-in">
    <a class="logo" href="/"><span class="dot"><i class="fa-solid fa-plane"></i></span>Layovered</a>
    <div class="nav-links">
      <a class="muted" href="/about.html">About us</a>
      <a class="muted" href="/contact.html">Contact</a>
      <a class="nav-cta" href="${esc(APP_DEEPLINK_BASE)}">Download app <i class="fa-solid fa-arrow-right"></i></a>
    </div>
  </div>
</nav>

<div class="container">
${body}
  <footer>© ${YEAR} Layovered · Visa data is indicative — always confirm requirements for your specific trip in the Layovered app before booking.</footer>
</div>

${pageScript(nav)}
</body>
</html>
`;
}

// Minimal page JS: selectors navigate between pre-built pages, email capture
// posts to the placeholder endpoint. No browser-facing visa API.
function pageScript(nav) {
  return `<script>
var APP_DEEPLINK_BASE=${JSON.stringify(APP_DEEPLINK_BASE)};
var CAPTURE_ENDPOINT=${JSON.stringify(CAPTURE_ENDPOINT)};
var NAV=${JSON.stringify(nav)};
(function(){
  var sel=document.getElementById('passport');
  if(sel)sel.addEventListener('change',function(){var u=NAV.hubs[this.value];window.location=u||NAV.hub;});
  var active={};
  if(NAV.active)active[NAV.active]=1;
  // 0 visas -> hub; 1 visa -> its pre-built variant page (or hub if that
  // combo was not generated); multi-visa combos -> fall back to the hub.
  function target(){var on=Object.keys(active);if(on.length===1)return NAV.visas[on[0]]||NAV.hub;return NAV.hub;}
  var chips=document.querySelectorAll('.chip');
  for(var i=0;i<chips.length;i++){
    chips[i].addEventListener('click',function(){
      var s=this.getAttribute('data-slug');
      if(active[s])delete active[s];else active[s]=1;
      window.location=target();
    });
  }
  var go=document.getElementById('go');
  if(go)go.addEventListener('click',function(){window.location=target();});
  var form=document.getElementById('cap-form');
  if(form)form.addEventListener('submit',function(e){
    e.preventDefault();
    var em=form.querySelector('input[type=email]').value;
    try{fetch(CAPTURE_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,passport:NAV.passport||null,visa:NAV.active||null})}).catch(function(){});}catch(err){}
    form.innerHTML='<p style="font-weight:700">Thanks — you\\u2019re on the list. Watch your inbox.</p>';
  });
})();
<\/script>`;
}

/* ----------------------------------------------------------- page sections */

function checkerBlock(pp, hubs, activeVisaSlug, visas) {
  const options = hubs
    .map(h => `<option value="${esc(h.slug)}"${h.slug === pp.slug ? ' selected' : ''}>${flagEmoji(h.code)} ${esc(h.name)}</option>`)
    .join('\n          ');
  const chips = visas
    .map(v => {
      const on = v.slug === activeVisaSlug;
      return `<span class="chip${on ? ' on' : ''}" data-slug="${esc(v.slug)}" role="button" tabindex="0"><i class="${on ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}"></i> ${esc(v.name)}</span>`;
    })
    .join('\n        ');
  return `
  <section class="checker">
    <div class="passport-row">
      <div class="select-wrap">
        <div class="field-label"><i class="fa-solid fa-passport"></i> Your passport</div>
        <select id="passport">
          ${options}
        </select>
      </div>
    </div>
    <div class="visa-block">
      <div class="field-label"><i class="fa-solid fa-id-card"></i> Visas you already hold (tap to add)</div>
      <div class="chips" id="chips">
        ${chips}
      </div>
    </div>
    <button class="go" id="go"><i class="fa-solid fa-earth-asia"></i> Show where I can go</button>
  </section>`;
}

function summaryBlock(total, subline, pills) {
  const pillHtml = pills.map(([n, label, accent]) =>
    `<span class="fpill"${accent ? ' style="color:var(--orange)"' : ''}><b${accent ? ' style="color:var(--orange)"' : ''}>${n}</b> ${esc(label)}</span>`).join('\n    ');
  return `
  <div class="summary">
    <div class="big">${total}</div>
    <div class="txt">destinations unlocked<span>${esc(subline)}</span></div>
  </div>
  <div class="filters">
    ${pillHtml}
  </div>`;
}

function countryCard(pp, c, activeVisa, countryPageSlugs) {
  const a = ACCESS[c.access];
  const unlocked = activeVisa && c.unlockedBy && c.unlockedBy.includes(activeVisa.code);
  const url = `/can-i-enter/${pp.slug}/${c.slug}/`;
  const nameHtml = countryPageSlugs.has(c.slug)
    ? `<a class="cc-name" href="${url}">${esc(c.name)}</a>`
    : `<div class="cc-name">${esc(c.name)}</div>`;
  return `
    <div class="cc">
      <div class="cc-top">
        <span class="flag">${flagEmoji(c.code)}</span>
        <div>${nameHtml}<div class="cc-region">${esc(c.region || '')}</div></div>
        <span class="badge ${a.badge}">${a.label}</span>
      </div>${unlocked ? `
      <span class="unlock"><i class="fa-solid fa-unlock"></i> Unlocked by your ${esc(visaShortName(activeVisa))} visa</span>` : ''}
      <div class="facts">
        <div class="fact"><div class="k">Stay</div><div class="v">${esc(stay(c))}</div></div>
        <div class="fact"><div class="k">Visa cost</div><div class="v">${esc(c.price || '—')}</div></div>
      </div>
      <div class="locked">
        <span class="lk"><i class="fa-solid fa-lock"></i> Documents &amp; apply link</span>
        <a class="open-app" href="${esc(APP_DEEPLINK_BASE)}?passport=${esc(pp.slug)}&amp;country=${esc(c.slug)}">Open in app</a>
      </div>
    </div>`;
}

function resultsBlock(pp, list, activeVisa, countryPageSlugs) {
  let out = '';
  for (const g of GROUPS) {
    const items = list.filter(c => ACCESS[c.access].group === g.key);
    if (!items.length) continue;
    out += `
  <h2 class="group-h"><i class="fa-solid ${g.icon}"></i> ${g.title} <span class="gcount">${items.length} ${items.length === 1 ? 'destination' : 'destinations'}</span></h2>
  <div class="grid">${items.map(c => countryCard(pp, c, activeVisa, countryPageSlugs)).join('')}
  </div>`;
  }
  return out;
}

function captureBlock(pp) {
  const emailBand = ENABLE_EMAIL_CAPTURE ? `
  <div class="band" id="capture">
    <h3>Get visa-routing deals for your passport</h3>
    <p>One email a week: the cheapest flights you can actually book, routed through countries your passport enters visa-free.</p>
    <form class="cap" id="cap-form">
      <input type="email" required placeholder="you@email.com" aria-label="Email address">
      <button type="submit">Get deals</button>
    </form>
  </div>` : '';
  // With email capture off, the routing teaser points to the app instead of the (absent) capture form.
  const routingCta = ENABLE_EMAIL_CAPTURE
    ? `<a href="#capture">Join the waitlist →</a>`
    : `<a href="${esc(APP_DEEPLINK_BASE)}">Get it in the app →</a>`;
  return `${emailBand}
  <div class="routing">
    <div class="ic"><i class="fa-solid fa-route"></i></div>
    <div class="rt"><b>Want the cheaper flight, not just the visa?</b><p>Our routing finds flights through these visa-free countries for less. Launching soon.</p></div>
    ${routingCta}
  </div>`;
}

function faqBlock(faqs) {
  return `
    <div class="faq">
${faqs.map(([q, a], i) => `      <details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
    </div>`;
}

function linkList(links) {
  return `<ul>
${links.map(([text, href]) => `      <li><a href="${esc(href)}">${esc(text)}</a></li>`).join('\n')}
    </ul>`;
}

/* ------------------------------------------------------- shared FAQ copy */

function hubFaqs(nat, total, n, ex) {
  return [
    [`How many countries can ${nat} passport holders visit without a visa?`,
     `${nat} citizens can currently reach ${total} destinations without a prior visa — ${n.free} visa-free, ${n.voa} on arrival and ${n.evisa} via eVisa or eTA. Run the checker above for the live, full list.`],
    [`Which countries are visa-free for ${nat} citizens?`,
     `Popular visa-free destinations include ${ex[0]}, ${ex[1]} and ${ex[2]}, among others. The checker shows all ${n.free} visa-free countries with the stay allowed for each.`],
    [`Does a US or Schengen visa give ${nat} passport holders extra access?`,
     'Yes. A valid US, Schengen, UK, Canada or UAE visa can unlock visa-free or visa-on-arrival entry to several additional countries. Add your visa in the checker to see exactly which destinations open up.'],
    ['What is the difference between visa-free and visa-on-arrival?',
     'Visa-free means you need no visa at all. Visa-on-arrival means you obtain it at the airport or border on landing, sometimes for a fee. Both are shown above with cost and stay.'],
    ['Do I need to apply for anything before I fly?',
     'Fully visa-free countries need nothing in advance; eVisa and eTA countries require a short online application before departure. Open any country in the Layovered app for the exact documents and the official application link.'],
    ['Is this list up to date?',
     'Visa data is maintained from IATA-grade sources, but government rules can change at short notice. Always confirm your specific trip’s requirements in the Layovered app before booking.'],
  ];
}

/* -------------------------------------------------------------- page types */

function hubPage(pp, model, hubs) {
  const nat = pp.nationality;
  const base = model.base;
  const n = countsOf(base);
  const total = base.length;
  const ex = base.filter(c => c.access === 'visa_free').slice(0, 3).map(c => c.name);
  while (ex.length < 3) ex.push(base[ex.length] ? base[ex.length].name : '—');
  const canonical = `${SITE_BASE}${model.hubUrl}`;
  const faqs = hubFaqs(nat, total, n, ex);

  const variantLinks = model.variants.map(v => [
    `Where ${nat} passport holders can go with a ${visaShortName(v.visa)} visa`,
    v.url,
  ]);
  const countryLinks = model.countryPages.slice(0, HUB_LINK_COUNT).map(c => [
    `Can ${nat} passport holders enter ${c.name}?`,
    `/can-i-enter/${pp.slug}/${c.slug}/`,
  ]);

  const body = `
  <header class="head">
    <div class="crumb"><a href="/">Home</a> &nbsp;›&nbsp; <a href="${model.hubUrl}">Visa-free</a> &nbsp;›&nbsp; ${esc(pp.name)}</div>
    <div class="tag"><span class="pulse"></span> Free visa checker</div>
    <h1>Visa-Free Countries for <span class="accent">${esc(nat)} Passport</span> Holders</h1>
    <p class="sub">See everywhere you can go visa-free or on arrival — with stay duration and cost. Add the visas you already hold to unlock even more destinations.</p>
  </header>
${checkerBlock(pp, hubs, null, model.visas)}
${summaryBlock(total, `Your ${nat} passport`, [
    [n.free, 'Visa-free'],
    [n.voa, 'Visa on arrival'],
    [n.evisa, 'eVisa / eTA'],
  ])}
${resultsBlock(pp, base, null, model.countryPageSlugs)}
${captureBlock(pp)}
  <div class="body-seo">
    <p>Wondering where you can travel on a${/^[AEIOU]/i.test(nat) ? 'n' : ''} ${esc(nat)} passport without arranging a visa in advance? The free checker above shows all ${total} destinations open to ${esc(nat)} citizens — ${n.free} visa-free, ${n.voa} visa-on-arrival and ${n.evisa} via eVisa or eTA — each with the permitted length of stay and indicative cost. Popular visa-free picks include ${esc(ex[0])}, ${esc(ex[1])} and ${esc(ex[2])}.</p>
    <h2>How far does a${/^[AEIOU]/i.test(nat) ? 'n' : ''} ${esc(nat)} passport get you?</h2>
    <p>${esc(REGIONAL_LINE[pp.slug] || '')}</p>${model.variants.length ? `
    <h2>Add a visa you already hold</h2>
    ${linkList(variantLinks)}` : ''}
    <h2>Check a specific country</h2>
    ${linkList(countryLinks)}
    <h2>Frequently asked questions</h2>
${faqBlock(faqs)}
  </div>`;

  return pageShell({
    title: `Visa-Free Countries for ${nat} Passport Holders (${YEAR})`,
    description: `See every country ${nat} passport holders can enter visa-free or visa-on-arrival, with stay duration and cost. Add visas you hold to unlock more. Free.`,
    canonical,
    breadcrumbItems: [
      ['Home', `${SITE_BASE}/`],
      [`Visa-free countries for ${nat} passport holders`, canonical],
    ],
    faqs,
    body,
    nav: {
      passport: pp.slug,
      hub: model.hubUrl,
      hubs: model.hubsNav,
      visas: model.visasNav,
      active: null,
    },
  });
}

function variantPage(pp, model, variant, hubs) {
  const nat = pp.nationality;
  const visa = variant.visa;
  const short = visaShortName(visa);
  const list = model.base.concat(variant.unlocked);
  const n = countsOf(list);
  const total = list.length;
  const unlockCount = variant.unlocked.length;
  const canonical = `${SITE_BASE}${variant.url}`;
  const hub = hubFaqs(nat, model.base.length, countsOf(model.base), ['', '', '']);
  const faqs = [
    [`Which countries can ${nat} passport holders enter with a ${short} visa?`,
     `A valid ${short} visa unlocks ${unlockCount} additional destination${unlockCount === 1 ? '' : 's'}, on top of those already open visa-free. The checker marks each with an 'unlocked' tag.`],
    [`Does the ${short} visa need to be currently valid?`,
     `Yes. Countries that admit you on the strength of a ${short} visa generally require it to be valid. Check the specific country's rule in the Layovered app before you travel.`],
    hub[3],
    hub[4],
  ];

  const unlockedLinks = variant.unlocked
    .filter(c => model.countryPageSlugs.has(c.slug))
    .slice(0, HUB_LINK_COUNT)
    .map(c => [`Can ${nat} passport holders enter ${c.name}?`, `/can-i-enter/${pp.slug}/${c.slug}/`]);
  const otherVariantLinks = model.variants
    .filter(v => v.visa.slug !== visa.slug)
    .map(v => [`Where ${nat} passport holders can go with a ${visaShortName(v.visa)} visa`, v.url]);

  const body = `
  <header class="head">
    <div class="crumb"><a href="/">Home</a> &nbsp;›&nbsp; <a href="${model.hubUrl}">Visa-free</a> &nbsp;›&nbsp; <a href="${model.hubUrl}">${esc(pp.name)}</a> &nbsp;›&nbsp; With a ${esc(short)} visa</div>
    <div class="tag"><span class="pulse"></span> Free visa checker</div>
    <h1>Visa-Free Countries for <span class="accent">${esc(nat)} Passport</span> Holders With a ${esc(short)} Visa</h1>
    <p class="sub">A valid ${esc(short)} visa opens extra doors. See everything your ${esc(nat)} passport unlocks with it — stay duration and cost included.</p>
  </header>
${checkerBlock(pp, hubs, visa.slug, model.visas)}
${summaryBlock(total, `Your ${nat} passport + ${short} visa`, [
    [n.free, 'Visa-free'],
    [n.voa, 'Visa on arrival'],
    [n.evisa, 'eVisa / eTA'],
    [unlockCount, `unlocked by your ${short} visa`, true],
  ])}
${resultsBlock(pp, list, visa, model.countryPageSlugs)}
${captureBlock(pp)}
  <div class="body-seo">
    <p>A valid ${esc(short)} visa can open doors a${/^[AEIOU]/i.test(nat) ? 'n' : ''} ${esc(nat)} passport alone cannot. The checker above shows all ${total} destinations you can enter — including ${unlockCount} extra ${unlockCount === 1 ? 'country' : 'countries'} unlocked specifically by your ${esc(short)} visa — each with the allowed stay and indicative cost.</p>
    <h2>Explore more</h2>
    ${linkList([[`All visa-free countries for ${nat} passport holders`, model.hubUrl]].concat(otherVariantLinks, unlockedLinks))}
    <h2>Frequently asked questions</h2>
${faqBlock(faqs)}
  </div>`;

  return pageShell({
    title: `Where Can ${nat} Passport Holders Go With a ${short} Visa? (${YEAR})`,
    description: `Holding a ${short} visa on a${/^[AEIOU]/i.test(nat) ? 'n' : ''} ${nat} passport unlocks extra visa-free and visa-on-arrival countries. See your full list with duration and cost — free.`,
    canonical,
    breadcrumbItems: [
      ['Home', `${SITE_BASE}/`],
      [`Visa-free countries for ${nat} passport holders`, `${SITE_BASE}${model.hubUrl}`],
      [`With a ${short} visa`, canonical],
    ],
    faqs,
    body,
    nav: {
      passport: pp.slug,
      hub: model.hubUrl,
      hubs: model.hubsNav,
      visas: model.visasNav,
      active: visa.slug,
    },
  });
}

function accessSentence(nat, c, visasByCode) {
  const a = ACCESS[c.access];
  const stayTxt = stayPhrase(c);
  const cost = c.price || 'Free';
  let s;
  if (a.group === 'free') {
    s = `Yes — ${nat} passport holders can enter ${c.name} visa-free and stay ${stayTxt}. Indicative cost: ${cost}.`;
  } else if (a.group === 'voa') {
    s = `Yes — ${nat} passport holders can obtain a visa on arrival in ${c.name} and stay ${stayTxt}. Indicative cost: ${cost}.`;
  } else {
    s = `Yes — ${nat} passport holders can enter ${c.name} with an eVisa or eTA arranged online before departure, staying ${stayTxt}. Indicative cost: ${cost}.`;
  }
  if (c.unlockedBy && c.unlockedBy.length) {
    const names = c.unlockedBy.map(code => (visasByCode[code] ? visaShortName(visasByCode[code]) : code)).join(' or ');
    s += ` This access applies when you also hold a valid ${names} visa.`;
  }
  return s;
}

function countryPage(pp, model, c, visasByCode) {
  const nat = pp.nationality;
  const a = ACCESS[c.access];
  const url = `/can-i-enter/${pp.slug}/${c.slug}/`;
  const canonical = `${SITE_BASE}${url}`;
  const sentence = accessSentence(nat, c, visasByCode);

  const faqs = [
    [`Do ${nat} passport holders need a visa for ${c.name}?`, sentence],
    [`How long can ${nat} citizens stay in ${c.name}?`,
     hasStay(c)
       ? `${nat} passport holders can stay in ${c.name} for ${stayPhrase(c)} under the ${a.label.toLowerCase()} arrangement shown above.`
       : `The permitted stay varies — check the latest rule for ${c.name} in the Layovered app.`],
    [`Where do I find the documents and the official apply link for ${c.name}?`,
     'Documents required, step-by-step guidance and the official application link open in the Layovered app, alongside the cheapest routing for your trip.'],
  ];

  const siblings = model.countryPages.filter(s => s.slug !== c.slug).slice(0, 5)
    .map(s => [`Can ${nat} passport holders enter ${s.name}?`, `/can-i-enter/${pp.slug}/${s.slug}/`]);

  const body = `
  <header class="head">
    <div class="crumb"><a href="/">Home</a> &nbsp;›&nbsp; <a href="${model.hubUrl}">Visa-free</a> &nbsp;›&nbsp; <a href="${model.hubUrl}">${esc(pp.name)}</a> &nbsp;›&nbsp; ${esc(c.name)}</div>
    <div class="tag"><span class="pulse"></span> Free visa checker</div>
    <h1>Can ${esc(nat)} Passport Holders Enter <span class="accent">${esc(c.name)}</span>?</h1>
    <p class="sub">${esc(c.name)} entry rules for ${esc(nat)} passport holders — visa type, allowed stay and cost at a glance.</p>
  </header>
  <div class="answer-card">
    <div class="verdict">
      <span class="flag">${flagEmoji(c.code)}</span>
      <div class="v-txt">${esc(c.name)}</div>
      <span class="badge ${a.badge}">${a.label}</span>
    </div>
    <p style="margin-top:14px;color:#374151">${esc(sentence)}</p>
    <div class="facts" style="margin-top:14px">
      <div class="fact"><div class="k">Access</div><div class="v">${a.label}</div></div>
      <div class="fact"><div class="k">Stay</div><div class="v">${esc(stay(c))}</div></div>
      <div class="fact"><div class="k">Visa cost</div><div class="v">${esc(c.price || '—')}</div></div>
    </div>
    <div class="locked" style="margin-top:14px">
      <span class="lk"><i class="fa-solid fa-lock"></i> Documents &amp; apply link</span>
      <a class="open-app" href="${esc(APP_DEEPLINK_BASE)}?passport=${esc(pp.slug)}&amp;country=${esc(c.slug)}">Open in app</a>
    </div>
  </div>
${captureBlock(pp)}
  <div class="body-seo">
    <h2>More for your ${esc(nat)} passport</h2>
    ${linkList([[`All visa-free countries for ${nat} passport holders`, model.hubUrl]].concat(siblings))}
    <h2>Frequently asked questions</h2>
${faqBlock(faqs)}
  </div>`;

  return pageShell({
    title: `Can ${nat} Passport Holders Enter ${c.name}? Visa, Cost & Duration (${YEAR})`,
    description: `${c.name} entry rules for ${nat} passport holders: visa type, allowed stay and cost. See documents and apply links in the Layovered app.`,
    canonical,
    breadcrumbItems: [
      ['Home', `${SITE_BASE}/`],
      [`Visa-free countries for ${nat} passport holders`, `${SITE_BASE}${model.hubUrl}`],
      [c.name, canonical],
    ],
    faqs,
    body,
    nav: { passport: pp.slug, hub: model.hubUrl, hubs: model.hubsNav, visas: {}, active: null },
  });
}

/* ------------------------------------------------------------------ output */

const created = [];
const urls = []; // [path, priority]

function writePage(relDir, html, priority) {
  const dir = path.join(ROOT, relDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, html);
  created.push(path.relative(ROOT, file));
  urls.push([`/${relDir.replace(/\\/g, '/')}/`, priority]);
}

function updateSitemap() {
  const file = path.join(ROOT, 'sitemap.xml');
  let kept = [];
  if (fs.existsSync(file)) {
    const xml = fs.readFileSync(file, 'utf8');
    kept = (xml.match(/<url>[\s\S]*?<\/url>/g) || [])
      .filter(b => !/\/(visa-free|can-i-enter)\//.test(b));
  }
  const generated = urls.map(([p, priority]) => `  <url>
    <loc>${SITE_BASE}${p}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`);
  const body = kept.map(b => {
    const fields = b.match(/<(loc|lastmod|changefreq|priority)>[\s\S]*?<\/\1>/g) || [];
    return `  <url>\n${fields.map(f => `    ${f}`).join('\n')}\n  </url>`;
  })
    .concat(generated)
    .join('\n');
  fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
  created.push('sitemap.xml (updated)');
}

/* -------------------------------------------------------------------- main */

async function main() {
  const data = sanitize(await loadVisaData());
  const visasByCode = Object.fromEntries(data.visas.map(v => [v.code, v]));

  const wave = data.passports.filter(p => WAVE1.includes(p.slug));
  if (!wave.length) throw new Error('No Wave-1 passports found in the dataset.');
  const skippedWave = WAVE1.filter(s => !wave.some(p => p.slug === s));
  if (skippedWave.length) console.log(`• Not in dataset yet (skipped): ${skippedWave.join(', ')}`);

  // Idempotency: the generator owns these two folders outright.
  for (const dir of ['visa-free', 'can-i-enter']) {
    fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
  }

  // Pre-compute every passport's model so cross-page nav/links are consistent.
  const models = [];
  for (const pp of wave) {
    const base = baseCountries(pp);
    if (base.length < MIN_HUB_COUNTRIES) {
      console.log(`• Skipping ${pp.slug}: only ${base.length} accessible countries (trivially small).`);
      continue;
    }
    const hubUrl = `/visa-free/${pp.slug}/`;
    const variants = data.visas
      .map(visa => ({ visa, unlocked: unlockedBy(pp, visa.code), url: `${hubUrl}with-${visa.slug}-visa/` }))
      .filter(v => v.unlocked.length >= MIN_VISA_UNLOCK);
    const countryPages = pp.countries.filter(isAccessible).slice(0, MAX_COUNTRY_PAGES);
    models.push({
      pp, base, hubUrl, variants, countryPages,
      visas: data.visas,
      countryPageSlugs: new Set(countryPages.map(c => c.slug)),
      visasNav: Object.fromEntries(variants.map(v => [v.visa.slug, v.url])),
    });
  }

  const hubs = models.map(m => ({ slug: m.pp.slug, code: m.pp.code, name: m.pp.name }));
  const hubsNav = Object.fromEntries(models.map(m => [m.pp.slug, m.hubUrl]));

  for (const m of models) {
    m.hubsNav = hubsNav;
    const pp = m.pp;
    writePage(`visa-free/${pp.slug}`, hubPage(pp, m, hubs), '0.9');
    for (const v of m.variants) {
      writePage(`visa-free/${pp.slug}/with-${v.visa.slug}-visa`, variantPage(pp, m, v, hubs), '0.8');
    }
    const skippedVariants = data.visas.filter(visa => !m.visasNav[visa.slug]).map(v => v.slug);
    if (skippedVariants.length) {
      console.log(`• ${pp.slug}: skipped empty visa variants (fall back to hub): ${skippedVariants.join(', ')}`);
    }
    for (const c of m.countryPages) {
      writePage(`can-i-enter/${pp.slug}/${c.slug}`, countryPage(pp, m, c, visasByCode), '0.7');
    }
  }

  updateSitemap();

  console.log(`\nGenerated ${created.length - 1} pages + sitemap (${YEAR} build, ${TODAY}):`);
  for (const f of created) console.log(`  ${f}`);
}

main().catch(err => {
  console.error(`gen-visa-pages failed: ${err.message}`);
  process.exit(1);
});
