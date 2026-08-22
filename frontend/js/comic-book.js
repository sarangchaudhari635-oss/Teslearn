/** Interactive comic book viewer with page-turn effect. */
const ComicBook = {
  escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  normalizePanels(result) {
    if (result.panels?.length) return result.panels;
    return (result.image_urls || []).map((url) => ({ url, caption: '', dialogue: '' }));
  },

  pageHtml(panel, pageNum, total) {
    const caption = panel.caption
      ? `<div class="comic-caption">${this.escapeHtml(panel.caption)}</div>`
      : '';
    const dialogue = panel.dialogue
      ? `<div class="comic-dialogue">${this.escapeHtml(panel.dialogue)}</div>`
      : '';
    return `
      <div class="comic-page-inner">
        <img src="${panel.url}" alt="Comic page ${pageNum}" draggable="false" />
        ${caption}${dialogue}
        <span class="comic-page-num">${pageNum} / ${total}</span>
      </div>`;
  },

  mount(container, result) {
    const panels = this.normalizePanels(result);
    if (!panels.length) {
      container.innerHTML = '<p class="muted" style="padding:1.5rem">No comic pages found.</p>';
      return;
    }

    const title = this.escapeHtml(result.title || 'Comic');
    let index = 0;
    let busy = false;

    container.innerHTML = `
      <div class="comic-book" id="comicBook">
        <div class="comic-book-shell">
          <div class="comic-book-edge" aria-hidden="true"></div>
          <div class="comic-book-viewport" id="comicViewport">
            <div class="comic-book-sheet comic-book-sheet--base" id="comicBase"></div>
            <div class="comic-book-sheet comic-book-sheet--flip" id="comicFlip" aria-hidden="true"></div>
            <button type="button" class="comic-hit comic-hit--prev" id="comicHitPrev" aria-label="Previous page"></button>
            <button type="button" class="comic-hit comic-hit--next" id="comicHitNext" aria-label="Next page"></button>
          </div>
          <div class="comic-book-spine" aria-hidden="true"></div>
        </div>
        <p class="comic-book-title">${title}</p>
        <div class="comic-book-toolbar">
          <button type="button" class="btn btn-ghost" id="comicPrev" aria-label="Previous page">← Prev</button>
          <span class="comic-book-indicator" id="comicIndicator">1 / ${panels.length}</span>
          <button type="button" class="btn btn-ghost" id="comicNext" aria-label="Next page">Next →</button>
        </div>
      </div>`;

    const base = container.querySelector('#comicBase');
    const flip = container.querySelector('#comicFlip');
    const indicator = container.querySelector('#comicIndicator');
    const prevBtn = container.querySelector('#comicPrev');
    const nextBtn = container.querySelector('#comicNext');
    const hitPrev = container.querySelector('#comicHitPrev');
    const hitNext = container.querySelector('#comicHitNext');

    const renderBase = (i) => {
      base.innerHTML = this.pageHtml(panels[i], i + 1, panels.length);
    };

    const syncControls = () => {
      indicator.textContent = `${index + 1} / ${panels.length}`;
      prevBtn.disabled = index === 0 || busy;
      nextBtn.disabled = index >= panels.length - 1 || busy;
      hitPrev.disabled = index === 0 || busy;
      hitNext.disabled = index >= panels.length - 1 || busy;
    };

    const finishFlip = (nextIndex) => {
      index = nextIndex;
      renderBase(index);
      flip.className = 'comic-book-sheet comic-book-sheet--flip';
      flip.innerHTML = '';
      flip.setAttribute('aria-hidden', 'true');
      busy = false;
      syncControls();
    };

    const turnForward = () => {
      if (busy || index >= panels.length - 1) return;
      busy = true;
      syncControls();

      const nextIndex = index + 1;
      base.innerHTML = this.pageHtml(panels[nextIndex], nextIndex + 1, panels.length);
      flip.innerHTML = this.pageHtml(panels[index], index + 1, panels.length);
      flip.className = 'comic-book-sheet comic-book-sheet--flip is-turning-forward';
      flip.removeAttribute('aria-hidden');

      const onEnd = (e) => {
        if (e.propertyName !== 'transform') return;
        flip.removeEventListener('transitionend', onEnd);
        finishFlip(nextIndex);
      };
      flip.addEventListener('transitionend', onEnd);
    };

    const turnBackward = () => {
      if (busy || index <= 0) return;
      busy = true;
      syncControls();

      const prevIndex = index - 1;
      flip.innerHTML = this.pageHtml(panels[prevIndex], prevIndex + 1, panels.length);
      flip.className = 'comic-book-sheet comic-book-sheet--flip is-turning-backward-start';
      flip.removeAttribute('aria-hidden');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          flip.className = 'comic-book-sheet comic-book-sheet--flip is-turning-backward';
        });
      });

      const onEnd = (e) => {
        if (e.propertyName !== 'transform') return;
        flip.removeEventListener('transitionend', onEnd);
        finishFlip(prevIndex);
      };
      flip.addEventListener('transitionend', onEnd);
    };

    prevBtn.addEventListener('click', turnBackward);
    nextBtn.addEventListener('click', turnForward);
    hitPrev.addEventListener('click', turnBackward);
    hitNext.addEventListener('click', turnForward);

    container.querySelector('.comic-book')?.setAttribute('tabindex', '0');

    container.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') turnBackward();
      if (e.key === 'ArrowRight') turnForward();
    });

    let touchX = null;
    container.querySelector('#comicViewport')?.addEventListener('touchstart', (e) => {
      touchX = e.changedTouches[0]?.clientX ?? null;
    }, { passive: true });
    container.querySelector('#comicViewport')?.addEventListener('touchend', (e) => {
      if (touchX == null) return;
      const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
      if (dx < -40) turnForward();
      if (dx > 40) turnBackward();
      touchX = null;
    }, { passive: true });

    renderBase(index);
    syncControls();
  },
};
