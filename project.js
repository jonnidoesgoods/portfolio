/* ================================================================
   V15 — CONTENT-DRIVEN HORIZONTAL STORY
   Every chapter uses its measured width. Research is the only nested hold.
   ================================================================ */
(() => {
  const section = document.querySelector('.story-index');
  const rail = document.querySelector('.reader-track');
  const reader = document.querySelector('.reader-head');
  const readerLine = document.querySelector('.reader-head > i');
  const readerLabel = document.querySelector('.reader-label');
  const content = document.querySelector('.story-content-track');
  const researchWindow = document.querySelector('.research-window');
  const researchDeck = document.querySelector('.research-deck');
  const researchPages = [...document.querySelectorAll('.research-page')];
  const researchDots = [...document.querySelectorAll('.research-progress button')];

  if (!section || !rail || !reader || !readerLine || !readerLabel || !content) return;

  const chapters = [...content.querySelectorAll('.story-content')].map((panel, index) => {
    const label = panel.querySelector('.story-eyebrow')?.textContent || '';
    return { num:String(index + 1).padStart(2, '0'), name:label.replace(/^\d+\s*\/\s*/, '').trim() };
  });
  if (!chapters.length) return;

  const TARGET_PITCH = 27;
  const WAVE_RADIUS = 95;
  const BASE_LENGTH = 13;
  const BASE_THICKNESS = 1;
  const CHAPTER_LENGTH = 30;
  const CHAPTER_THICKNESS = 1.5;
  const RESEARCH_CHAPTER = [...content.children].findIndex(panel => panel.classList.contains('research-content'));

  let panels = [];
  let panelMarkers = [];
  let ticks = [];
  let chapterPositions = [];
  let baseTravel = 0;
  let researchLockX = 0;
  let researchStep = 0;
  let researchSlideHold = 0;
  let researchExitPause = 0;
  let researchHold = 0;
  let currentChapter = -1;
  let isScrolling = false;
  let scrollIdleTimer = 0;
  let settleTimer = 0;
  let previousX = null;
  let currentResearchPage = 0;
  let resizeFrame = 0;
  let researchWheelLocked = false;
  let researchWheelTimer = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(value) {
    return value * value * (3 - 2 * value);
  }

  function localScroll() {
    const rect = section.getBoundingClientRect();
    const travel = Math.max(1, section.offsetHeight - window.innerHeight);
    return clamp(-rect.top, 0, travel);
  }

  function mapScroll(scrollPosition) {
    if (!researchHold || scrollPosition <= researchLockX) {
      return { x:clamp(scrollPosition, 0, baseTravel), researchProgress:0 };
    }

    if (scrollPosition <= researchLockX + researchHold) {
      return {
        x:researchLockX,
        researchProgress:researchSlideHold
          ? Math.min(1, (scrollPosition - researchLockX) / researchSlideHold)
          : 1
      };
    }

    return {
      x:clamp(scrollPosition - researchHold, 0, baseTravel),
      researchProgress:1
    };
  }

  function createTick(left, className = '') {
    const slot = document.createElement('span');
    slot.className = 'rail-slot';
    slot.style.left = `${left}px`;

    const tick = document.createElement('i');
    tick.className = `reader-tick ${className}`.trim();
    slot.appendChild(tick);
    rail.appendChild(slot);
    return tick;
  }

  function measureChapterPositions() {
    panels = [...content.querySelectorAll('.story-content')];
    chapterPositions = panels.map(panel => {
      const eyebrow = panel.querySelector('.story-eyebrow');
      return panel.offsetLeft + (eyebrow?.offsetLeft || 0);
    });

    const researchPanel = panels[RESEARCH_CHAPTER];
    researchLockX = researchPanel ? researchPanel.offsetLeft : 0;
    baseTravel = Math.max(0, content.scrollWidth - window.innerWidth);

    // Each Research change takes a little over half a viewport of vertical
    // input: deliberate enough to feel like a slide, without a dead zone.
    researchStep = Math.min(520, Math.max(340, window.innerHeight * .56));
    researchSlideHold = Math.max(0, researchPages.length - 1) * researchStep;
    researchExitPause = Math.min(240, Math.max(170, window.innerHeight * .22));
    researchHold = researchPages.length ? researchSlideHold + researchExitPause : 0;
  }

  function buildRail() {
    measureChapterPositions();
    rail.textContent = '';

    const contentWidth = Math.max(content.scrollWidth, window.innerWidth);
    const lead = window.innerWidth;
    const tail = window.innerWidth;

    for (let left = -lead; left <= contentWidth + tail; left += TARGET_PITCH) {
      createTick(left);
    }

    panelMarkers = chapterPositions.map((position, index) => {
      const tick = createTick(position, 'chapter-marker');
      tick.dataset.chapter = String(index);
      return tick;
    });

    rail.style.width = `${contentWidth + tail}px`;
    ticks = [...rail.querySelectorAll('.reader-tick')];

    // One vertical pixel advances one actual horizontal pixel. The only
    // additional distance is the explicit nested Research sequence.
    const totalTravel = baseTravel + researchHold;
    section.style.setProperty('height', `${Math.ceil(window.innerHeight + totalTravel)}px`, 'important');
  }

  function setResearchPage(index, animate = true) {
    if (!researchDeck || !researchWindow || !researchPages.length) return;

    const activePage = clamp(index, 0, researchPages.length - 1);
    const deckGap = parseFloat(getComputedStyle(researchDeck).columnGap) || 0;
    const pageStep = researchWindow.clientWidth + deckGap;

    researchDeck.classList.toggle('is-jumping', !animate);
    researchDeck.style.transform = `translate3d(${-activePage * pageStep}px,0,0)`;
    researchDots.forEach((dot, dotIndex) => {
      const selected = dotIndex === activePage;
      dot.classList.toggle('is-active', selected);
      dot.setAttribute('aria-current', selected ? 'true' : 'false');
    });
    currentResearchPage = activePage;

    if (!animate) {
      requestAnimationFrame(() => researchDeck.classList.remove('is-jumping'));
    }
  }

  function updateActiveChapter(x) {
    const activationX = x + window.innerWidth * .5;
    let activeIndex = 0;

    chapterPositions.forEach((position, index) => {
      if (position <= activationX) activeIndex = index;
    });

    activeIndex = clamp(activeIndex, 0, chapters.length - 1);
    if (activeIndex === currentChapter) return;

    currentChapter = activeIndex;
    readerLabel.querySelector('span').textContent = chapters[activeIndex].num;
    readerLabel.querySelector('strong').textContent = chapters[activeIndex].name;
  }

  function updateWave(trackMotion, x, researchChanged) {
    const delta = previousX === null ? 0 : Math.abs(x - previousX);
    previousX = x;

    if (trackMotion && Math.max(delta, researchChanged ? window.innerWidth : 0) > .08) {
      isScrolling = true;
      rail.parentElement.classList.remove('wave-settling');
      window.clearTimeout(scrollIdleTimer);
      window.clearTimeout(settleTimer);

      scrollIdleTimer = window.setTimeout(() => {
        isScrolling = false;
        rail.parentElement.classList.add('wave-settling');
        render(false);
        settleTimer = window.setTimeout(() => {
          rail.parentElement.classList.remove('wave-settling');
        }, 300);
      }, 140);
    }

    const readerX = window.innerWidth / 2;
    const yellowHeight = readerLine.getBoundingClientRect().height;

    ticks.forEach(tick => {
      const rect = tick.getBoundingClientRect();
      const tickX = rect.left + rect.width / 2;
      const influence = isScrolling
        ? Math.max(0, 1 - Math.abs(readerX - tickX) / WAVE_RADIUS)
        : 0;
      const eased = smoothstep(influence);
      const isChapter = tick.classList.contains('chapter-marker');
      const baseLength = isChapter ? CHAPTER_LENGTH : BASE_LENGTH;
      const baseThickness = isChapter ? CHAPTER_THICKNESS : BASE_THICKNESS;

      tick.style.setProperty('height', `${baseLength + eased * (yellowHeight - baseLength)}px`, 'important');
      tick.style.setProperty('width', `${baseThickness + eased * (3 - baseThickness)}px`, 'important');
      tick.style.setProperty(
        'background',
        influence > 0 ? '#FFB800' : (isChapter ? 'rgba(23,59,99,.82)' : 'rgba(23,59,99,.35)'),
        'important'
      );
    });
  }

  function render(trackMotion = false) {
    if (!ticks.length) return;

    const mapped = mapScroll(localScroll());
    const researchPage = clamp(
      Math.round(mapped.researchProgress * Math.max(0, researchPages.length - 1)),
      0,
      Math.max(0, researchPages.length - 1)
    );
    const researchChanged = researchPage !== currentResearchPage;

    content.style.transform = `translate3d(${-mapped.x}px,0,0)`;
    rail.style.transform = `translate3d(${-mapped.x}px,0,0)`;

    if (researchChanged || !researchDeck?.style.transform) {
      setResearchPage(researchPage, true);
    }

    updateActiveChapter(mapped.x);
    updateWave(trackMotion, mapped.x, researchChanged);
  }

  function rebuild() {
    buildRail();
    setResearchPage(currentResearchPage, false);
    render(false);
  }

  function scrollToResearchPage(index, behavior = 'smooth') {
    const livePanels = [...content.querySelectorAll('.story-content')];
    const liveResearchX = livePanels[RESEARCH_CHAPTER]?.offsetLeft ?? researchLockX;
    const sectionTop = window.scrollY + section.getBoundingClientRect().top;
    const targetIndex = clamp(index, 0, researchPages.length - 1);
    window.scrollTo({
      top:sectionTop + liveResearchX + targetIndex * researchStep,
      behavior
    });
  }

  function scrollToResearchOffset(offset, behavior = 'smooth') {
    const livePanels = [...content.querySelectorAll('.story-content')];
    const liveResearchX = livePanels[RESEARCH_CHAPTER]?.offsetLeft ?? researchLockX;
    const sectionTop = window.scrollY + section.getBoundingClientRect().top;
    window.scrollTo({
      top:sectionTop + liveResearchX + offset,
      behavior
    });
  }

  function handleResearchWheel(event) {
    if (!researchPages.length || Math.abs(event.deltaY) < 4) return;

    const position = localScroll();
    const direction = event.deltaY > 0 ? 1 : -1;
    const lastPage = researchPages.length - 1;
    const holdEnd = researchLockX + researchHold;
    const approach = 90;

    const approachingForward = direction > 0
      && position >= researchLockX - approach
      && position < researchLockX;
    const approachingBackward = direction < 0
      && position > holdEnd
      && position <= holdEnd + approach;
    const insideResearch = position >= researchLockX && position <= holdEnd;

    if (!approachingForward && !approachingBackward && !insideResearch) return;

    const pageAtPosition = clamp(
      Math.round((position - researchLockX) / Math.max(1, researchStep)),
      0,
      lastPage
    );

    // The first page releases naturally toward the previous chapter. The
    // fourth page gets one short, explicit hold before horizontal motion resumes.
    if (insideResearch && direction < 0 && pageAtPosition === 0) return;
    if (insideResearch && direction > 0 && pageAtPosition === lastPage) {
      if (position >= holdEnd - 1) return;

      event.preventDefault();
      if (researchWheelLocked) return;
      researchWheelLocked = true;
      window.clearTimeout(researchWheelTimer);
      scrollToResearchOffset(researchHold);
      researchWheelTimer = window.setTimeout(() => {
        researchWheelLocked = false;
      }, 620);
      return;
    }

    event.preventDefault();
    if (researchWheelLocked) return;

    researchWheelLocked = true;
    window.clearTimeout(researchWheelTimer);

    let targetPage = pageAtPosition + direction;
    if (approachingForward) targetPage = 0;
    if (approachingBackward) targetPage = lastPage;
    scrollToResearchPage(targetPage);

    researchWheelTimer = window.setTimeout(() => {
      researchWheelLocked = false;
    }, 620);
  }

  researchDots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      scrollToResearchPage(index);
    });
  });

  buildRail();
  setResearchPage(0, false);
  readerLabel.querySelector('span').textContent = chapters[0].num;
  readerLabel.querySelector('strong').textContent = chapters[0].name;

  requestAnimationFrame(() => render(false));
  window.addEventListener('scroll', () => render(true), { passive:true });
  window.addEventListener('wheel', handleResearchWheel, { passive:false });
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(rebuild);
  });

  if (document.fonts?.ready) document.fonts.ready.then(rebuild);
})();
