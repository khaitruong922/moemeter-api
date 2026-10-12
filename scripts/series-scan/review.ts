import { newSeriesPositions } from './positions';
import type { ScanResult } from './scan';

// Self-contained review page: data embedded, no server. Decisions persist in localStorage per scan
// and are exported as decisions.json for `npm run series:apply`.

export const renderReview = (result: ScanResult): string => {
	// JSON inside <script>: "</" would end the tag early
	// candidates.json from before positions were scanned: compute them here, so re-rendering an
	// older scan (keeping the user's saved choices) still shows volume-number positions
	for (const c of result.new_series) {
		if (c.books.every((b) => typeof b.position === 'number')) continue;
		const positions = newSeriesPositions(c.books);
		c.books.forEach((b, i) => (b.position = positions[i]));
	}
	const data = JSON.stringify(result).replace(/</g, '\\u003c');
	return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>シリーズスキャン ${result.generated_at.slice(0, 10)}</title>
<style>
  :root { --green: #77b944; --red: #d9534f; --grey: #888; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Hiragino Sans", sans-serif; margin: 0; background: #f6f7f5; color: #222; }
  header { position: sticky; top: 0; z-index: 2; background: #fff; border-bottom: 1px solid #ddd; padding: 10px 16px; }
  h1 { font-size: 16px; margin: 0 0 6px; }
  .stats { font-size: 12px; color: var(--grey); }
  .tabs { display: flex; gap: 4px; margin-top: 8px; }
  .tab { border: 1px solid #ccc; background: #fafafa; padding: 6px 12px; border-radius: 6px 6px 0 0; cursor: pointer; font-size: 14px; }
  .tab.active { background: var(--green); color: #fff; border-color: var(--green); }
  .toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 13px; margin-top: 8px; }
  .toolbar button { font-size: 13px; padding: 4px 10px; cursor: pointer; }
  main { padding: 12px 16px 80px; max-width: 1100px; margin: 0 auto; }
  .card { background: #fff; border: 1px solid #e3e3e3; border-left: 6px solid #ccc; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
  .card.approved { border-left-color: var(--green); }
  .card.rejected { border-left-color: var(--red); opacity: .55; }
  .head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .conf { font-weight: bold; font-size: 13px; padding: 2px 8px; border-radius: 10px; color: #fff; }
  .name { font-weight: bold; font-size: 15px; }
  .name input { font: inherit; width: 28em; max-width: 100%; }
  .series-link { color: var(--green); }
  .warn { color: #c77800; font-size: 13px; cursor: help; }
  .num { color: #d00; font-weight: bold; }
  .bpos { display: flex; gap: 2px; align-items: center; margin-top: 3px; }
  .bpos input { width: 4.2em; font: inherit; font-weight: bold; color: var(--green); }
  .bpos input.bad { border-color: #d00; color: #d00; }
  .bpos button, .tools button { border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer; font-size: 11px; padding: 1px 6px; }
  .tools { display: flex; gap: 4px; }
  .books { display: flex; gap: 8px; overflow-x: auto; padding: 8px 0 4px; }
  .book { width: 96px; flex: 0 0 96px; font-size: 11px; line-height: 1.3; }
  .book img { width: 96px; height: 136px; object-fit: cover; border-radius: 3px; background: #eee; display: block; }
  .book .vol { font-weight: bold; color: var(--green); }
  .book.new img { outline: 3px solid var(--green); outline-offset: -3px; }
  .book.ctx { opacity: .6; }
  .book a { color: inherit; text-decoration: none; }
  .book .t { word-break: break-all; }
  .evidence { margin: 4px 0 0; padding-left: 18px; font-size: 12px; color: #555; }
  .decide { margin-left: auto; display: flex; gap: 6px; }
  .decide button { border: 1px solid #ccc; background: #fff; border-radius: 4px; padding: 4px 10px; cursor: pointer; }
  .approved .decide .ok { background: var(--green); color: #fff; border-color: var(--green); }
  .rejected .decide .no { background: var(--red); color: #fff; border-color: var(--red); }
  .pos input { width: 5em; font: inherit; }
  .empty { color: var(--grey); padding: 40px; text-align: center; }
  footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #ddd; padding: 8px 16px; display: flex; gap: 12px; align-items: center; font-size: 13px; }
  footer button { background: var(--green); color: #fff; border: 0; border-radius: 4px; padding: 6px 14px; font-size: 14px; cursor: pointer; }
</style>
</head>
<body>
<header>
  <h1>シリーズスキャン <span class="stats" id="stats"></span></h1>
  <div class="tabs" id="tabs"></div>
  <div class="toolbar">
    <label>最低信頼度 <input type="range" id="min" min="0" max="1" step="0.05" value="0"> <span id="minv">0.00</span></label>
    <button id="approveVisible">表示中を全て承認</button>
    <button id="rejectVisible">表示中を全て却下</button>
    <button id="clearVisible">表示中の判定をクリア</button>
  </div>
</header>
<main id="list"></main>
<footer>
  <span id="summary"></span>
  <button id="export">decisions.json を書き出す</button>
  <button id="copy">コピー</button>
</footer>
<script>
const DATA = ${data};
const KEY = 'series-scan:' + DATA.generated_at;
const state = JSON.parse(localStorage.getItem(KEY) || '{}'); // fingerprint -> {decision, name?, position?}
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
// Candidate tabs list only undecided cards; a decision moves the card to 承認済み or 却下済み
// (newest first), where clicking its decision again sends it back
const KINDS = [
  { id: 'new_series', label: '新シリーズ' },
  { id: 'additions', label: '既存シリーズへの追加' },
];
const DECIDED = { approved: '承認済み', rejected: '却下済み' };
const TABS = [...KINDS, ...Object.entries(DECIDED).map(([id, label]) => ({ id, label }))];
let tab = TABS.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : 'new_series';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const confColor = (c) => c >= 0.85 ? '#4a9d2a' : c >= 0.65 ? '#c9a227' : '#c0392b';
const vol = (b) => b.volume == null ? (b.part ? ['', '上', '中', '下'][b.part] : '—') : b.volume + (b.part ? ['', '上', '中', '下'][b.part] : '');
const bookHtml = (b, extra = '', label = '') => \`
  <div class="book \${extra}">
    <a href="https://bookmeter.com/books/\${b.id}" target="_blank" rel="noopener">
      <img loading="lazy" src="\${esc(b.thumbnail_url)}" alt="">
      <div class="vol">\${label || '巻 ' + esc(vol(b))}</div>
      <div class="t">\${markNumbers(b.title)}</div>
    </a>
    <div>\${b.read_count ? b.read_count + '人' : ''}</div>
  </div>\`;
const decisionOf = (fp) => state[fp]?.decision;
const isPosition = (v) => typeof v === 'number' && v > 0 && v < 1e6 && Math.abs(v * 100 - Math.round(v * 100)) <= 1e-6;

// A new series as edited: books not removed, with typed numbers, sorted by number (ties keep the
// scan's order). Used for the card and for the export, so what you see is what gets applied.
function seriesBooks(c) {
  const st = state[c.fingerprint] || {};
  const typed = st.positions || {};
  const removed = new Set(st.removed || []);
  return c.books
    .map((b, i) => ({ ...b, position: typed[b.id] ?? b.position, order: i }))
    .filter((b) => !removed.has(b.id))
    .sort((a, b) => a.position - b.position || a.order - b.order);
}
// every number in a title, in bold red, for checking volume order at a glance (escaped first)
const markNumbers = (title) => esc(title).replace(/[0-9０-９]+(?:[.．][0-9０-９]+)?/g, '<span class="num">$&</span>');

function card(kind, c) {
  const d = decisionOf(c.fingerprint) || '';
  const kindTag = tab in DECIDED ? \`<small class="stats">\${KINDS.find((k) => k.id === kind).label}</small>\` : '';
  const conf = kindTag + \`<span class="conf" style="background:\${confColor(c.confidence)}">\${c.confidence.toFixed(2)}</span>\`;
  const buttons = \`<span class="decide"><button class="ok" data-fp="\${c.fingerprint}" data-d="approved">承認</button><button class="no" data-fp="\${c.fingerprint}" data-d="rejected">却下</button></span>\`;
  const ev = '<ul class="evidence">' + c.evidence.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>';
  if (kind === 'new_series') {
    const fp = c.fingerprint;
    const name = state[fp]?.name ?? c.name;
    const books = seriesBooks(c);
    const removedCount = c.books.length - books.length;
    const counts = {};
    books.forEach((b) => (counts[b.position] = (counts[b.position] || 0) + 1));
    const bad = (b) => !isPosition(b.position) || counts[b.position] > 1;
    // ⚠ when the series would not start at 1, two books share a volume number, or a typed number is unusable
    const warnings = [];
    if (books.length && books[0].position !== 1) warnings.push(\`1巻がありません（最初は\${books[0].position}）\`);
    const nums = books.filter((b) => b.volume != null).map((b) => b.volume + ':' + (b.part ?? 0));
    if (new Set(nums).size !== nums.length) warnings.push('同じ巻数の本が複数あります（別の版？）');
    if (books.some(bad)) warnings.push('番号が重複しているか無効です（小数点以下2桁まで）');
    if (books.length < 2) warnings.push('本が1冊以下です');
    const warn = warnings.length ? \`<span class="warn" title="\${esc(warnings.join(' / '))}">⚠ \${esc(warnings.join(' / '))}</span>\` : '';
    const tools = \`<span class="tools">
      <button data-act="renumber" data-fp="\${fp}" title="今の並び順で 1, 2, 3… に振り直す">1から振り直す</button>
      <button data-act="reset" data-fp="\${fp}" title="スキャン結果の番号と本に戻す">巻数に戻す</button>
      \${removedCount ? \`<button data-act="restore" data-fp="\${fp}">↺ 除外した\${removedCount}冊を戻す</button>\` : ''}</span>\`;
    const bookCards = books.map((b) => \`
      <div class="book">
        <a href="https://bookmeter.com/books/\${b.id}" target="_blank" rel="noopener">
          <img loading="lazy" src="\${esc(b.thumbnail_url)}" alt="">
        </a>
        <div class="bpos">
          <input type="number" step="0.01" min="0.01" class="\${bad(b) ? 'bad' : ''}" data-fp="\${fp}" data-book="\${b.id}" data-field="bookpos" value="\${b.position}" title="番号を変えると並び替わります">
          <button data-act="remove" data-fp="\${fp}" data-book="\${b.id}" title="このシリーズから外す">×</button>
        </div>
        \${b.volume != null && b.volume !== b.position ? \`<div class="vol">巻 \${esc(vol(b))}</div>\` : ''}
        <a href="https://bookmeter.com/books/\${b.id}" target="_blank" rel="noopener"><div class="t">\${markNumbers(b.title)}</div></a>
        <div>\${b.read_count ? b.read_count + '人' : ''}</div>
      </div>\`).join('');
    return \`<div class="card \${d}"><div class="head">\${conf}
      <span class="name"><input data-fp="\${fp}" data-field="name" value="\${esc(name)}"></span>
      <span class="stats">\${books.length}冊 · \${esc(c.books[0].author)}</span>\${warn}\${tools}\${buttons}</div>
      <div class="books">\${bookCards}</div>\${ev}</div>\`;
  }
  if (kind === 'additions') {
    const pos = state[c.fingerprint]?.position ?? c.position;
    const link = \`https://moemeter.netlify.app/series/\${c.series.id}\`;
    const ctx = [
      c.neighbours.before ? bookHtml(c.neighbours.before, 'ctx', String(c.neighbours.before.position)) : '',
      bookHtml(c.book, 'new', '→ ' + pos),
      c.neighbours.after ? bookHtml(c.neighbours.after, 'ctx', String(c.neighbours.after.position)) : '',
    ].join('');
    return \`<div class="card \${d}"><div class="head">\${conf}
      <span class="name"><a class="series-link" href="\${link}" target="_blank" rel="noopener">\${esc(c.series.name)}</a>\${c.series.source === 'manual' ? ' <small>(手動)</small>' : ''}</span>
      <span class="pos"><input type="number" step="0.01" min="0.01" data-fp="\${c.fingerprint}" data-field="position" value="\${pos}"></span>\${buttons}</div>
      <div class="books">\${ctx}</div>\${ev}</div>\`;
  }
  return '';
}

// [{ kind, c }] for the current tab
function visible() {
  const min = Number(document.getElementById('min').value);
  if (tab in DECIDED) {
    return KINDS.flatMap((k) => DATA[k.id].filter((c) => decisionOf(c.fingerprint) === tab && c.confidence >= min).map((c) => ({ kind: k.id, c })))
      .sort((a, b) => (state[b.c.fingerprint].at ?? 0) - (state[a.c.fingerprint].at ?? 0));
  }
  return DATA[tab].filter((c) => !decisionOf(c.fingerprint) && c.confidence >= min).map((c) => ({ kind: tab, c }));
}

function render() {
  const all = KINDS.flatMap((k) => DATA[k.id]);
  document.getElementById('tabs').innerHTML = TABS.map((t) => {
    const count = t.id in DECIDED
      ? all.filter((c) => decisionOf(c.fingerprint) === t.id).length
      : DATA[t.id].filter((c) => !decisionOf(c.fingerprint)).length;
    return \`<span class="tab \${t.id === tab ? 'active' : ''}" data-tab="\${t.id}">\${t.label} (\${count})</span>\`;
  }).join('');
  const items = visible();
  document.getElementById('list').innerHTML = items.length
    ? items.map(({ kind, c }) => card(kind, c)).join('')
    : \`<div class="empty">\${tab in DECIDED ? \`\${DECIDED[tab]}の候補はありません\` : '未判定の候補はありません'}</div>\`;
  const approved = all.filter((c) => decisionOf(c.fingerprint) === 'approved').length;
  const rejected = all.filter((c) => decisionOf(c.fingerprint) === 'rejected').length;
  document.getElementById('summary').textContent = \`承認 \${approved} · 却下 \${rejected} · 未判定 \${all.length - approved - rejected}\`;
  const s = DATA.stats;
  document.getElementById('stats').textContent = \`\${DATA.generated_at.slice(0, 16).replace('T', ' ')} · 対象 \${s.pool}冊 · BookWalker一致 \${s.bookwalker_matched}冊\`;
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; location.hash = tab; render(); return; }
  const act = e.target.closest('button[data-act]');
  if (act) {
    const fp = act.dataset.fp;
    const cur = state[fp] || {};
    const c = DATA.new_series.find((x) => x.fingerprint === fp);
    if (act.dataset.act === 'remove') cur.removed = [...new Set([...(cur.removed || []), Number(act.dataset.book)])];
    if (act.dataset.act === 'restore') delete cur.removed;
    if (act.dataset.act === 'reset') { delete cur.positions; delete cur.removed; }
    if (act.dataset.act === 'renumber') {
      cur.positions = {};
      seriesBooks(c).forEach((b, i) => (cur.positions[b.id] = i + 1));
    }
    state[fp] = cur; save(); render();
    return;
  }
  const b = e.target.closest('button[data-fp][data-d]');
  if (b) {
    const cur = state[b.dataset.fp] || {};
    cur.decision = cur.decision === b.dataset.d ? undefined : b.dataset.d;
    cur.at = Date.now();
    state[b.dataset.fp] = cur; save(); render();
  }
});
document.addEventListener('change', (e) => {
  const i = e.target.closest('input[data-fp]');
  if (!i) return;
  const cur = state[i.dataset.fp] || {};
  if (i.dataset.field === 'bookpos') {
    // a typed number re-sorts the card
    cur.positions = { ...(cur.positions || {}), [i.dataset.book]: Number(i.value) };
    state[i.dataset.fp] = cur; save(); render();
    return;
  }
  cur[i.dataset.field] = i.dataset.field === 'position' ? Number(i.value) : i.value;
  state[i.dataset.fp] = cur; save();
});
// Enter commits a number box (fires change) instead of doing nothing
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[data-field]')) e.target.blur();
});
const bulk = (decision) => {
  const at = Date.now();
  for (const { c } of visible()) { const cur = state[c.fingerprint] || {}; cur.decision = decision; cur.at = at; state[c.fingerprint] = cur; }
  save(); render();
};
document.getElementById('approveVisible').onclick = () => bulk('approved');
document.getElementById('rejectVisible').onclick = () => bulk('rejected');
document.getElementById('clearVisible').onclick = () => bulk(undefined);
document.getElementById('min').oninput = (e) => { document.getElementById('minv').textContent = Number(e.target.value).toFixed(2); render(); };

function decisions() {
  const pick = (c) => state[c.fingerprint]?.decision;
  return {
    generated_at: DATA.generated_at,
    new_series: DATA.new_series.filter(pick).map((c) => ({
      fingerprint: c.fingerprint, decision: pick(c), confidence: c.confidence,
      name: state[c.fingerprint]?.name ?? c.name,
      book_ids: seriesBooks(c).map((b) => b.id),
      positions: seriesBooks(c).map((b) => b.position),
    })),
    additions: DATA.additions.filter(pick).map((c) => ({
      fingerprint: c.fingerprint, decision: pick(c), confidence: c.confidence,
      book_id: c.book.id, series_id: c.series.id, position: state[c.fingerprint]?.position ?? c.position,
    })),

  };
}
document.getElementById('export').onclick = () => {
  const blob = new Blob([JSON.stringify(decisions(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'decisions.json'; a.click();
};
document.getElementById('copy').onclick = async () => {
  await navigator.clipboard.writeText(JSON.stringify(decisions(), null, 2));
  document.getElementById('copy').textContent = 'コピーしました';
  setTimeout(() => (document.getElementById('copy').textContent = 'コピー'), 1500);
};
render();
</script>
</body>
</html>
`;
};
