const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const NUM = String.raw`\d{1,3}(?:[,. ]\d{3})+|\d+(?:\.\d+)?\s?[km]?\+?`;
const COUNT_NOUN = String.raw`(?:articles?|comments?|views?|visitors?|visits|users?|members?|followers?|subscribers?|stars?|forks?|downloads?|posts?|pages?|edits?|likes?|shares?|replies|reviews?|readers?|watchers?|contributors?|commits?|people|results?|entries|items?|records?|books?|videos?|images?|files?)`;
/** Query keys that never change page meaning: tracking, session ids and cache-busters. */
const NOISE_PARAM = /^(?:utm_\w+|fbclid|gclid|dclid|msclkid|mc_[ce]id|_ga|_gl|ref|sid|(?:php|j)?sess(?:ion)?id|v|ver|cb|_|t|ts|rev|cache_?bust(?:er)?)$/i;

/** Ordered mask rules: [pattern, replacement]. Earlier rules win (e.g. "last updated" eats its date). */
const MASKS: [RegExp, string][] = [
  // Wayback / arquivo.pt replay prefixes left in links.
  [/(?:https?:)?\/\/(?:web\.archive\.org\/web|arquivo\.pt\/wayback)\/\d{1,14}[a-z]{0,2}_?\//gi, ''],
  [/\blast[ -](?:updated|modified|edited|changed|revised)\b[^.\n|]{0,40}/gi, 'last updated ⟨when⟩'],
  [/(©|\(c\)|\bcopyright\b)\s*(?:©\s*)?\d{4}(?:\s*-\s*\d{4})?/gi, '© ⟨year⟩'],
  [/\b\d{4}([-/.])\d{1,2}\1\d{1,2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g, '⟨date⟩'],
  [/\b\d{1,2}([/.])\d{1,2}\1(?:\d{4}|\d{2})\b/g, '⟨date⟩'],
  [new RegExp(String.raw`\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH},?\s+\d{4}|${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|${MONTH}\s+\d{4})\b`, 'gi'), '⟨date⟩'],
  [/\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\s*[ap]\.?m\b\.?)?(?:\s*\(?(?:UTC|GMT|[A-Z][A-Z]?[SD]T)\)?)?|\b(?:1[0-2]|0?[1-9])\s*[ap]\.?m\b\.?/gi, '⟨time⟩'],
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
    const kept = query.split('&').filter((seg) => !NOISE_PARAM.test(seg.split('=')[0] ?? ''));
    return kept.length ? `${path}?${kept.join('&')}` : path;
  });
  for (const [re, mask] of MASKS) out = out.replace(re, mask);
  return out;
}
