// Applies a stored theme choice before first paint (src/app/theme.ts owns the logic; theme.test.ts keeps the key and
// colours equal). An external file because the CSP allows no inline script.
try {
  var t = localStorage.getItem('pagelapse-theme');
  if (t === 'light' || t === 'dark') {
    document.documentElement.setAttribute('data-theme', t);
    var c = t === 'dark' ? '#111110' : '#FFFFFF';
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.setAttribute('content', c); });
  }
} catch {
  // Blocked storage: follow the system.
}
