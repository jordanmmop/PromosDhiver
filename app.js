const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;

function addDepthMotion(scene, selectors) {
  if (!scene || reducedMotion || !finePointer) return;
  const layers = selectors.flatMap(([selector, depth]) =>
    [...scene.querySelectorAll(selector)].map(element => ({ element, depth }))
  );
  if (!layers.length) return;

  scene.addEventListener('pointermove', event => {
    const rect = scene.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    for (const { element, depth } of layers) {
      element.style.setProperty('--depth-x', `${(x * depth).toFixed(1)}px`);
      element.style.setProperty('--depth-y', `${(y * depth).toFixed(1)}px`);
    }
  }, { passive: true });

  scene.addEventListener('pointerleave', () => {
    for (const { element } of layers) {
      element.style.removeProperty('--depth-x');
      element.style.removeProperty('--depth-y');
    }
  }, { passive: true });
}

const hero = document.getElementById('heroArt');
if (hero && !reducedMotion && finePointer) {
  hero.addEventListener('pointermove', event => {
    const rect = hero.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    hero.style.setProperty('--rx', `${-y * 2}deg`);
    hero.style.setProperty('--ry', `${x * 3}deg`);
  }, { passive: true });
  hero.addEventListener('pointerleave', () => {
    hero.style.setProperty('--rx', '0deg');
    hero.style.setProperty('--ry', '0deg');
  }, { passive: true });
}

addDepthMotion(hero, [
  ['.moon', 11], ['.mountain-back', 5], ['.mountain-front', 9],
  ['.cabin', 13], ['.projected-scene', 16], ['.hero-product', 19], ['.scene-stamp', 8]
]);
addDepthMotion(document.querySelector('.blog-hero-art'), [
  ['.blog-art-moon', 11], ['.tree-a, .tree-c', 6], ['.tree-b', 12], ['.gift-one, .gift-two', 17], ['.blog-art-caption', 20]
]);

if (finePointer && !reducedMotion) {
  for (const card of document.querySelectorAll('.product-card')) {
    card.addEventListener('pointermove', event => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      card.style.setProperty('--tilt-x', `${((.5 - y) * 5).toFixed(2)}deg`);
      card.style.setProperty('--tilt-y', `${((x - .5) * 7).toFixed(2)}deg`);
      const visual = card.querySelector('.product-visual');
      if (visual) {
        visual.style.setProperty('--pointer-x', `${(x * 100).toFixed(1)}%`);
        visual.style.setProperty('--pointer-y', `${(y * 100).toFixed(1)}%`);
      }
    }, { passive: true });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
      const visual = card.querySelector('.product-visual');
      if (visual) {
        visual.style.setProperty('--pointer-x', '50%');
        visual.style.setProperty('--pointer-y', '50%');
      }
    }, { passive: true });
  }
}

for (const gallery of document.querySelectorAll('[data-product-gallery]')) {
  const thumbnails = [...gallery.querySelectorAll('[data-gallery-thumb]')];
  const mainImage = gallery.querySelector('[data-gallery-main]');
  const count = gallery.querySelector('[data-gallery-count]');
  const lightbox = document.querySelector(`[data-product-lightbox="${gallery.dataset.productGallery}"]`);
  const lightboxImage = lightbox?.querySelector('[data-lightbox-image]');
  const lightboxCaption = lightbox?.querySelector('[data-lightbox-caption]');
  let activeIndex = 0;

  function syncLightbox() {
    if (!lightboxImage || !lightboxCaption) return;
    const active = thumbnails[activeIndex];
    lightboxImage.src = active.dataset.src;
    lightboxImage.alt = active.dataset.alt;
    lightboxCaption.textContent = active.dataset.caption;
  }

  function selectPhoto(index, scrollThumbnail = true) {
    if (!thumbnails.length || !mainImage) return;
    activeIndex = (index + thumbnails.length) % thumbnails.length;
    const active = thumbnails[activeIndex];
    mainImage.src = active.dataset.src;
    mainImage.alt = active.dataset.alt;
    if (count) count.textContent = `${activeIndex + 1} / ${thumbnails.length}`;
    thumbnails.forEach((thumbnail, thumbnailIndex) => {
      const isActive = thumbnailIndex === activeIndex;
      thumbnail.classList.toggle('is-active', isActive);
      thumbnail.setAttribute('aria-pressed', String(isActive));
    });
    if (scrollThumbnail) {
      active.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
    }
    if (lightbox?.open) syncLightbox();
  }

  thumbnails.forEach((thumbnail, index) => thumbnail.addEventListener('click', () => selectPhoto(index, false)));
  gallery.querySelector('[data-gallery-prev]')?.addEventListener('click', () => selectPhoto(activeIndex - 1));
  gallery.querySelector('[data-gallery-next]')?.addEventListener('click', () => selectPhoto(activeIndex + 1));
  gallery.querySelector('[data-gallery-open]')?.addEventListener('click', () => {
    if (!lightbox?.showModal) return;
    syncLightbox();
    lightbox.showModal();
  });

  lightbox?.querySelector('[data-lightbox-close]')?.addEventListener('click', () => lightbox.close());
  lightbox?.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => selectPhoto(activeIndex - 1, false));
  lightbox?.querySelector('[data-lightbox-next]')?.addEventListener('click', () => selectPhoto(activeIndex + 1, false));
  lightbox?.addEventListener('click', event => {
    if (event.target === lightbox) lightbox.close();
  });
  lightbox?.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') selectPhoto(activeIndex - 1, false);
    if (event.key === 'ArrowRight') selectPhoto(activeIndex + 1, false);
  });
}

const revealTargets = document.querySelectorAll(
  '.section-heading, .product-card, .winter-note, .blog-intro, .guide-index, .guide-article, .blog-faq, .blog-last-call'
);
if (!reducedMotion && 'IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    }
  }, { threshold: .14, rootMargin: '0px 0px -36px 0px' });

  revealTargets.forEach((element, index) => {
    element.classList.add('reveal');
    if (element.classList.contains('product-card')) {
      element.style.setProperty('--reveal-delay', `${index % 2 * 110}ms`);
    }
    revealObserver.observe(element);
  });
}

const canvas = document.getElementById('snow');
const ctx = canvas?.getContext('2d');
if (canvas && ctx) {
  let flakes = [];
  let width = 0;
  let height = 0;
  let targetWind = 0;
  let wind = 0;
  let frameId = 0;

  function resizeSnow() {
    window.cancelAnimationFrame(frameId);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.min(90, Math.floor(width / 14));
    flakes = Array.from({ length: count }, () => {
      const depth = Math.random();
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        radius: .45 + depth * 1.9,
        speed: .16 + depth * .42,
        drift: (Math.random() - .5) * .24,
        opacity: .12 + depth * .3,
        phase: Math.random() * Math.PI * 2
      };
    });
    drawSnow();
  }

  function drawSnow() {
    ctx.clearRect(0, 0, width, height);
    wind += (targetWind - wind) * .025;
    for (const flake of flakes) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(246, 249, 247, ${flake.opacity})`;
      ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      ctx.fill();
      if (!reducedMotion && !document.hidden) {
        flake.y += flake.speed;
        flake.x += flake.drift + wind * (0.35 + flake.radius) + Math.sin(flake.y / 80 + flake.phase) * .12;
        if (flake.y > height + 3) { flake.y = -3; flake.x = Math.random() * width; }
        if (flake.x < -3) flake.x = width + 3;
        if (flake.x > width + 3) flake.x = -3;
      }
    }
    if (!reducedMotion && !document.hidden) frameId = window.requestAnimationFrame(drawSnow);
  }

  if (finePointer && !reducedMotion) {
    window.addEventListener('pointermove', event => {
      targetWind = ((event.clientX / Math.max(width, 1)) - .5) * .65;
    }, { passive: true });
    window.addEventListener('pointerleave', () => { targetWind = 0; }, { passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.cancelAnimationFrame(frameId);
    else if (!reducedMotion) drawSnow();
  });
  window.addEventListener('resize', resizeSnow, { passive: true });
  resizeSnow();
}
