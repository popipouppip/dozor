// Сторож сайтов. Запускается раз в час, работает без Claude — просто проверка и сравнение.
// Пишет в Telegram ТОЛЬКО когда что-то изменилось: сайт упал или снова поднялся.
// Пока всё хорошо — молчит. Запуск: TG_TOKEN=... TG_CHAT=... node watch.js

const fs = require('fs');
const path = require('path');
const { checkSite, CFG } = require('./dozor.js');

const STATE = path.join(__dirname, 'state.json');
const TOKEN = process.env.TG_TOKEN;
const CHAT = process.env.TG_CHAT;

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
}
function writeState(s) {
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2), 'utf8');
}

async function send(text) {
  if (!TOKEN || !CHAT) { console.log('нет TG_TOKEN/TG_CHAT — сообщение не отправлено'); return; }
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
    signal: AbortSignal.timeout(25000)
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.description || 'ошибка Telegram');
}

async function main() {
  const results = await Promise.all((CFG.sites || []).map(checkSite));
  const state = readState();
  const prev = state.sitesState || {};
  const now = {};
  const upset = [];   // упало
  const fixed = [];   // починилось

  for (const r of results) {
    now[r.name] = r.ok;
    const was = prev[r.name];
    // сообщаем только про смену состояния; первый запуск просто запоминает картину
    if (was === true && r.ok === false) upset.push(r);
    if (was === false && r.ok === true) fixed.push(r);
  }

  state.sitesState = now;
  state.watchLastRun = new Date().toISOString();
  writeState(state);

  const parts = [];
  if (upset.length) {
    parts.push('<b>Сайт не отвечает</b>\n' + upset.map(r => `${r.name} — ${r.note || 'код ' + r.status}\n${r.url}`).join('\n\n'));
  }
  if (fixed.length) {
    parts.push('<b>Снова работает</b>\n' + fixed.map(r => `${r.name} — ответил за ${r.ms} мс`).join('\n'));
  }

  if (!parts.length) {
    const bad = results.filter(r => !r.ok).length;
    console.log(`без изменений: ${results.length - bad} в порядке, ${bad} лежит`);
    return;
  }

  await send(parts.join('\n\n'));
  console.log('отправлено:', upset.length, 'упало,', fixed.length, 'починилось');
}

main().catch(e => { console.error('сторож упал:', e.message); process.exit(1); });
