// Small, safe Markdown renderer shared by the build script and the admin preview.
// Supports: # ## ### headings, paragraphs, **bold**, *italic*, `code`, [links](url),
// ![images](url), - and 1. lists, > quotes, --- rules and ``` code blocks.
// All text is HTML-escaped first, so authors cannot inject markup.

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function safeUrl(url, base) {
  const u = url.trim();
  if (/^(https?:|mailto:|#)/i.test(u)) return u;
  if (/^(uploads|assets)\//.test(u)) return (base || '') + u;
  if (/^\.{0,2}\//.test(u)) return u;
  return '#';
}

function inline(text, base) {
  let s = escapeHtml(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(`<code>${c}</code>`) - 1}\u0000`);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => `<img src="${safeUrl(url, base)}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const href = safeUrl(url, base);
    const ext = /^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${href}"${ext}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
}

export function renderMarkdown(src, { base = '' } = {}) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      // post title is the page h1, so body headings start at h2
      const level = h[1].length + 1;
      out.push(`<h${level}>${inline(h[2], base)}</h${level}>`);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(buf.join(' '), base)}</blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^[-*]\s+/, ''), base)}</li>`);
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\d+\.\s+/, ''), base)}</li>`);
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|>\s?|[-*]\s+|\d+\.\s+|-{3,}\s*$)/.test(lines[i])) buf.push(lines[i++]);
    const para = buf.join('\n');
    const imgOnly = para.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    out.push(imgOnly ? `<figure>${inline(para, base)}</figure>` : `<p>${inline(para, base).replace(/\n/g, '<br>')}</p>`);
  }
  return out.join('\n');
}
