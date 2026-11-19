#!/usr/bin/env node
// مدیریت نسخه
//   node tools/bump.mjs patch|minor|major|x.y.z "یادداشت ۱" "یادداشت ۲" [--tag]
//   node tools/bump.mjs --check
//
// فایل‌ها:
//   version.js      ← تنها منبع شمارهٔ نسخه (APP_VERSION / APP_DATE)؛ index.html و sw.js از آن می‌خوانند
//   changelog.json  ← تاریخچهٔ تغییرات
//   version.json    ← خروجی خودکار برای سازگاری با نسخه‌های ≤ 0.4.0 که فقط این فایل را می‌شناسند (دستی ویرایش نشود)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = n => path.join(root, n);
const read = n => fs.readFileSync(P(n), 'utf8');
const RE_V = /(APP_VERSION\s*=\s*')(\d+\.\d+\.\d+)(')/;
const RE_D = /(APP_DATE\s*=\s*')([^']*)(')/;

const cur = read('version.js').match(RE_V)?.[2];
const changelog = JSON.parse(read('changelog.json'));
const args = process.argv.slice(2);

function writeLegacy(version, date) {
  fs.writeFileSync(P('version.json'), JSON.stringify({ version, date, changelog }, null, 2) + '\n');
}

if (args.includes('--check')) {
  const problems = [];
  if (!cur) problems.push('APP_VERSION در version.js پیدا نشد');
  if (changelog[0]?.version !== cur) problems.push(`اولین ورودی changelog.json (${changelog[0]?.version}) با version.js (${cur}) فرق دارد`);
  let legacy = {};
  try { legacy = JSON.parse(read('version.json')); } catch { problems.push('version.json خوانده نشد'); }
  if (legacy.version !== cur) problems.push(`version.json (${legacy.version}) با version.js (${cur}) فرق دارد`);
  for (const f of ['index.html', 'sw.js']) {
    if (/APP_VERSION\s*=\s*'\d/.test(read(f)) || /const VERSION\s*=/.test(read(f))) problems.push(`${f} نباید شمارهٔ نسخه را مستقیم داشته باشد`);
  }
  if (!/src="version\.js"/.test(read('index.html'))) problems.push('index.html باید version.js را بارگذاری کند');
  if (!/importScripts\('version\.js'\)/.test(read('sw.js'))) problems.push('sw.js باید version.js را importScripts کند');
  if (problems.length) { problems.forEach(p => console.error('✗ ' + p)); process.exit(1); }
  console.log('✓ همه‌چیز روی نسخهٔ', cur);
  process.exit(0);
}

const tag = args.includes('--tag');
const [kind, ...notes] = args.filter(a => a !== '--tag');
if (!kind) { console.error('استفاده: node tools/bump.mjs patch|minor|major|x.y.z "یادداشت" … [--tag]'); process.exit(1); }
if (!notes.length) { console.error('حداقل یک یادداشت تغییرات لازم است.'); process.exit(1); }

const c = cur.split('.').map(Number);
let next;
if (/^\d+\.\d+\.\d+$/.test(kind)) next = kind;
else if (kind === 'major') next = `${c[0] + 1}.0.0`;
else if (kind === 'minor') next = `${c[0]}.${c[1] + 1}.0`;
else if (kind === 'patch') next = `${c[0]}.${c[1]}.${c[2] + 1}`;
else { console.error('نوع نامعتبر:', kind); process.exit(1); }

const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
if (cmp(next, cur) <= 0) { console.error(`نسخهٔ جدید (${next}) باید از نسخهٔ فعلی (${cur}) بزرگ‌تر باشد.`); process.exit(1); }

const p = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' })
  .formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
const date = `${p.year}/${p.month}/${p.day}`;

fs.writeFileSync(P('version.js'), read('version.js').replace(RE_V, `$1${next}$3`).replace(RE_D, `$1${date}$3`));
changelog.unshift({ version: next, date, notes });
fs.writeFileSync(P('changelog.json'), JSON.stringify(changelog, null, 2) + '\n');
writeLegacy(next, date);

console.log(`✓ نسخه ${cur} → ${next} (${date})`);
if (tag) { execSync(`git tag -a v${next} -m "v${next}"`, { cwd: root, stdio: 'inherit' }); console.log('✓ تگ v' + next + ' ساخته شد'); }
