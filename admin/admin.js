// Site admin: edit content/*.json and upload photos by committing to the repository.
// A GitHub Action rebuilds the site after each save (about a minute).
import { createGitHub } from './github.js';
import { renderMarkdown } from './markdown.mjs';

// ---------- config ----------
const params = new URLSearchParams(location.search);
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const DEMO = isLocal && params.has('demo');

function detectRepo() {
  const m = location.hostname.match(/^(.+)\.github\.io$/);
  const seg = location.pathname.split('/').filter(Boolean)[0];
  if (m && seg && seg !== 'admin') return `${m[1]}/${seg}`;
  return localStorage.getItem('adminRepo') || 'ishmaelharrydeckor/Daniel';
}
const REPO = detectRepo();
const BRANCH = localStorage.getItem('adminBranch') || 'main';
const TOKEN_KEY = 'siteAdminKey';

// ---------- tiny DOM helper ----------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const app = document.getElementById('app');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- state ----------
let gh = null;
const store = {}; // name -> { data, sha }
const previews = new Map(); // uploaded path -> blob url (until the site rebuilds)
let tab = 'profile';
let editing = null; // { index, draft } while a form is open

// ---------- demo adapter (local testing only: ?demo on localhost) ----------
function createDemo() {
  const mem = {};
  return {
    repo: 'demo', branch: 'demo',
    async check() { return {}; },
    async readJson(file, fallback) {
      if (mem[file]) return { data: JSON.parse(mem[file]), sha: 'demo' };
      try { return { data: await (await fetch(`../${file}`)).json(), sha: 'demo' }; } catch { return { data: fallback, sha: null }; }
    },
    async writeJson(file, data) { mem[file] = JSON.stringify(data); window.__demoWrites = (window.__demoWrites || []).concat([[file, data]]); return 'demo'; },
    async uploadFile(file) { window.__demoUploads = (window.__demoUploads || []).concat([file]); return 'demo'; },
    async latestRun() { return { created_at: new Date().toISOString(), status: 'completed', conclusion: 'success' }; },
  };
}

// ---------- data ----------
const FILES = { site: {}, projects: [], career: [], achievements: [], posts: [], testimonials: [], 'other-work': [] };
async function loadAll() {
  await Promise.all(Object.entries(FILES).map(async ([name, fallback]) => {
    store[name] = await gh.readJson(`content/${name}.json`, fallback);
  }));
}
async function save(name, message) {
  const entry = store[name];
  try {
    entry.sha = await gh.writeJson(`content/${name}.json`, entry.data, entry.sha, message);
  } catch (err) {
    if (err.status === 409 || err.status === 422) {
      throw new Error('The site was changed somewhere else since you opened this page. Reload the page and try again.');
    }
    throw err;
  }
  toast('Saved. Publishing to the live site…');
  watchDeploy();
}

// ---------- toast + deploy status ----------
let toastTimer;
function toast(msg, isErr = false) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: `toast${isErr ? ' err' : ''}`, role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), isErr ? 7000 : 3500);
}
function setDeploy(text, kind = '') {
  const el = document.getElementById('deploy');
  if (!el) return;
  el.textContent = text;
  el.className = `deploy ${kind}`;
}
let watchId = 0;
async function watchDeploy() {
  const id = ++watchId;
  const since = Date.now() - 15000;
  setDeploy('Publishing…');
  for (let i = 0; i < 40 && id === watchId; i++) {
    await sleep(i === 0 ? 4000 : 6000);
    try {
      const run = await gh.latestRun();
      if (!run || new Date(run.created_at).getTime() < since) continue;
      if (run.status !== 'completed') { setDeploy('Publishing…'); continue; }
      if (run.conclusion === 'success') setDeploy('Live ✓', 'ok');
      else setDeploy('Publishing failed. Tell the site manager.', 'bad');
      return;
    } catch {
      setDeploy('Saved. Live in about a minute.', 'ok');
      return;
    }
  }
  if (id === watchId) setDeploy('Saved. Live in a few minutes.', 'ok');
}

// ---------- images ----------
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'image';
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = reject;
  r.readAsDataURL(blob);
});
async function prepareImage(file) {
  if (file.type === 'image/svg+xml') return { blob: file, ext: 'svg' };
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const png = file.type === 'image/png';
  const blob = await new Promise((r) => canvas.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.86));
  return { blob, ext: png ? 'png' : 'jpg' };
}
async function uploadImage(file) {
  const { blob, ext } = await prepareImage(file);
  const base = slugify(file.name.replace(/\.[^.]+$/, ''));
  const path = `uploads/${base}-${Date.now().toString(36)}.${ext}`;
  await gh.uploadFile(path, await blobToBase64(blob), `Add photo ${path}`);
  previews.set(path, URL.createObjectURL(blob));
  return path;
}
const previewUrl = (p) => (!p ? '' : previews.get(p) || (/^(https?:|data:)/.test(p) ? p : `../${p}`));

// ---------- field widgets ----------
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function set(o, path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((a, k) => (a[k] ??= {}), o);
  target[last] = v;
}

function imageWidget(value, onChange, hint) {
  const prev = h('div', { class: 'imgfield__prev' });
  const status = h('span', { class: 'hint' });
  const paint = (v) => { prev.style.backgroundImage = v ? `url("${previewUrl(v)}")` : ''; };
  paint(value);
  const input = h('input', {
    type: 'file', accept: 'image/*', style: 'display:none',
    onchange: async () => {
      const f = input.files[0];
      if (!f) return;
      status.textContent = 'Uploading…';
      try {
        const path = await uploadImage(f);
        onChange(path);
        paint(path);
        status.textContent = 'Photo added. Remember to save.';
      } catch (err) {
        status.textContent = '';
        toast(`Upload failed: ${err.message}`, true);
      }
      input.value = '';
    },
  });
  return h('div', { class: 'imgfield' }, prev,
    h('div', {},
      h('div', { class: 'imgfield__btns' },
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => input.click() }, value ? 'Change photo' : 'Choose photo'),
        value && h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => { onChange(''); paint(''); status.textContent = 'Removed. Remember to save.'; } }, 'Remove'),
        input),
      hint && h('div', { class: 'note' }, hint),
      status));
}

function field(def, obj) {
  const val = get(obj, def.k);
  const wrap = h('div', { class: 'field' });
  const label = h('label', {}, def.label, def.req ? ' *' : '');
  let control;
  switch (def.t) {
    case 'textarea':
      control = h('textarea', { value: val ?? '', rows: def.rows || 4, oninput: (e) => set(obj, def.k, e.target.value) });
      break;
    case 'select':
      control = h('select', { onchange: (e) => set(obj, def.k, e.target.value) },
        def.options.map(([v, l]) => h('option', { value: v, selected: (val ?? def.options[0][0]) === v }, l)));
      if (val == null) set(obj, def.k, def.options[0][0]);
      break;
    case 'image':
      wrap.append(h('div', { class: 'lbl' }, def.label, def.req ? ' *' : ''), imageWidget(val, (v) => set(obj, def.k, v), def.hint));
      if (def.note) wrap.append(h('div', { class: 'note' }, def.note));
      return wrap;
    case 'tags': {
      const chosen = new Set(val || []);
      const roles = (store.site.data.roles || []).map((r) => r.label);
      control = h('div', { class: 'checks' }, roles.map((r) => {
        const box = h('input', {
          type: 'checkbox', checked: chosen.has(r),
          onchange: () => {
            if (box.checked && chosen.size >= 2) { box.checked = false; toast('Pick up to two roles.', true); return; }
            box.checked ? chosen.add(r) : chosen.delete(r);
            set(obj, def.k, roles.filter((x) => chosen.has(x)));
          },
        });
        return h('label', { class: 'check' }, box, r);
      }));
      break;
    }
    case 'checkbox':
      control = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!val, onchange: (e) => set(obj, def.k, e.target.checked) }), def.checkLabel);
      wrap.append(h('div', { class: 'lbl' }, def.label), control);
      if (def.note) wrap.append(h('div', { class: 'note' }, def.note));
      return wrap;
    default:
      control = h('input', { type: def.t === 'url' ? 'url' : 'text', value: val ?? '', placeholder: def.ph || '', oninput: (e) => set(obj, def.k, e.target.value) });
  }
  wrap.append(label, control);
  if (def.note) wrap.append(h('div', { class: 'note' }, def.note));
  return wrap;
}
const fields = (defs, obj) => defs.map((d) => field(d, obj));

function validate(defs, obj) {
  for (const d of defs) if (d.req && !String(get(obj, d.k) ?? '').trim()) return `Please fill in “${d.label}”.`;
  return '';
}

// ---------- collections ----------
const COLLECTIONS = {
  projects: {
    name: 'projects', label: 'Projects', one: 'project',
    hint: 'The big cards in “What I’m Proud of”. They stack as visitors scroll.',
    title: (i) => i.title, sub: (i) => [i.subtitle, i.years].filter(Boolean).join(' · '), thumb: (i) => i.image,
    blank: () => ({ title: '', subtitle: '', years: '', tags: [], image: '', link: '' }),
    fields: [
      { k: 'title', t: 'text', label: 'Project name', req: 1 },
      { k: 'subtitle', t: 'text', label: 'What kind of project', ph: 'e.g. Downstream Petroleum' },
      { k: 'years', t: 'text', label: 'Years', ph: 'e.g. 2024 – Now' },
      { k: 'tags', t: 'tags', label: 'Your role (pick up to two)' },
      { k: 'image', t: 'image', label: 'Photo', hint: 'A square-ish photo works best.' },
      { k: 'link', t: 'url', label: 'Link (optional)', ph: 'https://…', note: 'If set, the whole card opens this link.' },
    ],
  },
  career: {
    name: 'career', label: 'Career', one: 'role',
    hint: 'Newest first. They alternate left and right on the timeline.',
    title: (i) => i.role, sub: (i) => `${i.company} · ${i.start} → ${i.end || 'Now'}`,
    blank: () => ({ role: '', company: '', start: '', end: '', badge: '', logo: '' }),
    fields: [
      { k: 'role', t: 'text', label: 'Job title', req: 1 },
      { k: 'company', t: 'text', label: 'Organisation', req: 1 },
      { k: 'start', t: 'text', label: 'Start year', req: 1, ph: '2024' },
      { k: 'end', t: 'text', label: 'End year', ph: 'Leave empty if this is your current role' },
      { k: 'badge', t: 'text', label: 'Short label in the circle', ph: 'e.g. SPE', note: 'Used when there is no logo.' },
      { k: 'logo', t: 'image', label: 'Logo (optional)', hint: 'A transparent PNG or SVG looks best.' },
    ],
  },
  achievements: {
    name: 'achievements', label: 'Achievements', one: 'achievement',
    hint: 'Awards, certificates, milestones. The section hides itself when this list is empty.',
    title: (i) => i.title, sub: (i) => [i.year, i.org].filter(Boolean).join(' · '),
    blank: () => ({ year: '', title: '', org: '', description: '', link: '' }),
    fields: [
      { k: 'year', t: 'text', label: 'Year', req: 1, ph: '2026' },
      { k: 'title', t: 'text', label: 'Title', req: 1 },
      { k: 'org', t: 'text', label: 'Awarded by / organisation' },
      { k: 'description', t: 'textarea', label: 'Short description (optional)', rows: 3 },
      { k: 'link', t: 'url', label: 'Link (optional)', ph: 'https://…' },
    ],
  },
  testimonials: {
    name: 'testimonials', label: 'Testimonials', one: 'testimonial',
    hint: 'Real quotes from real people, with their permission. The section hides itself when empty.',
    title: (i) => i.name, sub: (i) => (i.quote || '').slice(0, 80), thumb: (i) => i.photo,
    blank: () => ({ quote: '', name: '', role: '', photo: '' }),
    fields: [
      { k: 'quote', t: 'textarea', label: 'What they said', req: 1, rows: 4 },
      { k: 'name', t: 'text', label: 'Name', req: 1 },
      { k: 'role', t: 'text', label: 'Job title and organisation', ph: 'e.g. CEO, Acme Energy' },
      { k: 'photo', t: 'image', label: 'Photo (optional)' },
    ],
  },
  'other-work': {
    name: 'other-work', label: 'Photo strip', one: 'photo',
    hint: 'The moving strip of photos under the projects. Add events, conferences or site visits.',
    title: (i) => (i.image || '').split('/').pop(), sub: () => '', thumb: (i) => i.image,
    blank: () => ({ image: '' }),
    fields: [{ k: 'image', t: 'image', label: 'Photo', req: 1, hint: 'Landscape photos look best.' }],
  },
  posts: {
    name: 'posts', label: 'Blog', one: 'post',
    hint: 'Write articles here, or add a link to something you posted elsewhere (for example LinkedIn). The newest four show on the home page.',
    title: (i) => i.title, sub: (i) => [i.date, i.kind === 'link' ? 'link' : 'article'].filter(Boolean).join(' · '), thumb: (i) => i.cover,
    badge: (i) => (i.draft ? 'draft' : ''),
    blank: () => ({ slug: '', title: '', date: new Date().toISOString().slice(0, 10), summary: '', cover: '', kind: 'article', url: '', body: '', draft: false }),
    custom: true,
  },
};

function listView(c) {
  const items = store[c.name].data;
  const move = async (i, d) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    await commit(c, `Reorder ${c.label.toLowerCase()}`);
  };
  const del = async (i) => {
    if (!confirm(`Delete “${c.title(items[i]) || 'this item'}”? This can’t be undone from here.`)) return;
    items.splice(i, 1);
    await commit(c, `Delete ${c.one}`);
  };
  return h('div', {},
    h('div', { class: 'head-row' },
      h('div', {}, h('h1', {}, c.label), h('p', { class: 'hint' }, c.hint)),
      h('button', { class: 'btn', onclick: () => { editing = { index: -1, draft: c.blank() }; render(); } }, `Add ${c.one}`)),
    h('div', { class: 'card' }, items.length
      ? items.map((it, i) => h('div', { class: 'row' },
        c.thumb && h('img', { class: 'row__thumb', src: previewUrl(c.thumb(it)) || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', alt: '' }),
        h('div', { class: 'row__text' },
          h('div', { class: 'row__title' }, c.title(it) || '(untitled)', c.badge && c.badge(it) ? h('span', { class: 'badge' }, c.badge(it)) : null),
          h('div', { class: 'row__sub' }, c.sub(it))),
        h('div', { class: 'row__actions' },
          h('button', { class: 'icon-btn', title: 'Move up', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
          h('button', { class: 'icon-btn', title: 'Move down', disabled: i === items.length - 1, onclick: () => move(i, 1) }, '↓'),
          h('button', { class: 'btn btn--ghost btn--sm', onclick: () => { editing = { index: i, draft: structuredClone(it) }; render(); } }, 'Edit'),
          h('button', { class: 'btn btn--danger btn--sm', onclick: () => del(i) }, 'Delete'))))
      : h('p', { class: 'empty' }, `Nothing here yet. Click “Add ${c.one}” to start.`)));
}

async function commit(c, message) {
  try {
    await save(c.name, message);
    editing = null;
  } catch (err) {
    toast(err.message, true);
  }
  render();
}

function formView(c) {
  const { index, draft } = editing;
  const body = c.custom ? postFields(draft, index) : fields(c.fields, draft);
  const onSave = async () => {
    const err = c.custom ? validatePost(draft, index) : validate(c.fields, draft);
    if (err) { toast(err, true); return; }
    if (c.custom && !draft.slug) draft.slug = uniqueSlug(draft.title);
    const items = store[c.name].data;
    if (index < 0) items.unshift(draft); else items[index] = draft;
    if (c.name === 'posts') items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    await commit(c, `${index < 0 ? 'Add' : 'Update'} ${c.one}: ${c.title(draft) || ''}`.trim());
  };
  return h('div', {},
    h('div', { class: 'head-row' }, h('h1', {}, `${index < 0 ? 'Add' : 'Edit'} ${c.one}`),
      h('button', { class: 'btn btn--ghost', onclick: () => { editing = null; render(); } }, '← Back to list')),
    h('div', { class: 'card' }, body),
    h('div', { class: 'savebar' },
      h('button', { class: 'btn btn--ghost', onclick: () => { editing = null; render(); } }, 'Cancel'),
      h('button', { class: 'btn', onclick: onSave }, index < 0 ? `Publish ${c.one}` : 'Save and publish')));
}

// ---------- blog post editor ----------
function uniqueSlug(title) {
  const taken = new Set(store.posts.data.map((p) => p.slug));
  const base = slugify(title);
  let s = base, n = 2;
  while (taken.has(s)) s = `${base}-${n++}`;
  return s;
}
function validatePost(p) {
  if (!p.title.trim()) return 'Please give the post a title.';
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(p.date)) return 'Date must look like 2026-10-24 (or 2026-10).';
  if (p.kind === 'link' && !/^https?:\/\//.test(p.url)) return 'Please paste the full link, starting with https://';
  if (p.kind === 'article' && !p.body.trim()) return 'The post is empty. Write something first.';
  return '';
}
function postFields(p, index) {
  const area = h('textarea', { class: 'big', value: p.body, oninput: (e) => { p.body = e.target.value; } });
  const preview = h('div', { class: 'md__preview', style: 'display:none' });
  let previewing = false;
  const wrapSel = (before, after = before, ph = 'text') => {
    const { selectionStart: s, selectionEnd: e } = area;
    const sel = area.value.slice(s, e) || ph;
    area.setRangeText(`${before}${sel}${after}`, s, e, 'end');
    p.body = area.value;
    area.focus();
  };
  const linePrefix = (prefix) => {
    const s = area.selectionStart;
    const start = area.value.lastIndexOf('\n', s - 1) + 1;
    area.setRangeText(prefix, start, start, 'end');
    p.body = area.value;
    area.focus();
  };
  const imgInput = h('input', {
    type: 'file', accept: 'image/*', style: 'display:none',
    onchange: async () => {
      const f = imgInput.files[0];
      if (!f) return;
      toast('Uploading photo…');
      try {
        const path = await uploadImage(f);
        const s = area.selectionStart;
        area.setRangeText(`\n\n![${f.name.replace(/\.[^.]+$/, '')}](${path})\n\n`, s, s, 'end');
        p.body = area.value;
        toast('Photo added to the post.');
      } catch (err) { toast(`Upload failed: ${err.message}`, true); }
      imgInput.value = '';
    },
  });
  const toggle = h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => {
    previewing = !previewing;
    preview.innerHTML = previewing ? renderMarkdown(p.body, { base: '../' }).replace(/src="\.\.\/(uploads\/[^"]+)"/g, (m, path) => `src="${previewUrl(path)}"`) : '';
    preview.style.display = previewing ? '' : 'none';
    area.style.display = previewing ? 'none' : '';
    toggle.textContent = previewing ? 'Back to writing' : 'Preview';
  } }, 'Preview');

  const articleOnly = h('div', {},
    h('div', { class: 'field' },
      h('label', {}, 'Post'),
      h('div', { class: 'md__tools' },
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => wrapSel('**') }, 'Bold'),
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => wrapSel('*') }, 'Italic'),
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => linePrefix('## ') }, 'Heading'),
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => linePrefix('- ') }, 'List'),
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => linePrefix('> ') }, 'Quote'),
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => {
          const url = prompt('Paste the link (https://…)');
          if (url) wrapSel('[', `](${url})`, 'link text');
        } }, 'Link'),
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => imgInput.click() }, 'Add photo'),
        toggle, imgInput),
      area, preview,
      h('div', { class: 'note' }, 'Tip: leave a blank line between paragraphs. Use the Preview button to see how it will look.')));
  const linkOnly = h('div', {}, ...fields([{ k: 'url', t: 'url', label: 'Link to the post', ph: 'https://…', note: 'Visitors are sent here when they click the post.' }], p));

  const kindBlock = () => {
    articleOnly.style.display = p.kind === 'article' ? '' : 'none';
    linkOnly.style.display = p.kind === 'link' ? '' : 'none';
  };
  const kind = field({ k: 'kind', t: 'select', label: 'Type of post', options: [['article', 'An article written here'], ['link', 'A link to something posted elsewhere']] }, p);
  kind.querySelector('select').addEventListener('change', kindBlock);
  kindBlock();

  const out = [
    field({ k: 'title', t: 'text', label: 'Title', req: 1 }, p),
    h('div', { class: 'grid2' },
      field({ k: 'date', t: 'text', label: 'Date', ph: '2026-10-24', note: 'Year-month-day. Month only (2026-10) also works.' }, p),
      kind),
    field({ k: 'cover', t: 'image', label: 'Cover photo', hint: 'Shown next to the post on the home page.' }, p),
    field({ k: 'summary', t: 'textarea', label: 'One-line summary (optional)', rows: 2, note: 'Shown at the top of the article and in link previews.' }, p),
    articleOnly, linkOnly,
    field({ k: 'draft', t: 'checkbox', label: 'Visibility', checkLabel: 'Draft: keep hidden from the site for now' }, p),
  ];
  if (index >= 0 && p.kind === 'article' && p.slug) {
    out.push(h('p', { class: 'hint' }, 'Public address: ', h('a', { href: `../blog/${p.slug}/`, target: '_blank', rel: 'noopener' }, `blog/${p.slug}/`)));
  }
  return out;
}

// ---------- profile ----------
const PROFILE_GROUPS = [
  { title: 'Top of the page', hint: 'The big name, intro line and photo.', fields: [
    { k: 'firstName', t: 'text', label: 'First name (big heading)', req: 1 },
    { k: 'lastName', t: 'text', label: 'Last name (big heading)', req: 1 },
    { k: 'name', t: 'text', label: 'Full name', req: 1, note: 'Used in the footer, page title and photo captions.' },
    { k: 'logo', t: 'text', label: 'Short name in the top-left corner', ph: 'e.g. Daniel A.' },
    { k: 'tagline', t: 'textarea', label: 'Intro line under the name', rows: 3 },
    { k: 'location', t: 'text', label: 'Location line', ph: 'Based in Accra, Ghana' },
    { k: 'ctaLabel', t: 'text', label: 'Main button text', ph: "Let's connect" },
    { k: 'portrait', t: 'image', label: 'Main portrait', hint: 'A clear, well-lit headshot, at least 800px wide.' },
  ] },
  { title: 'About', hint: 'The “Hello, I’m …” section.', fields: [
    { k: 'aboutHeading', t: 'text', label: 'Heading' },
    { k: 'aboutIntro', t: 'textarea', label: 'Short intro', rows: 2 },
    { k: 'mission', t: 'textarea', label: 'Mission or motto', rows: 2 },
  ] },
  { title: 'Section introductions', hint: 'The short lines under each section heading.', fields: [
    { k: 'projectsIntro', t: 'textarea', label: 'Projects', rows: 2 },
    { k: 'otherWorkHeading', t: 'text', label: 'Title above the photo strip' },
    { k: 'careerIntro', t: 'textarea', label: 'Career', rows: 2 },
    { k: 'careerLink', t: 'url', label: 'Full-career link', ph: 'https://linkedin.com/in/…' },
    { k: 'careerLinkLabel', t: 'text', label: 'Full-career button text' },
    { k: 'achievementsHeading', t: 'text', label: 'Achievements heading' },
    { k: 'blogIntro', t: 'textarea', label: 'Blog', rows: 2 },
    { k: 'blogQuote', t: 'textarea', label: 'Quote beside the blog', rows: 2 },
  ] },
  { title: 'Contact', hint: 'Where messages go.', fields: [
    { k: 'email', t: 'text', label: 'Contact email', ph: 'you@example.com', note: 'The contact form opens the visitor’s email app addressed to this. Leave empty to hide the address and point people to your social link.' },
  ] },
  { title: 'Search engines and sharing', hint: 'What Google and WhatsApp show for the link.', fields: [
    { k: 'seo.title', t: 'text', label: 'Page title' },
    { k: 'seo.description', t: 'textarea', label: 'Description (about 150 characters)', rows: 3 },
    { k: 'seo.image', t: 'image', label: 'Sharing picture', hint: 'Wide picture, about 1200×630.' },
  ] },
];

function profileView() {
  const s = store.site.data;
  s.roles ??= [];
  while (s.roles.length < 4) s.roles.push({ label: '', description: '' });
  s.polaroids ??= [];
  s.socials ??= [];

  const roleCards = h('div', {}, s.roles.slice(0, 4).map((r, i) => h('div', { class: 'subcard' },
    h('strong', {}, `Role ${i + 1}`),
    h('div', { style: 'height:8px' }),
    ...fields([{ k: 'label', t: 'text', label: 'Role name (short)', ph: 'e.g. Analyst' }, { k: 'description', t: 'textarea', label: 'What you do in this role', rows: 3 }], r))));

  const polas = h('div', { class: 'imglist' }, [0, 1, 2, 3].map((i) => h('div', { class: 'subcard' },
    h('strong', {}, `Photo ${i + 1}`), h('div', { style: 'height:8px' }),
    imageWidget(s.polaroids[i], (v) => { s.polaroids[i] = v; }))));

  const socialsBox = h('div', {});
  const paintSocials = () => {
    socialsBox.replaceChildren(
      ...s.socials.map((soc, i) => h('div', { class: 'subcard' },
        h('div', { class: 'grid2' },
          field({ k: 'type', t: 'select', label: 'Network', options: [['linkedin', 'LinkedIn'], ['facebook', 'Facebook'], ['x', 'X / Twitter']] }, soc),
          field({ k: 'url', t: 'url', label: 'Profile link', ph: 'https://…' }, soc)),
        h('button', { type: 'button', class: 'btn btn--danger btn--sm', onclick: () => { s.socials.splice(i, 1); paintSocials(); } }, 'Remove'))),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => { s.socials.push({ type: 'linkedin', url: '' }); paintSocials(); } }, 'Add a network'));
  };
  paintSocials();

  const onSave = async () => {
    for (const g of PROFILE_GROUPS) { const e = validate(g.fields, s); if (e) { toast(e, true); return; } }
    s.polaroids = s.polaroids.filter(Boolean);
    s.socials = s.socials.filter((x) => x.url);
    try { await save('site', 'Update profile and text'); } catch (err) { toast(err.message, true); }
  };

  return h('div', {},
    h('div', { class: 'head-row' }, h('div', {}, h('h1', {}, 'Profile and text'), h('p', { class: 'hint' }, 'The words and main photos on the site. Changes go live after you press Save.'))),
    PROFILE_GROUPS.slice(0, 2).map((g) => h('div', { class: 'card' }, h('h2', {}, g.title), h('p', { class: 'hint' }, g.hint), ...fields(g.fields, s))),
    h('div', { class: 'card' }, h('h2', {}, 'Your four roles'), h('p', { class: 'hint' }, 'These appear as the chips around your photo, in the About list, and as tags on projects.'), roleCards),
    h('div', { class: 'card' }, h('h2', {}, 'About photos'), h('p', { class: 'hint' }, 'The four small tilted photos in the About section. Portrait photos look best.'), polas),
    PROFILE_GROUPS.slice(2).map((g) => h('div', { class: 'card' }, h('h2', {}, g.title), h('p', { class: 'hint' }, g.hint), ...fields(g.fields, s))),
    h('div', { class: 'card' }, h('h2', {}, 'Social links'), h('p', { class: 'hint' }, 'Shown in “Where to Find Me” and the footer.'), socialsBox),
    h('div', { class: 'savebar' }, h('button', { class: 'btn', onclick: onSave }, 'Save and publish')));
}

// ---------- shell ----------
const TABS = [['profile', 'Profile and text'], ['projects', 'Projects'], ['career', 'Career'], ['achievements', 'Achievements'], ['posts', 'Blog'], ['testimonials', 'Testimonials'], ['other-work', 'Photo strip']];

function render() {
  const main = h('div', { class: 'main' });
  if (tab === 'profile') main.append(profileView());
  else {
    const c = COLLECTIONS[tab];
    main.append(editing ? formView(c) : listView(c));
  }
  app.replaceChildren(
    h('div', { class: 'bar' },
      h('div', { class: 'bar__in' },
        h('span', { class: 'bar__title' }, 'Site admin'),
        h('span', { id: 'deploy', class: 'deploy' }, DEMO ? 'Demo mode' : 'Ready'),
        h('a', { class: 'btn btn--ghost btn--sm', href: '../', target: '_blank', rel: 'noopener' }, 'View site'),
        h('button', { class: 'btn btn--ghost btn--sm', onclick: signOut }, 'Sign out')),
      h('div', { class: 'tabs' }, TABS.map(([k, l]) => h('button', { class: `tab${tab === k ? ' is-on' : ''}`, onclick: () => { tab = k; editing = null; render(); window.scrollTo(0, 0); } }, l)))),
    main);
}

function signOut() {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
}

function loginView(message = '') {
  const input = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'Paste your access key here' });
  const btn = h('button', { class: 'btn', onclick: go }, 'Sign in');
  async function go() {
    const key = input.value.trim();
    if (!key) return;
    btn.disabled = true;
    btn.textContent = 'Checking…';
    try {
      const candidate = createGitHub({ repo: REPO, branch: BRANCH, token: key });
      await candidate.check();
      localStorage.setItem(TOKEN_KEY, key);
      await start();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Sign in';
      app.replaceChildren(loginView(err.status === 401 ? 'That key was not accepted. Check that you pasted all of it.' : err.message));
    }
  }
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  return h('div', { class: 'login' },
    h('h1', {}, 'Site admin'),
    h('p', { class: 'hint' }, 'Sign in to edit the website: blog posts, projects, career, achievements and text.'),
    h('div', { class: 'card' },
      h('div', { class: 'field' }, h('label', {}, 'Access key'), input, h('div', { class: 'note' }, 'The key is saved only in this browser. Use “Sign out” on shared computers.')),
      btn, message && h('p', { class: 'err-text' }, message)),
    h('div', { class: 'card' },
      h('h2', {}, 'Don’t have a key yet?'),
      h('p', { class: 'hint' }, `The person who manages the site creates one (it takes two minutes). It only gives access to this site (${REPO}):`),
      h('ol', {},
        h('li', {}, 'Open github.com/settings/personal-access-tokens/new while signed in.'),
        h('li', {}, 'Name it “Site admin”, choose an expiry, and under “Repository access” pick only this site.'),
        h('li', {}, 'Under Permissions → Repository permissions, set “Contents” to Read and write (and “Actions” to Read-only so this page can show publishing progress).'),
        h('li', {}, 'Generate the token, copy it, and paste it above.'))));
}

async function start() {
  const key = DEMO ? 'demo' : localStorage.getItem(TOKEN_KEY);
  if (!key) { app.replaceChildren(loginView()); return; }
  gh = DEMO ? createDemo() : createGitHub({ repo: REPO, branch: BRANCH, token: key });
  app.replaceChildren(h('p', { class: 'boot' }, 'Loading your content…'));
  try {
    if (!DEMO) await gh.check();
    await loadAll();
    render();
  } catch (err) {
    if (err.status === 401 || err.status === 403 || err.status === 404) {
      localStorage.removeItem(TOKEN_KEY);
      app.replaceChildren(loginView('This key no longer works or has no access to the site. Please sign in again.'));
    } else {
      app.replaceChildren(h('p', { class: 'boot' }, `Couldn’t load the content: ${err.message}`));
    }
  }
}

start();
