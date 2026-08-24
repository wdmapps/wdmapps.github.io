const ebookView = document.querySelector('#ebookView');
const ebookShell = document.querySelector('#ebookShell');
const ebookPaper = document.querySelector('#ebookPaper');
const nextButtons = [document.querySelector('#nextBtn'), document.querySelector('#stageNext')].filter(Boolean);
const prevButtons = [document.querySelector('#prevBtn'), document.querySelector('#stagePrev')].filter(Boolean);

let turning = false;
let lastTune = 0;

function ebookActive() {
  return !!ebookView?.book && getComputedStyle(ebookShell).display !== 'none';
}

function tunePaginator(force = false) {
  if (!ebookActive() || !ebookView.renderer) return;
  const now = performance.now();
  if (!force && now - lastTune < 120) return;
  lastTune = now;

  const r = ebookView.renderer;
  const mobile = window.innerWidth < 700;
  r.setAttribute('flow', 'paginated');
  r.setAttribute('max-column-count', '1');
  r.setAttribute('max-inline-size', mobile ? `${Math.max(280, window.innerWidth - 48)}px` : '760px');
  r.setAttribute('max-block-size', '1200px');
  r.setAttribute('gap', mobile ? '4%' : '5%');
  r.setAttribute('margin', mobile ? '16px' : '30px');
  requestAnimationFrame(() => {
    try { r.render?.(); } catch (e) { console.warn('reflow ebook', e); }
  });
}

async function flip(direction) {
  if (!ebookActive() || turning) return;
  turning = true;
  tunePaginator(true);

  const forward = direction === 'next';
  const sign = forward ? -1 : 1;
  const firstOrigin = forward ? 'left center' : 'right center';
  const secondOrigin = forward ? 'right center' : 'left center';

  const shade = document.createElement('div');
  Object.assign(shade.style, {
    position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '50', opacity: '0',
    background: forward
      ? 'linear-gradient(90deg,rgba(0,0,0,.05),rgba(0,0,0,.32) 78%,rgba(255,255,255,.16))'
      : 'linear-gradient(270deg,rgba(0,0,0,.05),rgba(0,0,0,.32) 78%,rgba(255,255,255,.16))'
  });
  ebookPaper.appendChild(shade);

  try {
    ebookPaper.getAnimations?.().forEach(a => a.cancel());
    ebookPaper.style.willChange = 'transform,filter';
    ebookPaper.style.backfaceVisibility = 'hidden';
    ebookPaper.style.transformOrigin = firstOrigin;

    const out = ebookPaper.animate([
      { transform: 'perspective(2200px) rotateY(0deg)', filter: 'brightness(1)' },
      { transform: `perspective(2200px) rotateY(${sign * 34}deg) translateZ(10px)`, filter: 'brightness(.9)', offset: .48 },
      { transform: `perspective(2200px) rotateY(${sign * 78}deg) translateZ(3px)`, filter: 'brightness(.62)' }
    ], { duration: 320, easing: 'cubic-bezier(.55,.08,.68,.19)', fill: 'forwards' });
    const shadeOut = shade.animate([{opacity:0},{opacity:.65}], {duration:320, fill:'forwards'});
    await Promise.all([out.finished.catch(()=>{}), shadeOut.finished.catch(()=>{})]);

    try {
      const p = forward ? ebookView.goRight() : ebookView.goLeft();
      if (p?.then) await p;
    } catch (e) { console.warn('ebook navigation', e); }

    tunePaginator(true);
    ebookPaper.style.transformOrigin = secondOrigin;
    const incoming = ebookPaper.animate([
      { transform: `perspective(2200px) rotateY(${-sign * 78}deg) translateZ(3px)`, filter: 'brightness(.66)' },
      { transform: `perspective(2200px) rotateY(${-sign * 30}deg) translateZ(10px)`, filter: 'brightness(.92)', offset: .48 },
      { transform: 'perspective(2200px) rotateY(0deg)', filter: 'brightness(1)' }
    ], { duration: 350, easing: 'cubic-bezier(.18,.75,.2,1)', fill: 'forwards' });
    const shadeIn = shade.animate([{opacity:.6},{opacity:0}], {duration:350, fill:'forwards'});
    await Promise.all([incoming.finished.catch(()=>{}), shadeIn.finished.catch(()=>{})]);
  } finally {
    ebookPaper.getAnimations?.().forEach(a => a.cancel());
    ebookPaper.style.transform = '';
    ebookPaper.style.transformOrigin = '';
    ebookPaper.style.filter = '';
    ebookPaper.style.willChange = '';
    ebookPaper.style.backfaceVisibility = '';
    shade.remove();
    turning = false;
  }
}

function interceptButton(button, direction) {
  button.addEventListener('click', e => {
    if (!ebookActive()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    flip(direction);
  }, true);
}

nextButtons.forEach(b => interceptButton(b, 'next'));
prevButtons.forEach(b => interceptButton(b, 'prev'));

function keyHandler(e) {
  if (!ebookActive()) return;
  if (['ArrowRight','PageDown',' '].includes(e.key)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    flip('next');
  } else if (['ArrowLeft','PageUp'].includes(e.key)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    flip('prev');
  }
}

document.addEventListener('keydown', keyHandler, true);
ebookView?.addEventListener('load', ({detail}) => {
  setTimeout(() => tunePaginator(true), 0);
  setTimeout(() => tunePaginator(true), 120);
  try { detail?.doc?.addEventListener('keydown', keyHandler, true); } catch (e) {}
});
ebookView?.addEventListener('relocate', () => tunePaginator());
window.addEventListener('resize', () => tunePaginator(true));
document.addEventListener('fullscreenchange', () => setTimeout(() => tunePaginator(true), 100));
