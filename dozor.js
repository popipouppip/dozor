// ДОЗОР — сборщик фактов для ночного агента.
// Ничего не оценивает: собирает сырьё (источники, здоровье сайтов, дедлайны)
// и отдаёт компактный JSON. Смыслом занимается агент, который это читает.
// Запуск: node dozor.js [--json] [--days N]

const fs = require('fs');
const path = require('path');

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf8'));
const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const DAYS = +(argv[argv.indexOf('--days') + 1]) || CFG.days || 2;
const PER_SOURCE = CFG.perSource || 6;

// ── мини-парсер фидов (без зависимостей) ──
const decode = s => (s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&amp;/g, '&');
const strip = s => decode(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1] : ''; };
const tagAll = (xml, t) => [...xml.matchAll(new RegExp(`<${t}[^>]*>[\\s\\S]*?</${t}>`, 'gi'))].map(m => m[0]);
const attr = (xml, t, a) => { const m = xml.match(new RegExp(`<${t}[^>]*\\b${a}=["']([^"']+)["']`, 'i')); return m ? m[1] : ''; };

async function get(url, timeout = 15000) {
  let last;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (dozor)', 'Accept-Language': 'ru,en' },
        signal: AbortSignal.timeout(timeout)
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = await r.text();
      if (!t.trim()) throw new Error('пустой ответ');
      return t;
    } catch (e) { last = e; }
  }
  throw last;
}

// ── источники ──
async function youtube(src) {
  let id = src.channelId;
  if (!id && src.handle) { // хэндл → channelId, чтобы не хранить непроверяемые UC-строки
    const page = await get(`https://www.youtube.com/@${src.handle.replace(/^@/, '')}/videos`);
    id = (page.match(/"channelId":"(UC[\w-]{20,})"/) || page.match(/channel_id=(UC[\w-]{20,})/) || [])[1];
    if (!id) throw new Error(`не нашёл channelId для @${src.handle}`);
  }
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  return tagAll(xml, 'entry').map(e => ({
    title: strip(tag(e, 'title')),
    url: attr(e, 'link', 'href'),
    date: new Date(tag(e, 'published')),
    text: strip(tag(e, 'media:description')).slice(0, 300)
  }));
}

async function github(src) {
  const kind = src.kind === 'commits' ? 'commits' : 'releases';
  const xml = await get(`https://github.com/${src.repo}/${kind}.atom`);
  return tagAll(xml, 'entry').map(e => ({
    title: strip(tag(e, 'title')),
    url: attr(e, 'link', 'href'),
    date: new Date(tag(e, 'updated') || tag(e, 'published')),
    text: strip(tag(e, 'content')).slice(0, 400)
  }));
}

async function rss(src) {
  const xml = await get(src.url);
  const items = tagAll(xml, 'item');
  const list = items.length ? items.map(e => ({
    title: strip(tag(e, 'title')),
    url: strip(tag(e, 'link')),
    date: new Date(tag(e, 'pubDate') || tag(e, 'dc:date')),
    text: strip(tag(e, 'description')).slice(0, 300)
  })) : tagAll(xml, 'entry').map(e => ({
    title: strip(tag(e, 'title')),
    url: attr(e, 'link', 'href') || strip(tag(e, 'id')),
    date: new Date(tag(e, 'updated') || tag(e, 'published')),
    text: strip(tag(e, 'summary') || tag(e, 'content')).slice(0, 300)
  }));
  return list;
}

async function telegram(src) {
  const html = await get(`https://t.me/s/${src.channel}`);
  const msgs = [...html.matchAll(/<div class="tgme_widget_message[ _a-z0-9]*"[\s\S]*?data-post="([^"]+)"[\s\S]*?<\/time>/gi)].map(m => m[0]);
  return msgs.map(m => {
    const body = tag(m, 'div class="tgme_widget_message_text[^"]*"') || '';
    const text = strip(body);
    return {
      title: text.slice(0, 100) || '(медиа без текста)',
      url: 'https://t.me/' + (m.match(/data-post="([^"]+)"/) || [, ''])[1],
      date: new Date(attr(m, 'time', 'datetime')),
      text: text.slice(0, 300)
    };
  });
}

const PARSERS = { youtube, github, rss, telegram };

// ── здоровье сайтов Лёни ──
async function checkSite(site) {
  const started = Date.now();
  try {
    const r = await fetch(site.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (dozor)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000)
    });
    const body = await r.text();
    const ms = Date.now() - started;
    // HTTP 200 ещё не значит «работает» — проверяем, что страница не пустая
    // и содержит опорную строку, если она задана (урок из практики #14 в базе).
    const tooSmall = body.replace(/\s+/g, '').length < 400;
    const missing = site.expect && !body.toLowerCase().includes(site.expect.toLowerCase());
    return {
      name: site.name, url: site.url, status: r.status, ms,
      ok: r.ok && !tooSmall && !missing,
      note: !r.ok ? `код ${r.status}` : tooSmall ? 'страница почти пустая' : missing ? `нет опорного текста «${site.expect}»` : ''
    };
  } catch (e) {
    return { name: site.name, url: site.url, status: 0, ms: Date.now() - started, ok: false, note: 'не отвечает: ' + e.message };
  }
}

// ── дедлайны ──
function deadlines() {
  const today = new Date();
  return (CFG.deadlines || []).map(d => {
    const target = new Date(d.date + 'T00:00:00');
    const days = Math.ceil((target - today) / 864e5);
    return { name: d.name, date: d.date, daysLeft: days, note: d.note || '' };
  }).sort((a, b) => a.daysLeft - b.daysLeft);
}

async function run() {
  const feed = [];

  const collected = await Promise.all((CFG.sources || []).map(async src => {
    // редким темам можно дать своё окно: "days": 14 у источника
    const cutoff = Date.now() - (src.days || DAYS) * 864e5;
    try {
      let items = await PARSERS[src.type](src);
      items = items
        .filter(i => i.title && i.date instanceof Date && !isNaN(i.date))
        .filter(i => i.date.getTime() >= cutoff)
        .sort((a, b) => b.date - a.date)
        .slice(0, PER_SOURCE)
        .map(i => ({ title: i.title, url: i.url, at: i.date.toISOString(), text: i.text }));
      return { source: src.name, type: src.type, topic: src.topic || '', items };
    } catch (e) {
      return { source: src.name, type: src.type, topic: src.topic || '', items: [], error: e.message };
    }
  }));
  feed.push(...collected);

  const sites = await Promise.all((CFG.sites || []).map(checkSite));

  const report = {
    generatedAt: new Date().toISOString(),
    windowDays: DAYS,
    interests: CFG.interests || [],
    freshCount: feed.reduce((n, g) => n + g.items.length, 0),
    feed,
    sites,
    sitesDown: sites.filter(s => !s.ok).map(s => `${s.name}: ${s.note}`),
    deadlines: deadlines()
  };

  fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

  if (AS_JSON) { process.stdout.write(JSON.stringify(report)); return; }

  console.log(`\nДОЗОР — сбор за ${DAYS} дн., ${new Date().toLocaleString('ru-RU')}\n`);
  for (const g of feed) {
    console.log(`· ${g.source}${g.topic ? ' [' + g.topic + ']' : ''}: ${g.error ? 'ОШИБКА — ' + g.error : g.items.length + ' свежих'}`);
    for (const i of g.items) console.log(`    – ${i.title}`);
  }
  console.log('\nСайты:');
  for (const s of sites) console.log(`  ${s.ok ? 'ok  ' : 'ПАДЁТ'} ${s.name} — ${s.status} за ${s.ms}мс ${s.note}`);
  console.log('\nДедлайны:');
  for (const d of report.deadlines) console.log(`  ${d.daysLeft} дн. — ${d.name}`);
  console.log(`\nИтого свежего: ${report.freshCount}. Сырьё → report.json`);
}

if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
module.exports = { run };
