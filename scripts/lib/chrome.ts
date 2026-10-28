/** The system Chrome the scripts drive through playwright-core: `CHROME_PATH`, else the standard install per platform. */
export const chromePath = (): string =>
  process.env.CHROME_PATH ??
  (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
