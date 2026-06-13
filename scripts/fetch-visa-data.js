#!/usr/bin/env node
/**
 * fetch-visa-data.js — pull the real Layovered visa dataset at build time and
 * write a TEASER-ONLY data/visa-data.json that gen-visa-pages.js consumes.
 *
 * This is the production "Option B" data path: the Layovered API is only ever
 * called from the build machine, never the visitor's browser. Gated fields
 * (apply links, document lists, processing time, visa2fly links) are stripped
 * here and never written to disk — gen-visa-pages.js then strips again
 * (defense in depth).
 *
 * Endpoints (auth: "Bearer <token>"):
 *   GET  {BASE}/api/passports
 *   GET  {BASE}/api/visas
 *   POST {BASE}/api/unlocks   body: { passports:[id], visas:[id,...] }
 *
 * Usage:
 *   VISA_API_TOKEN=xxx node scripts/fetch-visa-data.js
 *   VISA_API_BASE=https://lmg-staging-x89z.layovered.com VISA_API_TOKEN=xxx node scripts/fetch-visa-data.js
 *
 * Then: node scripts/gen-visa-pages.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'data', 'visa-data.json');

const BASE = process.env.VISA_API_BASE || 'https://lmg-staging-x89z.layovered.com';
const TOKEN = process.env.VISA_API_TOKEN || process.env.VISA_API_KEY;

// Wave-1 passports — nationality adjective is not in the API, so map it here.
const WAVE1 = [
  { code: 'IN', slug: 'india', nationality: 'Indian' },
  { code: 'PH', slug: 'philippines', nationality: 'Filipino' },
  { code: 'NG', slug: 'nigeria', nationality: 'Nigerian' },
  { code: 'PK', slug: 'pakistan', nationality: 'Pakistani' },
  { code: 'BD', slug: 'bangladesh', nationality: 'Bangladeshi' },
];

// Wave-1 visas — API id → the generator's visa identity (brand names from the brief).
const WAVE1_VISAS = [
  { apiId: 2, code: 'US', name: 'US visa', slug: 'us' },
  { apiId: 1, code: 'SCHENGEN', name: 'Schengen visa', slug: 'schengen' },
  { apiId: 4, code: 'UK', name: 'UK visa', slug: 'uk' },
  { apiId: 67, code: 'CA', name: 'Canada visa', slug: 'canada' },
  { apiId: 3, code: 'AE', name: 'UAE visa', slug: 'uae' },
];
const VISA_BY_API_ID = Object.fromEntries(WAVE1_VISAS.map(v => [v.apiId, v]));

// API restriction_type → generator access type.
const ACCESS_MAP = {
  visaFree: 'visa_free',
  visaOnArrival: 'voa',
  visaOnline: 'evisa',
  eta: 'eta',
};
const FREE_ACCESS = new Set(['visa_free']);
const ACCESS_RANK = { visa_free: 0, voa: 1, evisa: 2, eta: 3 };

function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function api(pathname, init) {
  if (!TOKEN) throw new Error('VISA_API_TOKEN (or VISA_API_KEY) is not set.');
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init && init.headers) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${pathname} → ${res.status} ${res.statusText} ${txt}`.trim());
  }
  return res.json();
}

// Keep only the teaser stay/price; gated details_json fields are dropped here.
function teaserStay(details) {
  const v = details && details.validity;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function teaserPrice(details, access) {
  const p = details && details.price;
  if (typeof p === 'string' && p.trim()) return p.trim();
  return FREE_ACCESS.has(access) ? 'Free' : null;
}

function transformCountry(c) {
  const access = ACCESS_MAP[c.restriction_type];
  if (!access) return null; // skip visaRequired / unknown
  const pairs = Array.isArray(c.valid_pairs) ? c.valid_pairs : [];
  const isBase = pairs.some(p => !p.visa_id);
  const unlockedBy = isBase
    ? []
    : [...new Set(pairs.map(p => p.visa_id).filter(Boolean)
        .map(id => VISA_BY_API_ID[id] && VISA_BY_API_ID[id].code)
        .filter(Boolean))];
  // A non-base country unlocked only by non-Wave-1 visas would be empty — skip it.
  if (!isBase && !unlockedBy.length) return null;

  const country = {
    code: c.code,
    name: c.name,
    slug: slugify(c.name),
    region: c.region,
    access,
    unlockedBy,
  };
  const stay = teaserStay(c.details_json);
  if (stay) country.stay = stay;
  const price = teaserPrice(c.details_json, access);
  if (price) country.price = price;
  return country;
}

// base access first, then by access rank, then alpha — gives the generator a
// sensible "top ~50" ordering for which country pages to build.
function sortCountries(a, b) {
  const ab = a.unlockedBy.length ? 1 : 0;
  const bb = b.unlockedBy.length ? 1 : 0;
  if (ab !== bb) return ab - bb;
  if (ACCESS_RANK[a.access] !== ACCESS_RANK[b.access]) return ACCESS_RANK[a.access] - ACCESS_RANK[b.access];
  return a.name.localeCompare(b.name);
}

async function main() {
  console.log(`• API base: ${BASE}`);
  const [passports, visas] = await Promise.all([api('/api/passports'), api('/api/visas')]);
  console.log(`• Fetched ${passports.length} passports, ${visas.length} visas.`);

  const visaIds = WAVE1_VISAS.map(v => v.apiId);
  const outPassports = [];

  for (const w of WAVE1) {
    const pp = passports.find(p => p.code === w.code);
    if (!pp) { console.log(`• Skipping ${w.slug}: not found in API passports.`); continue; }
    const rows = await api('/api/unlocks', {
      method: 'POST',
      body: JSON.stringify({ passports: [pp.id], visas: visaIds }),
    });
    const countries = rows.map(transformCountry).filter(Boolean).sort(sortCountries);
    const base = countries.filter(c => !c.unlockedBy.length).length;
    console.log(`• ${w.slug} (id=${pp.id}): ${countries.length} accessible (${base} base, ${countries.length - base} visa-unlocked).`);
    outPassports.push({
      code: pp.code,
      name: pp.name,
      nationality: w.nationality,
      slug: w.slug,
      countries,
    });
  }

  const out = {
    visas: WAVE1_VISAS.map(v => ({ code: v.code, name: v.name, slug: v.slug })),
    passports: outPassports,
  };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nWrote teaser-only ${path.relative(ROOT, OUT_FILE)} (${outPassports.length} passports). Now run: node scripts/gen-visa-pages.js`);
}

main().catch(err => {
  console.error(`fetch-visa-data failed: ${err.message}`);
  process.exit(1);
});
