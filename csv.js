'use strict';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const LETTER = /^\s*([A-Da-d])\s*[\)\.:\-]\s*/;

function rowsToQuestions(rows) {
  const questions = [];
  for (const raw of rows) {
    const cells = raw.map((c) => String(c).trim()).filter(Boolean);
    if (cells.length < 5) continue;
    if (/^question/i.test(cells[0])) continue;
    const text = cells[0];
    const answers = cells.slice(1, 5).map((a) => a.replace(LETTER, '').trim());
    let correct = 0;
    const tail = cells[5];
    if (tail) {
      const letter = tail.match(/^([A-Da-d])$/);
      if (letter) correct = letter[1].toUpperCase().charCodeAt(0) - 65;
      else {
        const idx = answers.findIndex((a) => a.toLowerCase() === tail.replace(LETTER, '').trim().toLowerCase());
        if (idx >= 0) correct = idx;
      }
    }
    questions.push({ text, answers, correct });
  }
  return questions;
}

function sheetCsvUrl(url) {
  const m = String(url).match(/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const gid = (String(url).match(/[#&?]gid=(\d+)/) || [])[1] || '0';
  return 'https://docs.google.com/spreadsheets/d/' + m[1] + '/export?format=csv&gid=' + gid;
}

module.exports = { parseCsv, rowsToQuestions, sheetCsvUrl };
