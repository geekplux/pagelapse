/**
 * Google Analytics, on the live site only. It counts page views: the app sends no events of its
 * own, and nothing a visitor types, pastes or opens (the page you look up, the capture or change you pick) reaches it.
 *
 * - Only on {@link ANALYTICS_HOST}, and only once {@link MEASUREMENT_ID} is set: local dev, tests
 *   and branch Previews never load it.
 * - The one page view per load names the origin and the path ({@link pagePath}), never the query
 *   string that holds the app's state, and a fixed title, not `document.title`.
 * - Google signals and ad personalisation are off.
 */

export const ANALYTICS_HOST = 'pagelapse.geekplux.com';
/** The GA4 web stream for {@link ANALYTICS_HOST}; empty keeps analytics off. */
export const MEASUREMENT_ID = '';
const PAGE_TITLE = 'Pagelapse';
const PATHS = new Set(['/']);

type Where = Pick<Location, 'hostname' | 'origin' | 'pathname'>;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/** The path a page view reports: a known page as is, anything else as `/other`. */
export function pagePath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/';
  return PATHS.has(path) ? path : '/other';
}

/** Starts Google Analytics when the page is on the live site and sends its page view. Returns whether it did. */
export function startAnalytics(where: Where = window.location, id: string = MEASUREMENT_ID): boolean {
  if (!id || where.hostname !== ANALYTICS_HOST) return false;

  const dataLayer = (window.dataLayer ??= []);
  // gtag.js reads `arguments` objects off the data layer, not arrays.
  const gtag: (...args: unknown[]) => void = function () {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  gtag('js', new Date());
  gtag('config', id, {
    page_location: `${where.origin}${pagePath(where.pathname)}`,
    page_title: PAGE_TITLE,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.append(script);
  return true;
}
