// Проверяет, не написал ли Лёня боту. Если написал — складывает вопросы в vopros.txt.
// Код выхода: 0 — есть новые вопросы (значит пора будить Claude), 2 — тихо, будить не нужно.
// Запуск: TG_TOKEN=... TG_CHAT=... node chat.js

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const STATE = path.join(DIR, 'state.json');
const VOPROS = path.join(DIR, 'vopros.txt');
const HISTORY = path.join(DIR, 'istoriya.md');
const KEEP = 30; // сколько последних реплик держим — чтобы файл не рос бесконечно
const TOKEN = process.env.TG_TOKEN;
const CHAT = String(process.env.TG_CHAT || '');

if (!TOKEN || !CHAT) { console.error('нет TG_TOKEN или TG_CHAT'); process.exit(1); }

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
}
function writeState(s) {
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2), 'utf8');
}

async function main() {
  const state = readState();
  const offset = state.tgOffset || 0;

  const url = `https://api.telegram.org/bot${TOKEN}/getUpdates`
    + `?timeout=0&allowed_updates=["message"]`
    + (offset ? `&offset=${offset}` : '');

  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const data = await r.json();
  if (!data.ok) throw new Error(data.description || 'ошибка Telegram');

  const updates = data.result || [];
  if (!updates.length) { console.log('новых сообщений нет'); process.exit(2); }

  // сдвигаем offset за последнее обработанное — иначе одно и то же придёт снова
  state.tgOffset = updates[updates.length - 1].update_id + 1;

  const questions = updates
    .map(u => u.message)
    .filter(m => m && String(m.chat?.id) === CHAT && typeof m.text === 'string')
    .map(m => m.text.trim())
    .filter(t => t && t !== '/start');

  state.chatLastCheck = new Date().toISOString();
  writeState(state);

  if (!questions.length) { console.log('новых вопросов нет (только служебное)'); process.exit(2); }

  fs.writeFileSync(VOPROS, questions.join('\n---\n'), 'utf8');

  // дописываем вопросы в историю переписки и подрезаем её до последних KEEP реплик
  const when = new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  let history = '';
  try { history = fs.readFileSync(HISTORY, 'utf8'); } catch { history = '# Переписка с Лёней\n'; }
  history += questions.map(q => `\n## Лёня (${when})\n${q}\n`).join('');

  const blocks = history.split(/\n(?=## )/);
  if (blocks.length > KEEP + 1) {
    history = blocks[0].startsWith('# ') ? blocks[0] + '\n' + blocks.slice(-KEEP).join('\n')
                                         : blocks.slice(-KEEP).join('\n');
  }
  fs.writeFileSync(HISTORY, history, 'utf8');

  console.log(`вопросов: ${questions.length}`);
  process.exit(0);
}

main().catch(e => { console.error('проверка сообщений упала:', e.message); process.exit(1); });
