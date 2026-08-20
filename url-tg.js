// Готовит ссылки для отправки письма в Telegram через инструмент WebFetch.
// Нужен там, где обычная сеть недоступна (облачная песочница блокирует api.telegram.org
// для curl и fetch, но инструмент WebFetch ходит своим путём и открывает его нормально).
//
// Запуск: TG_TOKEN=... TG_CHAT=... node url-tg.js pismo.md
// Печатает 1-3 готовых адреса. Открой каждый инструментом WebFetch по очереди,
// в ответе должно быть "ok":true.

const fs = require('fs');

const TOKEN = process.env.TG_TOKEN;
const CHAT = process.env.TG_CHAT;
const PART = 900; // символов текста на сообщение: адрес после кодирования кириллицы выходит втрое длиннее

if (!TOKEN || !CHAT) { console.error('Нужны переменные TG_TOKEN и TG_CHAT'); process.exit(1); }

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

function chunk(text) {
  const parts = [];
  let cur = '';
  for (const block of text.split(/\n\n+/)) {
    const piece = block.length > PART ? block.slice(0, PART) : block;
    if ((cur + '\n\n' + piece).length > PART && cur) { parts.push(cur); cur = piece; }
    else cur = cur ? cur + '\n\n' + piece : piece;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

const file = process.argv[2];
const raw = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');
if (!raw.trim()) { console.error('Пустой текст — отправлять нечего'); process.exit(1); }

const parts = chunk(raw.trim());
parts.forEach((p, i) => {
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`
    + `?chat_id=${encodeURIComponent(CHAT)}`
    + `&parse_mode=HTML&link_preview_options=${encodeURIComponent('{"is_disabled":true}')}`
    + `&text=${encodeURIComponent(toHtml(p))}`;
  console.log(`--- часть ${i + 1} из ${parts.length} (${url.length} символов в адресе) ---`);
  console.log(url);
});
