// Готовит ссылки для отправки письма в Telegram через инструмент WebFetch.
// Нужен там, где обычная сеть недоступна: облачная песочница блокирует api.telegram.org
// для curl и fetch, а WebFetch ходит своим путём и открывает его нормально.
//
// Две тонкости, из-за которых этот файл вообще существует:
//   1. WebFetch отказывается открывать адрес длиннее примерно тысячи символов;
//   2. поэтому кириллицу и иероглифы в адрес кладём как есть — процентное кодирование
//      раздуло бы каждую букву в шесть символов. Кодируем только ASCII-спецсимволы.
//
// Запуск: TG_TOKEN=... TG_CHAT=... node url-tg.js pismo.md
// Печатает 1-3 готовых адреса. Открой каждый инструментом WebFetch по очереди,
// в ответе должно быть "ok":true.

const fs = require('fs');

const TOKEN = process.env.TG_TOKEN;
const CHAT = process.env.TG_CHAT;
const MAX_URL = 900; // проверенный предел WebFetch с запасом

if (!TOKEN || !CHAT) { console.error('Нужны переменные TG_TOKEN и TG_CHAT'); process.exit(1); }

const HEAD = `https://api.telegram.org/bot${TOKEN}/sendMessage?chat_id=${CHAT}&parse_mode=HTML&text=`;

function toHtml(src) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const links = [];
  let t = src.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, url) => {
    links.push({ text, url });
    return ` L${links.length - 1} `;
  });
  t = esc(t)
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/__([^_\n]+)__/g, '<i>$1</i>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  return t.replace(/ L(\d+) /g, (_, i) => {
    const l = links[+i];
    return `<a href="${l.url.replace(/&/g, '&amp;').replace(/"/g, '%22')}">${esc(l.text)}</a>`;
  });
}

// Всё, что не ASCII, остаётся собой: адрес от этого короче в разы, и WebFetch такое принимает.
function urlSafe(s) {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code > 127) out += ch;
    else if (/[A-Za-z0-9\-_.~]/.test(ch)) out += ch;
    else out += '%' + code.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

// Режем по абзацам так, чтобы готовый адрес каждой части влезал в предел.
function chunk(text) {
  const parts = [];
  let cur = '';
  const fits = s => HEAD.length + urlSafe(toHtml(s)).length <= MAX_URL;

  for (let block of text.split(/\n\n+/)) {
    while (!fits(block)) {              // абзац-гигант дробим по строкам
      const lines = block.split('\n');
      if (lines.length === 1) { block = block.slice(0, Math.floor(block.length * 0.8)); continue; }
      const half = Math.ceil(lines.length / 2);
      parts.push(lines.slice(0, half).join('\n'));
      block = lines.slice(half).join('\n');
    }
    if (cur && fits(cur + '\n\n' + block)) cur += '\n\n' + block;
    else { if (cur) parts.push(cur); cur = block; }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

const file = process.argv[2];
const raw = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');
if (!raw.trim()) { console.error('Пустой текст — отправлять нечего'); process.exit(1); }

const parts = chunk(raw.trim());
parts.forEach((p, i) => {
  const url = HEAD + urlSafe(toHtml(p));
  console.log(`--- часть ${i + 1} из ${parts.length} (${url.length} символов в адресе) ---`);
  console.log(url);
});
