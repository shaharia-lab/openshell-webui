// Applies the saved theme before the first paint, so dark mode does not
// flash. Loaded as a file because the backend CSP refuses inline scripts.
;(function () {
  var theme = 'system'
  try {
    theme = localStorage.getItem('theme') || 'system'
  } catch (e) {}
  var dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
})()
