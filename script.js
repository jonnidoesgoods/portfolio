const cursor = document.querySelector('.cursor');
const work = document.querySelector('.work');
const projectIndex = document.querySelector('.project-index');
const continuousRail = document.querySelector('.continuous-rail');
let lastPointerY = null;
let pointerInsideWork = false;

function buildContinuousRail() {
  if (!projectIndex || !continuousRail) return;

  const height = projectIndex.offsetHeight;
  const spacing = 27;
  const start = 13.5;
  const needed = Math.max(0, Math.ceil((height - start) / spacing));
  const ticks = Array.from(continuousRail.querySelectorAll('.rail-tick'));

  // Reconcile ticks in place instead of clearing the rail.
  // This prevents the yellow wave from disappearing while a project
  // is expanding and ResizeObserver fires repeatedly.
  for (let i = ticks.length; i < needed; i++) {
    const tick = document.createElement('i');
    tick.className = 'rail-tick';
    continuousRail.appendChild(tick);
    ticks.push(tick);
  }
  while (ticks.length > needed) {
    ticks.pop().remove();
  }
  ticks.forEach((tick, i) => {
    tick.style.top = `${start + i * spacing}px`;
  });

  if (pointerInsideWork && lastPointerY !== null) {
    updateWave(lastPointerY);
  }
}

function resetWave() {
  if (!continuousRail) return;
  continuousRail.querySelectorAll('.rail-tick').forEach(tick => {
    tick.style.width = '13px';
    tick.style.height = '1px';
    tick.style.background = 'rgba(23,59,99,.35)';
  });
}

function updateWave(clientY) {
  if (!continuousRail) return;
  continuousRail.querySelectorAll('.rail-tick').forEach(tick => {
    const rect = tick.getBoundingClientRect();
    const tickY = rect.top + rect.height / 2;
    const distance = Math.abs(clientY - tickY);

    const influence = Math.max(0, 1 - distance / 95);
    const eased = influence * influence * (3 - 2 * influence);

    const width = 13 + eased * 23;

    const thickness = 1 + eased * 2;

    tick.style.width = `${width}px`;
    tick.style.height = `${thickness}px`;

    // Color is binary: navy at rest, yellow whenever the tick belongs to the wave.
    // The wave's hierarchy is expressed only through width and thickness.
    if (influence > 0) {
      tick.style.background = '#FFB800';
    } else {
      tick.style.background = 'rgba(23,59,99,.35)';
    }
  });
}

buildContinuousRail();

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(buildContinuousRail, 80);
});

// The project index changes height when an item expands.
// Rebuild the single rail after layout changes so spacing stays continuous.
if (projectIndex && 'ResizeObserver' in window) {
  const observer = new ResizeObserver(() => buildContinuousRail());
  observer.observe(projectIndex);
}

if (window.matchMedia('(pointer:fine)').matches) {
  if (cursor) {
    window.addEventListener('mousemove', e => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    });

    document.querySelectorAll('a:not(.next-project), button, .project, .archive-card, .archive-filter, .archive-object-stage, .next-project > span, .next-project > strong').forEach(el => {
      el.addEventListener('mouseenter', () => cursor.classList.add('is-hover'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('is-hover'));
    });
  }

  if (work) {
    work.addEventListener('mouseenter', e => {
      pointerInsideWork = true;
      lastPointerY = e.clientY;
      updateWave(lastPointerY);
    });

    work.addEventListener('mousemove', e => {
      pointerInsideWork = true;
      lastPointerY = e.clientY;
      updateWave(lastPointerY);
    });

    work.addEventListener('mouseleave', () => {
      pointerInsideWork = false;
      lastPointerY = null;
      resetWave();
    });
  }
}

// Compact live UI detail.
const localTime = document.querySelector('#local-time');
function updateLocalTime(){
  if(!localTime) return;
  const now = new Date();
  localTime.textContent = new Intl.DateTimeFormat('en-GB',{
    hour:'2-digit',
    minute:'2-digit',
    hour12:false
  }).format(now);
}
updateLocalTime();
setInterval(updateLocalTime,1000);

const focusMode = document.querySelector('#focus-mode');
if (focusMode) {
  const modes = ['EDITORIAL','VISUAL','RESEARCH'];
  let focusIndex = 0;
  setInterval(() => {
    focusIndex = (focusIndex + 1) % modes.length;
    focusMode.animate(
      [{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-3px)'},{opacity:0,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],
      {duration:420,easing:'ease'}
    );
    setTimeout(() => { focusMode.textContent = modes[focusIndex]; }, 210);
  }, 2600);
}

// Archive filters
const archiveFilters = document.querySelectorAll('.archive-filter');
const archiveCards = document.querySelectorAll('.archive-card');
const archiveCount = document.querySelector('#archive-count');

archiveFilters.forEach(button => {
  button.addEventListener('click', () => {
    archiveFilters.forEach(b => b.classList.remove('is-active'));
    button.classList.add('is-active');
    const filter = button.dataset.filter;
    const archiveGrid = document.querySelector('.archive-grid');
    if (archiveGrid) archiveGrid.classList.toggle('is-filtered', filter !== 'all');
    let visible = 0;
    archiveCards.forEach(card => {
      const show = filter === 'all' || card.dataset.category === filter;
      card.classList.toggle('is-hidden', !show);
      if(show) visible++;
    });
    if(archiveCount) archiveCount.textContent = String(visible).padStart(2,'0');
  });
});

// The feature publication reacts subtly to pointer position.
const feature = document.querySelector('.archive-card--feature');
const miniBook = document.querySelector('.mini-book');
if(feature && miniBook && window.matchMedia('(pointer:fine)').matches){
  feature.addEventListener('mousemove', e => {
    const r = feature.getBoundingClientRect();
    const x = (e.clientX-r.left)/r.width-.5;
    const y = (e.clientY-r.top)/r.height-.5;
    miniBook.style.transform = `rotateX(${-8-y*6}deg) rotateY(${-24+x*18}deg) rotateZ(${2+x*2}deg)`;
  });
  feature.addEventListener('mouseleave', () => {
    miniBook.style.transform = '';
  });
}

(() => {
 const title=document.querySelector('.dynamic-hero-name'); if(!title)return;
 const original='GIANMARCO FABENI'; title.textContent='';
 for(const c of original){
   if(c===' '){const s=document.createElement('span');s.className='hero-space';title.appendChild(s);continue}
   const el=document.createElement('span');el.className='hero-char';el.textContent=c;el.dataset.original=c;title.appendChild(el);
   el.addEventListener('mouseenter',()=>{
     clearTimeout(el._restoreTimer);clearTimeout(el._exitTimer);
     el.classList.remove('hero-exiting','hero-thin','hero-regular','hero-bold','hero-active');
     const variants=['hero-thin','hero-regular','hero-bold'];
     const available=variants.filter(v=>v!==el.dataset.lastWeight);
     const weight=available[Math.floor(Math.random()*available.length)];
     el.dataset.lastWeight=weight;
     el.textContent=el.dataset.original.toLowerCase();
     requestAnimationFrame(()=>el.classList.add(weight,'hero-active'));
   });
   el.addEventListener('mouseleave',()=>{
     el.classList.remove('hero-active');el.classList.add('hero-exiting');
     el._restoreTimer=setTimeout(()=>{
       el.textContent=el.dataset.original;
       el.classList.remove('hero-thin','hero-regular','hero-bold');
       el._exitTimer=setTimeout(()=>el.classList.remove('hero-exiting'),760);
     },110);
   });
 }
})();
