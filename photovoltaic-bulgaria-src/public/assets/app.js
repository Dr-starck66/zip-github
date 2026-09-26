(() => {
  const btn = document.querySelector('[data-menu]');
  const nav = document.querySelector('.navlinks');
  if (btn && nav) btn.addEventListener('click', () => { nav.style.display = nav.style.display === 'flex' ? 'none' : 'flex'; });
})();
