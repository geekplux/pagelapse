import { describe, expect, it } from 'vitest';
import { pairKey, rawCaptureUrl, validateTargetUrl, viewCaptureUrl } from './url.ts';

describe('validateTargetUrl', () => {
  it.each([
    ['example.org/about', 'https://example.org/about'],
    ['HTTP://Example.ORG:80/Path#section', 'http://example.org/Path'],
    ['https://example.org:443', 'https://example.org/'],
    ['example.org:8080/x', 'https://example.org:8080/x'],
    ['  https://www.example.org/a b  ', 'https://www.example.org/a%20b'],
    ['https://example.org/?utm_source=a&id=7&fbclid=b&gclid=c&UTM_Medium=d', 'https://example.org/?id=7'],
    ['https://example.org/page?utm_campaign=x&msclkid=y#top', 'https://example.org/page'],
    ['https://example.org/search?q=a+b&ref=home', 'https://example.org/search?q=a+b&ref=home'],
    ['https://example.org/p?path=/a/b&utm_medium=y', 'https://example.org/p?path=/a/b'],
    ['https://example.org/p?flag&utm_medium=y', 'https://example.org/p?flag'],
    ['https://example.org/p?q=a%20b&utm_source=x', 'https://example.org/p?q=a%20b'],
    ['https://example.org/p?x=a,b&utm_source=z', 'https://example.org/p?x=a,b'],
    ['https://bücher.example/', 'https://xn--bcher-kva.example/'],
  ])('normalises %j', (input, url) => {
    expect(validateTargetUrl(input)).toEqual({ ok: true, url });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['javascript:alert(1)', 'scheme'],
    ['ftp://example.org/file.txt', 'scheme'],
    ['mailto:someone@example.org', 'scheme'],
    ['data:text/html,hello', 'scheme'],
    ['https://user:pass@example.org/', 'credentials'],
    ['http://127.0.0.1/', 'ip'],
    ['127.0.0.1:8080', 'ip'],
    ['http://0x7f.1/', 'ip'],
    ['http://[::1]/', 'ip'],
    ['localhost:3000', 'host'],
    ['http://intranet/', 'host'],
    ['https://printer.local/', 'host'],
    ['https://exa mple.org', 'invalid'],
    ['http://', 'invalid'],
    [`https://example.org/${'a'.repeat(2048)}`, 'too-long'],
  ])('rejects %j as %s', (input, code) => {
    const result = validateTargetUrl(input);
    expect(result).toMatchObject({ ok: false, code });
    expect(result.ok || result.message.length > 10).toBe(true);
  });
});

describe('capture URLs', () => {
  const url = 'https://example.org/';
  it('builds raw and viewer URLs for each archive', () => {
    expect(rawCaptureUrl('internet-archive', '20140317091200', url)).toBe(
      'https://web.archive.org/web/20140317091200id_/https://example.org/',
    );
    expect(viewCaptureUrl('internet-archive', '20140317091200', url)).toBe(
      'https://web.archive.org/web/20140317091200/https://example.org/',
    );
    expect(rawCaptureUrl('arquivo-pt', '20140317091200', url)).toBe(
      'https://arquivo.pt/wayback/20140317091200id_/https://example.org/',
    );
  });

  it('rejects malformed timestamps', () => {
    expect(() => rawCaptureUrl('internet-archive', '2014', url)).toThrow(RangeError);
  });

  it('keys capture pairs', () => expect(pairKey('20140317091200', '20160602143000')).toBe('20140317091200-20160602143000'));
});
