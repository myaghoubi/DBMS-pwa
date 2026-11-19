#!/usr/bin/env node
// مدیریت نسخه: نسخه را در version.json ، index.html و sw.js هم‌زمان تغییر می‌دهد.
//   node tools/bump.mjs patch|minor|major|x.y.z "یادداشت ۱" "یادداشت ۲" [--tag]
//   node tools/bump.mjs --check      (بررسی هم‌خوانی نسخه در سه فایل)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = n => path.join(root, n);
const read = n => fs.readFileSync(P(n), 'utf8');
const RE = {
  'index.html': /const APP_VERSION='([^']+)'/,
  'sw.js': /const VERSION = '([^']+)'/,
};
const meta = JSON.parse(read('version.json'));
const found = {
  'version.json': meta.version,
  'index.html': read('index.html').match(RE['index.html'])?.[1],
  'sw.js': read('sw.js').match(RE['sw.js'])?.[1],
};

const args = process.argv.slice(2);

if (args.includes('--check')) {
  const bad = Object.entries(found).filter(([, v]) => v !== meta.version);
  console.log(found);
  if (bad.length) { console.error('✗ نسخه‌ها هم‌خوان نیستند:', bad.map(b => b[0]).join(', ')); process.exit(1); }
  console.log('✓ همهٔ فایل‌ها روی نسخهٔ', meta.version);
  process.exit(0);
}

const tag = args.includes('--tag');
const [kind, ...notes] = args.filter(a => a !== '--tag');
if (!kind) { console.error('استفاده: node tools/bump.mjs patch|minor|major|x.y.z "یادداشت" … [--tag]'); process.exit(1); }
if (!notes.length) { console.error('حداقل یک یادداشت تغییرات لازم است.'); process.exit(1); }

const cur = meta.version.split('.').map(Number);
let next;
if (/^\d+\.\d+\.\d+$/.test(kind)) next = kind;
else if (kind === 'major') next = `${cur[0] + 1}.0.0`;
else if (kind === 'minor') next = `${cur[0]}.${cur[1] + 1}.0`;
else if (kind === 'patch') next = `${cur[0]}.${cur[1]}.${cur[2] + 1}`;
else { console.error('نوع نامعتبر:', kind); process.exit(1); }

const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
if (cmp(next, meta.version) <= 0) { console.error(`نسخهٔ جدید (${next}) باید از نسخهٔ فعلی (${meta.version}) بزرگ‌تر باشد.`); process.exit(1); }

// تاریخ شمسی امروز
const p = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' })
  .formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
const date = `${p.year}/${p.month}/${p.day}`;

meta.version = next; meta.date = date;
meta.changelog.unshift({ version: next, date, notes });
fs.writeFileSync(P('version.json'), JSON.stringify(meta, null, 2) + '\n');

for (const [file, re] of Object.entries(RE)) {
  const src = read(file);
  fs.writeFileSync(P(file), src.replace(re, m => m.replace(/'[^']+'/, `'${next}'`)));
}
console.log(`✓ نسخه ${found['version.json']} → ${next} (${date})`);
if (tag) { execSync(`git tag -a v${next} -m "v${next}"`, { cwd: root, stdio: 'inherit' }); console.log('✓ تگ v' + next + ' ساخته شد'); }
