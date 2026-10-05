// Turns an email body into a list of text tokens (one per table cell / paragraph / line), so
// parsers can say "the value after the label X" whatever the email's HTML looks like.

const BLOCK_END = /<\/(p|div|td|th|tr|li|h[1-6]|table|tbody|thead|section|header|footer|center)>|<br\s*\/?>/gi;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', bull: '•', middot: '·', ndash: '–', mdash: '—' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function clean(line) {
  return line.replace(/[ ​‌‍﻿]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** HTML body -> tokens. */
export function htmlToTokens(html) {
  const body = String(html)
    .replace(/<(head|style|script|title)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(BLOCK_END, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(body).split('\n').map(clean).filter(Boolean);
}

/**
 * Plain-text body -> tokens. Also accepts the markdown-like text some mail tools produce
 * ("| Label | : | Value |", "Penerima#### NAME"): pipes and heading marks separate tokens.
 */
export function textToTokens(text) {
  return String(text)
    .split(/\r?\n|\||#{2,}/)
    .map((t) => clean(t.replace(/^#+\s*/, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')))
    .filter((t) => t && t !== ':');
}

export function bodyToTokens(body, isHtml) {
  return isHtml ? htmlToTokens(body) : textToTokens(body);
}

const norm = (s) => clean(String(s)).replace(/\s*:$/, '').toLowerCase();

/**
 * Value of the first token after `label` (exact, case-insensitive). Returns '' when the label
 * is missing or when the next token is itself one of `labels` (an empty field).
 */
export function valueAfter(tokens, label, labels = []) {
  const want = norm(label);
  const stop = new Set(labels.map(norm));
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (norm(tokens[i]) === want) {
      let j = i + 1;
      while (j < tokens.length && tokens[j].trim() === ':') j += 1;
      const v = tokens[j] ?? '';
      return stop.has(norm(v)) ? '' : v.replace(/^:\s*/, '').trim();
    }
  }
  return '';
}

/** First of several labels that has a value. */
export function firstValue(tokens, labels, allLabels = labels) {
  for (const l of labels) {
    const v = valueAfter(tokens, l, allLabels);
    if (v) return v;
  }
  return '';
}

/** Index of the first token matching a regex, or -1. */
export function findToken(tokens, re) {
  return tokens.findIndex((t) => re.test(t));
}
