// Deliberately limited Markdown: authored text becomes HTML, raw HTML stays text.
const exampleImages = require('./editorial-images.json');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function safeLink(value) {
  if (/^\/(?!\/)[^\s\\]*$/.test(value) || /^#[a-z0-9-]+$/i.test(value)) return value;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

function inline(text) {
  // Tokenize before escaping so entities cannot introduce markup or URL schemes.
  const pattern = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*|(?<!\*)\*([^*\n]+)\*(?!\*)/g;
  let result = '', cursor = 0;
  for (const match of text.matchAll(pattern)) {
    result += escape(text.slice(cursor, match.index));
    if (match[1]) result += `<code>${escape(match[1])}</code>`;
    else if (match[2]) {
      const url = safeLink(match[3]);
      result += url ? `<a href="${escape(url)}">${escape(match[2])}</a>` : escape(match[0]);
    } else if (match[4]) result += `<strong>${escape(match[4])}</strong>`;
    else result += `<em>${escape(match[5])}</em>`;
    cursor = match.index + match[0].length;
  }
  return result + escape(text.slice(cursor));
}

function renderMarkdown(body, options = {}) {
  const lines = String(body || '').replace(/\r\n?/g, '\n').trim().split('\n');
  const headings = [], ids = new Map(), output = [];
  const hasMarkdownHeadings = lines.some(line => /^#{1,6}\s+/.test(line));
  const heading = (level, text) => {
    const label = text.replace(/[*`]/g, '').trim();
    const base = label.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
    const count = (ids.get(base) || 0) + 1; ids.set(base, count);
    const id = count === 1 ? base : `${base}-${count}`;
    headings.push({ level, id, text: label });
    return `<h${level} id="${id}">${inline(text)}</h${level}>`;
  };
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (/^```/.test(line)) {
      const language = line.slice(3).replace(/[^a-z0-9-]/gi, ''); const code = []; i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) code.push(lines[i++]);
      if (i < lines.length) i++;
      output.push(`<pre><code${language ? ` class="language-${language}"` : ''}>${escape(code.join('\n'))}</code></pre>`); continue;
    }
    const image = line.match(/^!\[([^\]\n]+)\]\(([^\s)]+)\)$/);
    if (image) {
      // Only repository-owned raster examples; no remote tracking or raw attributes.
      const source = image[2];
      const knownImage = exampleImages[source];
      const dimensions = knownImage ? ` width="${knownImage.width}" height="${knownImage.height}"` : '';
      output.push(/^\/assets\/images\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:png|webp|jpe?g)$/i.test(source)
        ? `<figure class="article-example"><img src="${escape(source)}" alt="${escape(image[1])}"${dimensions} loading="lazy" decoding="async" style="display:block;max-width:100%;height:auto"><figcaption>${escape(image[1])}</figcaption></figure>`
        : `<p>${escape(line)}</p>`);
      i++; continue;
    }
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      i++;
      if (!output.length && match[2].replace(/[*`]/g, '').trim() === options.title) continue;
      output.push(heading(Math.min(match[1].length + 1, 6), match[2])); continue;
    }
    if (/^(?:---+|\*\*\*+)\s*$/.test(line)) { output.push('<hr>'); i++; continue; }
    if (line.startsWith('|') && /^\|?\s*:?-{3,}/.test((lines[i+1] || '').trim())) {
      const cells = value => value.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      const headers = cells(line); i += 2; const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      output.push(`<div class="table-scroll" tabindex="0" role="region" aria-label="${escape(headers.join(', '))}"><table><thead><tr>${headers.map(cell => `<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map((_, index) => `<td>${inline(row[index] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    const list = line.match(/^([-*]|\d+[.)])\s+(.+)$/);
    if (list) {
      const ordered = /^\d/.test(list[1]); const items = [];
      const pattern = ordered ? /^\d+[.)]\s+(.+)$/ : /^[-*]\s+(.+)$/;
      while (i < lines.length && pattern.test(lines[i].trim())) items.push(lines[i++].trim().replace(pattern, '$1'));
      const tag = ordered ? 'ol' : 'ul';
      output.push(`<${tag}>${items.map(item => `<li>${inline(item)}</li>`).join('')}</${tag}>`); continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(?:#{1,6}\s|```|[-*]\s|\d+[.)]\s)/.test(lines[i].trim())) paragraph.push(lines[i++].trim());
    const text = paragraph.join('\n');
    const legacyHeading = !hasMarkdownHeadings && paragraph.length === 1 && i < lines.length && text.length <= 80 && text.split(/\s+/).length <= 10 && !/[.!?:;]$/.test(text);
    output.push(legacyHeading ? heading(2, text) : `<p>${inline(text).replace(/\n/g, '<br>')}</p>`);
  }
  // Long handbooks expose chapters, keeping dozens of subsections out of the TOC.
  const chapters = headings.filter(item => item.level === 2);
  const outline = chapters.length >= 4 ? chapters : headings.filter(item => item.level <= 3);
  const toc = outline.length >= 4 ? `<nav class="article-toc" aria-label="In this guide"><h2>In this guide</h2><ol>${outline.map(item => `<li><a href="#${item.id}">${escape(item.text)}</a></li>`).join('')}</ol></nav>` : '';
  return { html: output.join(''), toc, headings };
}

module.exports = { escape, inline, safeLink, renderMarkdown };
