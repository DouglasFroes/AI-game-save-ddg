/** Removes the HTML splash screen (see index.html) once the hub is on screen. */
export function hideSplash(): void {
  const el = document.getElementById('splash');
  if (!el) return;
  el.classList.add('done');
  window.setTimeout(() => el.remove(), 300);
}
