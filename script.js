// Behavior values come from the original site's own code. See BEHAVIOR-SPEC.md.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- spring -> CSS linear() easing (duration-based spring, as in Framer) ----------
const supportsLinear = CSS.supports('animation-timing-function', 'linear(0, 1)');
function spring(duration, bounce = 0) {
  if (!supportsLinear) return { ease: 'cubic-bezier(.2,.9,.3,1)', dur: duration };
  const w = (2 * Math.PI) / duration;
  const z = Math.max(0.01, 1 - bounce);
  const total = duration * 1.25;
  const n = 48;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (total * i) / n;
    let x;
    if (z >= 1) x = 1 - Math.exp(-w * t) * (1 + w * t);
    else {
      const wd = w * Math.sqrt(1 - z * z);
      x = 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
    }
    pts.push(+x.toFixed(4));
  }
  pts[n] = 1;
  return { ease: `linear(${pts.join(',')})`, dur: total };
}
const SPRING = {
  text: spring(0.7, 0),
  chip: spring(2.6, 0.1),
  polaroid: spring(1, 0.1),
  media: spring(1.8, 0.1),
  zoom: spring(1.7, 0.1),
};
function applySpring(el, s) {
  el.style.setProperty('--ease', s.ease);
  el.style.setProperty('--dur', `${s.dur}s`);
}

// ---------- observers ----------
function onView(els, { threshold = 0.5, once = true, enter, leave }) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const th = e.target.offsetHeight > innerHeight * 1.5 ? 0.1 : threshold;
        if (e.isIntersecting && e.intersectionRatio >= th - 0.001) {
          enter(e.target);
          if (once) io.unobserve(e.target);
        } else if (!e.isIntersecting && leave) leave(e.target);
      });
    },
    { threshold: [0, 0.1, threshold] }
  );
  els.forEach((el) => io.observe(el));
  return io;
}

// ---------- rolling letters (nav, logo) ----------
$$('[data-roll]').forEach((el) => {
  const text = el.textContent.trim();
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const wrap = document.createElement('span');
  wrap.className = 'rl';
  wrap.setAttribute('aria-hidden', 'true');
  [...text].forEach((ch) => {
    const c = document.createElement('span');
    c.className = 'rl__c';
    const g = ch === ' ' ? ' ' : ch;
    c.innerHTML = `<span class="rl__a">${g}</span><span class="rl__b">${g}</span>`;
    wrap.appendChild(c);
  });
  el.appendChild(wrap);
  let busy = false;
  el.addEventListener('mouseenter', () => {
    if (busy || reduceMotion) return;
    busy = true;
    const anims = [];
    $$('.rl__c', wrap).forEach((c, i) => {
      [...c.children].forEach((child) => {
        anims.push(
          child.animate(
            [{ transform: 'translateY(0%)' }, { transform: 'translateY(-100%)' }],
            { duration: 400, delay: i * 50, easing: 'cubic-bezier(.8,0,.4,1)', fill: 'both' }
          )
        );
      });
    });
    Promise.all(anims.map((a) => a.finished)).then(() => {
      anims.forEach((a) => a.cancel());
      busy = false;
    });
  });
});

// ---------- text appear: words (headings, leads, quotes), chars (hero title) ----------
function splitText(el, mode) {
  const label = el.textContent.replace(/\s+/g, ' ').trim();
  el.setAttribute('aria-label', label);
  const spans = [];
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        const parts = mode === 'chars' ? [...child.textContent] : child.textContent.split(/(\s+)/);
        parts.forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(' '));
            return;
          }
          const s = document.createElement('span');
          s.className = 'w';
          s.setAttribute('aria-hidden', 'true');
          s.textContent = part;
          spans.push(s);
          frag.appendChild(s);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') walk(child);
    });
  };
  walk(el);
  return spans;
}
const splits = new Map();
$$('[data-split]').forEach((el) => splits.set(el, splitText(el, el.dataset.split)));
function playText(el) {
  const words = splits.get(el) || [];
  words.forEach((w, i) => {
    if (reduceMotion) { w.style.opacity = 1; w.style.transform = 'none'; return; }
    w.animate(
      [{ opacity: 0.001, transform: 'translateY(2px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: SPRING.text.dur * 1000, delay: i * 40, easing: SPRING.text.ease, fill: 'both' }
    ).finished.then(() => { w.style.opacity = 1; w.style.transform = 'none'; });
  });
}
onView([...splits.keys()], { threshold: 0.5, enter: playText });

// ---------- load fades ----------
$$('[data-appear]').forEach((el) => {
  const delay = parseFloat(el.dataset.appear) || 0;
  el.animate([{ opacity: 0.001 }, { opacity: 1 }], {
    duration: 600, delay: delay * 1000, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both',
  }).finished.then(() => { el.style.opacity = 1; });
});

// ---------- enter / exit transforms ----------
$$('[data-fx="chip"]').forEach((el) => applySpring(el, SPRING.chip));
$$('[data-fx="polaroid"]').forEach((el) => applySpring(el, SPRING.polaroid));
$$('[data-fx="media"]').forEach((el) => applySpring(el, SPRING.media));
const fxIO = onView($$('[data-fx]'), {
  threshold: 0.5,
  once: false,
  enter: (el) => el.classList.add('is-in'),
  leave: (el) => el.classList.remove('is-in'),
});

// scale 1.1 -> 1 once (project photos, blog thumbs); avatars start at 1.05
$$('[data-zoom-group]').forEach((g) => $$('img', g).forEach((img) => img.setAttribute('data-zoom', '')));
$$('[data-zoom]').forEach((el) => applySpring(el, SPRING.zoom));
$$('.avatars img').forEach((el) => el.style.setProperty('transform', 'scale(1.05)'));
onView($$('[data-zoom]'), {
  threshold: 0.5,
  enter: (el) => { el.style.removeProperty('transform'); el.classList.add('is-in'); },
});

// ---------- hero parallax (speed 90, desktop only) ----------
const hero = $('.hero');
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const on = matchMedia('(min-width: 1200px)').matches && !reduceMotion;
    hero.style.transform = on ? `translateY(${Math.min(scrollY, innerHeight * 1.5) * 0.2}px)` : '';
  });
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
onScroll();

// ---------- stacked cards: scroll-linked, smoothed by a critically damped spring (1.2s) ----------
// progress 0 -> 1 while the NEXT block travels its own height past the threshold line (threshold x viewport height).
// measured on the original: career row 2 at top 450 -> 0, 419 -> .24, 350 -> .77, 320 -> 1 (row height 130).
// projects: threshold 1, previous card -> scale .85 | career: threshold .5, previous card -> scale .9, opacity .6
const OMEGA = (2 * Math.PI) / 1.2;
const stacks = [];
function addStack(card, next, { threshold, scale, opacity }) {
  stacks.push({ card, next, threshold, scale, opacity, x: 0, v: 0, target: 0 });
}
$$('.project-sticky').forEach((wrap, i, all) => {
  if (all[i + 1]) addStack($('.project', wrap), all[i + 1], { threshold: 1, scale: 0.85, opacity: 1 });
});
const rows = $$('.tl');
rows.forEach((row, i) => {
  addStack($('.tl__card', row), rows[i + 1] || $('.career__cta'), { threshold: 0.5, scale: 0.9, opacity: 0.6 });
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  let busy = false;
  stacks.forEach((s) => {
    const nb = s.next.getBoundingClientRect();
    s.target = clamp((s.threshold * innerHeight - nb.top) / nb.height, 0, 1);
    // x'' = -2w x' - w^2 (x - target)
    const a = -2 * OMEGA * s.v - OMEGA * OMEGA * (s.x - s.target);
    s.v += a * dt;
    s.x += s.v * dt;
    if (Math.abs(s.x - s.target) > 0.0005 || Math.abs(s.v) > 0.001) busy = true;
    else { s.x = s.target; s.v = 0; }
    s.card.style.transform = s.x === 0 ? '' : `scale(${1 - (1 - s.scale) * s.x})`;
    s.card.style.opacity = s.opacity === 1 ? '' : 1 - (1 - s.opacity) * s.x;
  });
  if (busy) requestAnimationFrame(frame);
  else running = false;
}
let running = false;
function kick() {
  if (reduceMotion || running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
}
addEventListener('scroll', kick, { passive: true });
addEventListener('resize', kick);
kick();

// ---------- marquees: distance / speed, 100 px/s, linear, leftwards ----------
const SPEED = 100;
$$('.marquee').forEach((m) => {
  const track = $('.marquee__track', m);
  const gap = parseFloat(m.dataset.gap) || 30;
  const hover = parseFloat(m.dataset.hover ?? 1);
  track.style.setProperty('--gap', `${gap}px`);
  const originals = [...track.children];
  let setW = 0;
  const build = () => {
    $$('[data-clone]', track).forEach((n) => n.remove());
    setW = originals.reduce((w, n) => w + n.getBoundingClientRect().width + gap, 0);
    // repeat the set until the track is wider than the viewport plus one set
    const copies = Math.max(1, Math.ceil((innerWidth + setW) / setW));
    for (let i = 0; i < copies; i++) {
      originals.forEach((node) => {
        const clone = node.cloneNode(true);
        clone.dataset.clone = '';
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
        if (clone.matches('[data-fx]')) { applySpring(clone, SPRING.media); fxIO.observe(clone); }
      });
    }
  };
  let anim;
  const start = () => {
    build();
    anim?.cancel();
    anim = track.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-setW}px)` }], {
      duration: (setW / SPEED) * 1000, iterations: Infinity, easing: 'linear',
    });
    if (reduceMotion) anim.pause();
  };
  addEventListener('load', start);
  start();
  m.addEventListener('mouseenter', () => anim && (anim.playbackRate = hover));
  m.addEventListener('mouseleave', () => anim && (anim.playbackRate = 1));
});

// ---------- accordion: each item toggles on its own ----------
$$('.acc__head').forEach((head) => {
  head.addEventListener('click', () => {
    const item = head.parentElement;
    const open = item.classList.toggle('is-open');
    head.setAttribute('aria-expanded', String(open));
  });
});

// ---------- footer year + contact form ----------
$('#year').textContent = new Date().getFullYear();
// No backend yet: open the visitor's mail app with the message filled in.
const CONTACT_EMAIL = 'hello@example.com';
$('#contact-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  const subject = `Message from ${data.get('name')}`;
  const phone = data.get('phone') ? `, ${data.get('phone')}` : '';
  const body = `${data.get('message')}\n\n— ${data.get('name')} (${data.get('email')}${phone})`;
  location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

// ---------- mobile menu ----------
const menuBtn = $('.menu-btn');
const setMenu = (open) => {
  document.documentElement.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
};
menuBtn.addEventListener('click', () => setMenu(!document.documentElement.classList.contains('menu-open')));
$$('.nav a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false));
matchMedia('(min-width: 801px)').addEventListener('change', (e) => e.matches && setMenu(false));
