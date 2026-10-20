const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const NUM = String.raw`\d{1,3}(?:[,. ]\d{3})+|\d+(?:\.\d+)?\s?[km]?\+?`;
/** Page-chrome counters only (not people or content nouns, whose counts carry meaning). */
const COUNT_NOUN = String.raw`(?:articles?|comments?|views?|visitors?|visits|followers?|subscribers?|stars?|forks?|downloads?|likes?|shares?|replies|watchers?)`;
const AGO = String.raw`(?:an?|\d+)\s+(?:sec(?:ond)?s?|min(?:ute)?s?|hours?|hrs?|days?|weeks?|months?|years?)\s+ago`;
/** Query keys that never change page meaning: tracking, session ids and cache-busters. */
const NOISE_PARAM = /^(?:utm_\w+|fbclid|gclid|dclid|msclkid|mc_[ce]id|_ga|_gl|ref|sid|(?:php|j)?sess(?:ion)?id|ver|cb|ts|rev|cache_?bust(?:er)?)$/i;
/** Short keys that are cache-busters only on static assets (`?v=` is content on `youtube.com/watch`). */
const ASSET_NOISE_PARAM = /^(?:v|t|_)$/i;
const ASSET_PATH = /\.(?:m?js|css|png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot)$/i;

/** Ordered mask rules: [pattern, replacement]. Order matters ("last updated" sees already-masked dates). */
const MASKS: [RegExp, string][] = [
  // Wayback / arquivo.pt replay prefixes left in links.
  [/(?:https?:)?\/\/(?:web\.archive\.org\/web|arquivo\.pt\/wayback)\/\d{1,14}[a-z]{0,2}_?\//gi, ''],
  [/(©|\(c\)|\bcopyright\b)\s*(?:©\s*)?\d{4}(?:\s*-\s*\d{4})?/gi, '© ⟨year⟩'],
  [/\b\d{4}([-/.])\d{1,2}\1\d{1,2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g, '⟨date⟩'],
  // d/m/yy(yy), or d.m.yyyy only: "18.17.10" is a version number, not a date.
  [/\b\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2})\b|\b\d{1,2}\.\d{1,2}\.\d{4}\b/g, '⟨date⟩'],
  [new RegExp(String.raw`\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH},?\s+\d{4}|${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|${MONTH}\s+\d{4})\b`, 'gi'), '⟨date⟩'],
  // Case-sensitive so the zone suffix ("EST") never eats a word ("eastern").
  [/\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\s*[aApP]\.?[mM]\b\.?)?(?:\s*\(?(?:UTC|GMT|[A-Z][A-Z]?[SD]T)\b\)?)?|\b(?:1[0-2]|0?[1-9])\s*[aApP]\.?[mM]\b\.?/g, '⟨time⟩'],
  // Runs after date/time masks, and only when a time phrase follows ("last edited by Alice" is content).
  [new RegExp(String.raw`\blast[ -](?:updated|modified|edited|changed|revised)(?:\s*:|\s+(?:on|at))?\s*(?:⟨date⟩(?:,?\s*(?:at\s+)?⟨time⟩)?|⟨time⟩|(?:today|yesterday|${AGO})\b)`, 'gi'), 'last updated ⟨when⟩'],
  [new RegExp(String.raw`(?:\b(?:${NUM})\s+${COUNT_NOUN}\b|\b${COUNT_NOUN}:?\s+(?:${NUM}))`, 'gi'), '⟨count⟩'],
];

/** Light folding for comparison: NFC, no zero-width chars, ASCII quotes and dashes, collapsed whitespace. */
export function foldText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“-‟″«»]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Comparison key for a block of text (display always keeps the original). Applies
 * {@link foldText}, drops tracking/session/cache-buster query params and archive replay
 * prefixes, and masks dates, times, "last updated ..." phrases, copyright years and
 * counters ("1,234 articles") as tokens such as `⟨date⟩`. Bare years ("2014 Olympics")
 * are kept, because they usually carry meaning.
 */
export function normalizeForCompare(text: string): string {
  let out = foldText(text).replace(/([^\s?"'<>]+)\?([^\s#"'<>]+)/g, (_, path: string, query: string) => {
    const asset = ASSET_PATH.test(path);
    const kept = query.split('&').filter((seg) => {
      const key = seg.split('=')[0] ?? '';
      return !NOISE_PARAM.test(key) && !(asset && ASSET_NOISE_PARAM.test(key));
    });
    return kept.length ? `${path}?${kept.join('&')}` : path;
  });
  for (const [re, mask] of MASKS) out = out.replace(re, mask);
  return out;
}
