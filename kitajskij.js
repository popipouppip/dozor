// Утренняя порция китайского: пять слов из базы СЮЭ по кругу, без повторов.
// Запуск: node kitajskij.js [--n 5]   → печатает готовый блок для письма
// Позиция запоминается в state.json, поэтому каждый день слова новые.

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const WORDS = JSON.parse(fs.readFileSync(path.join(DIR, 'slova.json'), 'utf8'));
const STATE = path.join(DIR, 'state.json');

const argv = process.argv.slice(2);
const N = +(argv[argv.indexOf('--n') + 1]) || 5;

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
}
function writeState(s) {
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2), 'utf8');
}

const state = readState();
const from = state.chineseCursor || 0;

const picked = [];
for (let i = 0; i < N && i < WORDS.length; i++) {
  picked.push(WORDS[(from + i) % WORDS.length]);
}

state.chineseCursor = (from + N) % WORDS.length;
state.chineseLastRun = new Date().toISOString();
writeState(state);

const lines = picked.map(w => `${w.hz} — ${w.py} — ${w.ru}`);
const passed = from + N >= WORDS.length ? WORDS.length : from + N;

console.log(lines.join('\n'));
console.log(`\n(слова ${from + 1}–${passed} из ${WORDS.length} в базе СЮЭ)`);
