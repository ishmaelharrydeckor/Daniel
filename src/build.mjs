// Generates the static site into dist/ from content/*.json.
// Run: node src/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from './markdown.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const readJson = (name, fallback) => {
  const file = path.join(root, 'content', name);
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`content/${name} is not valid JSON: ${err.message}`);
  }
};

const site = readJson('site.json', {});
const projects = readJson('projects.json', []);
const career = readJson('career.json', []);
const achievements = readJson('achievements.json', []);
const testimonials = readJson('testimonials.json', []);
const otherWork = readJson('other-work.json', []);
const allPosts = readJson('posts.json', []);

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d = '') => {
  const m = String(d).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return esc(d);
  const mon = MONTHS[+m[2] - 1] || '';
  return m[3] ? `${mon} ${+m[3]}, ${m[1]}` : `${mon} ${m[1]}`;
};
const asset = (p, base) => (!p ? '' : /^(https?:|data:)/.test(p) ? p : base + p.replace(/^\//, ''));
const hash = (files) => {
  const h = crypto.createHash('md5');
  files.forEach((f) => h.update(fs.readFileSync(path.join(root, f))));
  return h.digest('hex').slice(0, 8);
};
const ver = hash(['styles.css', 'script.js']);

// ---------- roles ----------
const ROLE_COLORS = ['grey', 'blue', 'lime', 'purple'];
const NUM_STYLE = [
  ['#ced3d9', '#000'],
  ['#96b7c8', '#fff'],
  ['#daea56', '#000'],
  ['#885fa8', '#fff'],
];
// hero chip position -> role index (chips sit around the portrait)
const HERO_CHIPS = [
  { role: 0, color: 'grey', tx: -20, ty: -20 },
  { role: 1, color: 'blue', tx: 30, ty: -30 },
  { role: 3, color: 'purple', tx: 20, ty: 20 },
  { role: 2, color: 'lime', tx: -40, ty: 40 },
];
const roles = (site.roles || []).slice(0, 4);
const roleColor = (label) => {
  const i = roles.findIndex((r) => r.label === label);
  return ROLE_COLORS[i >= 0 ? i : 0];
};

const SOCIAL = {
  linkedin: { label: 'LinkedIn', color: '#0072b1', icon: 'assets/icon-linkedin.svg', small: 'assets/social-1.svg' },
  facebook: { label: 'Facebook', color: '#4267b2', icon: 'assets/icon-facebook.svg', small: 'assets/social-2.svg' },
  x: { label: 'X/Twitter', color: '#3b3b3b', icon: 'assets/icon-x.svg', small: 'assets/social-3.svg' },
};
const socials = (site.socials || []).filter((s) => SOCIAL[s.type] && s.url);

const posts = allPosts
  .filter((p) => p && p.title && !p.draft)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));
const postHref = (p, base) => (p.kind === 'link' ? p.url || '#' : `${base}blog/${p.slug}/`);
const postExternal = (p) => (p.kind === 'link' ? ' target="_blank" rel="noopener"' : '');

// ---------- shared chrome ----------
function header(base, hasBlog) {
  const nav = [['about', 'About'], ['projects', 'Projects'], ['career', 'Career'], ...(hasBlog ? [['blog', 'Blog']] : []), ['contact', 'Contact']]
    .map(([id, label]) => `      <a href="${base}#${id}" data-roll>${label}</a>`)
    .join('\n');
  return `<header class="header">
  <div class="header__inner">
    <a class="logo" href="${base || '#top'}" data-roll>${esc(site.logo || site.name)}</a>
    <button class="menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="site-nav"><span></span><span></span></button>
    <nav class="nav" id="site-nav" aria-label="Primary">
${nav}
    </nav>
  </div>
</header>`;
}

const arrowBtn = (href, label, extra = '') =>
  `<a class="btn btn--dark" href="${esc(href)}"${extra}><span>${esc(label)}</span><i class="btn__icon"><img src="ASSET:assets/arrow.svg" alt=""><img src="ASSET:assets/arrow.svg" alt=""></i></a>`;

function shell({ title, description, base, body, ogImage, noindex }) {
  const og = ogImage ? `\n  <meta property="og:image" content="${esc(ogImage)}">` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">${og}
  ${noindex ? '<meta name="robots" content="noindex">\n  ' : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
  <script>document.documentElement.classList.add("js")</script>
  <link rel="stylesheet" href="${base}styles.css?v=${ver}">
</head>
<body>
${body.replace(/ASSET:/g, base)}
<script src="${base}script.js?v=${ver}"></script>
</body>
</html>
`;
}

// ---------- home sections ----------
function hero(base) {
  const chips = HERO_CHIPS.map((c, i) => {
    const label = roles[c.role]?.label;
    if (!label) return '';
    return `        <div class="hero__chipbox hero__chipbox--${i + 1}"><span class="chip chip--${c.color} hero__chip" data-fx="chip" style="--tx:${c.tx}px;--ty:${c.ty}px">${esc(label)}</span></div>`;
  }).join('\n');
  return `  <section class="hero">
    <div class="wrap hero__grid">
      <div class="hero__text">
        <h1 class="hero__title" data-split="chars">${esc(site.firstName)}<br>${esc(site.lastName)}</h1>
        <p class="hero__lead" data-split="words">${esc(site.tagline)}</p>
        <div class="hero__actions" data-appear="0.3">
          <a class="btn btn--dark" href="#contact"><span>${esc(site.ctaLabel || "Let's connect")}</span><i class="btn__icon"><img src="ASSET:assets/arrow.svg" alt=""><img src="ASSET:assets/arrow.svg" alt=""></i></a>
          <div class="trust">
            <p>${esc(site.location)}</p>
          </div>
        </div>
      </div>

      <div class="hero__visual" data-appear="0">
        <img class="ring ring--a" src="ASSET:assets/hero-ring-1.png" alt="">
        <img class="ring ring--b" src="ASSET:assets/hero-ring-2.png" alt="">
        <img class="hero__portrait" src="${esc(asset(site.portrait, base))}" alt="Portrait of ${esc(site.name)}">
${chips}
      </div>
    </div>
  </section>`;
}

const POLAROID = [
  { base: -3, tx: -20, ty: -10, tr: 4 },
  { base: 3, tx: -25, ty: -20, tr: 3 },
  { base: -9, tx: -20, ty: -20, tr: -7 },
  { base: 7, tx: -30, ty: -10, tr: 4 },
];

function about(base) {
  const acc = roles.map((r, i) => `          <li class="acc${i === 0 ? ' is-open' : ''}">
            <button class="acc__head" aria-expanded="${i === 0}">
              <span class="acc__num" style="--bg:${NUM_STYLE[i][0]};--fg:${NUM_STYLE[i][1]}">${i + 1}</span>
              <span class="acc__title">${esc(r.label)}</span>
              <span class="acc__icon"><img src="ASSET:assets/line-h.svg" alt=""><img src="ASSET:assets/line-v.svg" alt=""></span>
            </button>
            <div class="acc__body"><p>${esc(r.description)}</p></div>
          </li>`).join('\n');
  const polas = (site.polaroids || []).slice(0, 4).map((src, i) => {
    const p = POLAROID[i];
    return `          <img src="${esc(asset(src, base))}" alt="" data-fx="polaroid" style="--base:${p.base}deg;--tx:${p.tx}px;--ty:${p.ty}px;--tr:${p.tr}deg">`;
  }).join('\n');
  return `  <section class="about" id="about">
    <div class="wrap about__grid">
      <div class="about__left">
        <span class="pill pill--white">About Me</span>
        <h2 class="h2" data-split="words">${esc(site.aboutHeading)}</h2>
        <p class="lead lead--sm" data-split="words">${esc(site.aboutIntro)}</p>

        <figure class="mission">
          <img src="ASSET:assets/quote.png" alt="" width="42" height="35">
          <blockquote data-split="words">${esc(site.mission)}</blockquote>
        </figure>
      </div>

      <div class="about__right">
        <ul class="accordion">
${acc}
        </ul>

        <div class="polaroids" aria-hidden="true">
${polas}
        </div>
      </div>
    </div>
  </section>`;
}

function projectsSection(base) {
  const cards = projects.map((p, i) => {
    const tags = (p.tags || []).slice(0, 2)
      .map((t) => `<span class="chip chip--${roleColor(t)} chip--sm">${esc(t)}</span>`).join('');
    const img = esc(asset(p.image, base));
    const photo = img
      ? `<span class="project__photo"><img class="project__img" data-zoom src="${img}" alt="${esc(p.title)}"><span class="project__shade"></span></span>`
      : '';
    const inner = `<article class="project project--${i % 2 === 0 ? 'light' : 'grey'}">
        <div class="project__info">
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.subtitle)}<br>${esc(p.years)}</p>
        </div>
        <div class="project__media" data-fx="media">
          <img class="project__ring" src="ASSET:assets/proj-ring.png" alt="">
          ${photo}
        </div>
        <div class="project__tags">${tags}</div>
      </article>`;
    const linked = p.link ? `<a class="project__link" href="${esc(p.link)}" target="_blank" rel="noopener">${inner}</a>` : inner;
    return `      <div class="project-sticky" style="--z:${i + 1}">\n      ${linked}\n      </div>`;
  }).join('\n');

  const tiles = otherWork.filter((t) => t.image)
    .map((t) => `<div class="tile" data-fx="media"><img class="tile__img" src="${esc(asset(t.image, base))}" alt=""></div>`).join('');
  const strip = tiles ? `
    <div class="marquee marquee--photos" aria-hidden="true" data-gap="30" data-hover="1">
      <div class="marquee__track">
        ${tiles}
      </div>
    </div>` : '';

  return `  <section class="projects" id="projects">
    <div class="wrap">
      <div class="section-head section-head--center">
        <span class="pill pill--grey">Projects</span>
        <h2 class="h2 on-dark" data-split="words">What I’m Proud of</h2>
        <p class="lead lead--sm on-dark-muted" data-split="words">${esc(site.projectsIntro)}</p>
      </div>

      <div class="project-stack">
${cards}
      </div>
${tiles ? `
      <h3 class="other-projects" data-split="words">${esc(site.otherWorkHeading || 'Other projects')}</h3>` : ''}
    </div>${strip}
  </section>`;
}

function findMe() {
  if (!socials.length) return '';
  const items = socials.map((s) => {
    const m = SOCIAL[s.type];
    return `        <li><a href="${esc(s.url)}" target="_blank" rel="noopener"><span class="social-list__icon" style="background:${m.color}"><img src="ASSET:${m.icon}" alt=""></span><span class="social-list__name">${m.label}</span><img class="social-list__arrow" src="ASSET:assets/arrow.svg" alt=""></a></li>`;
  }).join('\n');
  return `  <section class="findme">
    <div class="wrap findme__grid">
      <div>
        <span class="pill pill--grey-light">Social Networks</span>
        <h2 class="h2" data-split="words">Where to Find Me</h2>
      </div>
      <ul class="social-list">
${items}
      </ul>
    </div>
  </section>`;
}

function careerSection(base) {
  const rows = career.map((c, i) => {
    const badge = c.logo
      ? `<img src="${esc(asset(c.logo, base))}" alt="">`
      : `<b>${esc(c.badge || (c.company || '').slice(0, 3).toUpperCase())}</b>`;
    const years = `${esc(c.start)}   →   ${esc(c.end || 'Now')}`;
    return `        <div class="tl tl--${i % 2 === 0 ? 'left' : 'right'}"><div class="tl__card"><span class="tl__logo"><img class="tl__ring" src="ASSET:assets/ring-dotted.png" alt=""><span class="tl__badge">${badge}</span></span><div class="tl__text"><h4>${esc(c.role)}</h4><p>${esc(c.company)}</p></div><span class="tl__date">${years}</span></div></div>`;
  }).join('\n');
  const cta = site.careerLink
    ? `
        <div class="career__cta">
          <span class="career__line"></span>
          ${arrowBtn(site.careerLink, site.careerLinkLabel || 'View Full Career', ' target="_blank" rel="noopener"')}
        </div>`
    : '';
  return `  <section class="career" id="career">
    <div class="wrap">
      <div class="section-head section-head--center">
        <span class="pill pill--white">Career</span>
        <h2 class="h2" data-split="words">My Way</h2>
        <p class="lead lead--sm center" data-split="words">${esc(site.careerIntro)}</p>
      </div>

      <div class="timeline">
${rows}${cta}
      </div>
    </div>
  </section>`;
}

function achievementsSection() {
  if (!achievements.length) return '';
  const items = achievements.map((a) => {
    const title = a.link ? `<a href="${esc(a.link)}" target="_blank" rel="noopener">${esc(a.title)}</a>` : esc(a.title);
    return `        <li><span class="ach__year">${esc(a.year)}</span><span class="ach__body"><b>${title}</b>${a.org ? `<small>${esc(a.org)}</small>` : ''}${a.description ? `<p>${esc(a.description)}</p>` : ''}</span></li>`;
  }).join('\n');
  return `  <section class="achievements" id="achievements">
    <div class="wrap findme__grid">
      <div>
        <span class="pill pill--grey-light">Achievements</span>
        <h2 class="h2" data-split="words">${esc(site.achievementsHeading || 'Milestones & Recognition')}</h2>
      </div>
      <ul class="ach-list">
${items}
      </ul>
    </div>
  </section>`;
}

function testimonialsSection(base) {
  if (!testimonials.length) return '';
  const cards = testimonials.map((t) => {
    const photo = t.photo
      ? `<span class="avatar"><img src="${esc(asset(t.photo, base))}" alt="" width="46" height="46"></span>`
      : `<span class="avatar avatar--initial">${esc((t.name || '?').charAt(0))}</span>`;
    return `        <figure class="tcard"><img src="ASSET:assets/stars.svg" alt="Five stars" width="75" height="14"><blockquote>${esc(t.quote)}</blockquote><figcaption>${photo}<span><b>${esc(t.name)}</b><small>${esc(t.role)}</small></span></figcaption></figure>`;
  }).join('\n');
  return `  <section class="testimonials">
    <div class="wrap section-head section-head--center">
      <span class="pill pill--grey-light">Testimonials</span>
      <h2 class="h2" data-split="words">People Say</h2>
    </div>
    <div class="marquee marquee--cards" data-gap="32" data-hover="0.5">
      <div class="marquee__track">
${cards}
      </div>
    </div>
  </section>`;
}

function postItem(p, base, split = true) {
  const sp = split ? ' data-split="words"' : '';
  const img = p.cover ? `<img src="${esc(asset(p.cover, base))}" alt="">` : '<span class="posts__noimg"></span>';
  return `        <li><a href="${esc(postHref(p, base))}"${postExternal(p)}>${img}<span><time${sp}>${fmtDate(p.date)}</time><b${sp}>${esc(p.title)}</b></span></a></li>`;
}

function blogSection(base) {
  if (!posts.length) return '';
  const latest = posts.slice(0, 4);
  const more = posts.length > 4
    ? `\n      <div class="blog__more">${arrowBtn(`${base}blog/`, 'All posts')}</div>`
    : '';
  return `  <section class="blog" id="blog">
    <div class="wrap blog__grid">
      <div class="blog__left">
        <span class="pill pill--white">Blog</span>
        <h2 class="h2" data-split="words">What I Share</h2>
        <p class="lead lead--sm" data-split="words">${esc(site.blogIntro)}</p>
        <figure class="mission mission--blog">
          <img src="ASSET:assets/quote.png" alt="" width="42" height="35">
          <blockquote data-split="words">${esc(site.blogQuote)}</blockquote>
        </figure>
      </div>
      <div>
        <ul class="posts" data-zoom-group>
${latest.map((p) => postItem(p, base)).join('\n')}
        </ul>${more}
      </div>
    </div>
  </section>`;
}

function footer(base, full = true) {
  const chips = roles.map((r, i) => `          <span class="chip chip--${ROLE_COLORS[i]}">${esc(r.label)}</span>`).join('\n');
  const first = socials[0];
  const mail = site.email
    ? `<a class="footer__mail" href="mailto:${esc(site.email)}">${esc(site.email)}</a>`
    : first ? `<a class="footer__mail" href="${esc(first.url)}" target="_blank" rel="noopener">Connect on ${SOCIAL[first.type].label}</a>` : '';
  const icons = socials.map((s) => `        <a href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="${SOCIAL[s.type].label}"><img src="ASSET:${SOCIAL[s.type].small}" alt="" width="28" height="28"></a>`).join('\n');
  const note = first ? ` data-fallback="${esc(first.url)}"` : '';
  if (!full) {
    return `<footer class="footer footer--slim">
  <div class="wrap footer__bottom footer__bottom--slim">
    <p>© <span id="year">${new Date().getFullYear()}</span> ${esc(site.name)}. All rights reserved.</p>
    ${first ? `<a href="${esc(first.url)}" target="_blank" rel="noopener">${SOCIAL[first.type].label}</a>` : ''}
  </div>
</footer>`;
  }
  return `<footer class="footer" id="contact">
  <div class="wrap footer__grid">
    <div class="footer__left">
      <span class="pill pill--grey">Contact Me</span>
      <h2 class="h2 on-dark" data-split="words">Ways to Connect</h2>
      <div class="footer__me">
        <span class="avatar-ring"><img class="avatar-ring__ring" src="ASSET:assets/ring-dotted.png" alt=""><img class="avatar-ring__img" src="${esc(asset(site.portrait, base))}" alt="${esc(site.firstName)}" width="72" height="72"></span>
        <p data-split="words">${esc(site.firstName)} ${esc(site.lastName)}</p>
        <div class="footer__chips">
${chips}
        </div>
      </div>
    </div>

    <div class="footer__right">
      ${mail}
      <div class="footer__social">
${icons}
      </div>

      <form class="form" id="contact-form" data-email="${esc(site.email || '')}"${note}>
        <h3 data-split="words">Message Me:</h3>
        <label><span class="sr">Name</span><input name="name" type="text" placeholder="Your Name *" required></label>
        <label><span class="sr">Email</span><input name="email" type="email" placeholder="Your Email *" required></label>
        <label><span class="sr">Phone</span><input name="phone" type="tel" placeholder="Your Phone"></label>
        <label><span class="sr">Message</span><textarea name="message" rows="3" placeholder="Your message *" required></textarea></label>
        <div class="form__actions">
          <button class="btn btn--light" type="submit"><span>Send message</span><i class="btn__icon btn__icon--dark"><img src="ASSET:assets/arrow-dark.svg" alt=""><img src="ASSET:assets/arrow-dark.svg" alt=""></i></button>
          <p>Your information will remain private and will not be shared without your permission.</p>
        </div>
        <p class="form__status" role="status"></p>
      </form>
    </div>
  </div>
  <div class="wrap footer__bottom">
    <p>© <span id="year">${new Date().getFullYear()}</span> ${esc(site.name)}. All rights reserved.</p>
  </div>
</footer>`;
}

// ---------- pages ----------
function homePage() {
  const base = '';
  const body = `${header(base, posts.length > 0)}

<main id="top">

${[hero(base), about(base), projectsSection(base), findMe(), careerSection(base), achievementsSection(), testimonialsSection(base), blogSection(base)]
    .filter(Boolean).join('\n\n')}

</main>

${footer(base)}`;
  return shell({
    title: site.seo?.title || site.name,
    description: site.seo?.description || site.tagline,
    base,
    body,
    ogImage: site.seo?.image ? asset(site.seo.image, base) : '',
  });
}

function postPage(p) {
  const base = '../../';
  const html = renderMarkdown(p.body, { base });
  const cover = p.cover ? `<img class="post__cover" src="${esc(asset(p.cover, base))}" alt="">` : '';
  const body = `${header(base, true)}

<main id="top" class="post-page">
  <article class="wrap post">
    <a class="post__back" href="${base}blog/">← All posts</a>
    <time class="post__date">${fmtDate(p.date)}</time>
    <h1 class="post__title">${esc(p.title)}</h1>
    ${p.summary ? `<p class="post__summary">${esc(p.summary)}</p>` : ''}
    ${cover}
    <div class="prose">
${html}
    </div>
  </article>
</main>

${footer(base, false)}`;
  return shell({
    title: `${p.title} | ${site.name}`,
    description: p.summary || site.seo?.description || '',
    base,
    body,
    ogImage: p.cover ? asset(p.cover, base) : '',
  });
}

function blogIndexPage() {
  const base = '../';
  const body = `${header(base, true)}

<main id="top" class="post-page">
  <div class="wrap post post--index">
    <a class="post__back" href="${base}">← Home</a>
    <h1 class="post__title">Blog</h1>
    <ul class="posts posts--page">
${posts.map((p) => postItem(p, base, false)).join('\n')}
    </ul>
  </div>
</main>

${footer(base, false)}`;
  return shell({ title: `Blog | ${site.name}`, description: site.blogIntro || '', base, body });
}

// ---------- write output ----------
function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), homePage());

const slugs = new Set();
for (const p of posts.filter((x) => x.kind !== 'link')) {
  if (!p.slug || slugs.has(p.slug)) throw new Error(`Post "${p.title}" needs a unique slug`);
  slugs.add(p.slug);
  const dir = path.join(dist, 'blog', p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), postPage(p));
}
if (posts.length) {
  fs.mkdirSync(path.join(dist, 'blog'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'blog', 'index.html'), blogIndexPage());
}

for (const f of ['styles.css', 'script.js']) fs.copyFileSync(path.join(root, f), path.join(dist, f));
copyDir(path.join(root, 'assets'), path.join(dist, 'assets'));
copyDir(path.join(root, 'uploads'), path.join(dist, 'uploads'));
copyDir(path.join(root, 'admin'), path.join(dist, 'admin'));
copyDir(path.join(root, 'content'), path.join(dist, 'content')); // only used by the admin's local demo mode
fs.copyFileSync(path.join(root, 'src', 'markdown.mjs'), path.join(dist, 'admin', 'markdown.mjs'));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
fs.writeFileSync(path.join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /admin/\n');

console.log(`Built ${1 + slugs.size + (posts.length ? 1 : 0)} pages into dist/ (assets v${ver})`);
