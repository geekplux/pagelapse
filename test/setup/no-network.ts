// Tests never touch the network (AC 20): any real fetch fails loudly. Inject a fake instead.
globalThis.fetch = () => Promise.reject(new Error('network access is disabled in tests; inject a fake fetch'));
