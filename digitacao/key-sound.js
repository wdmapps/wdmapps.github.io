// Som real de teclado mecânico para o WDM Digitação
(() => {
  const previous = localStorage.getItem('wdmTypingSampleSound');
  let enabled = previous === null ? localStorage.getItem('wdmTypingSound') !== 'off' : previous !== 'off';

  // Mantém desligado o som sintetizado antigo do app-v2.js.
  localStorage.setItem('wdmTypingSound', 'off');

  const src = 'data:audio/mpeg;base64,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';

  const pool = Array.from({ length: 10 }, () => {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.volume = 0.32;
    return audio;
  });
  let cursor = 0;

  function playClick() {
    if (!enabled) return;
    const audio = pool[cursor++ % pool.length];
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0.28 + Math.random() * 0.06;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }

  function installToggle() {
    const head = document.querySelector('.keyboard-head');
    if (!head || document.getElementById('soundToggle')) return;
    const button = document.createElement('button');
    button.id = 'soundToggle';
    button.className = 'sound-toggle';
    const paint = () => button.textContent = enabled ? '🔊 Som mecânico' : '🔇 Som desligado';
    paint();
    button.addEventListener('click', () => {
      enabled = !enabled;
      localStorage.setItem('wdmTypingSampleSound', enabled ? 'on' : 'off');
      paint();
      if (enabled) playClick();
    });
    head.appendChild(button);
  }

  document.addEventListener('keydown', (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const active = document.activeElement;
    if (!active || (active.id !== 'typingBox' && active.id !== 'gamePanel')) return;
    if (event.key.length === 1 || event.key === 'Backspace') playClick();
  }, true);

  installToggle();
  new MutationObserver(installToggle).observe(document.body, { childList: true, subtree: true });
})();
