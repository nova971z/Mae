// ===== INTERACTIVE PAINT CANVAS BACKGROUND =====
(function initPaintCanvas() {
  const canvas = document.getElementById('paintCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });

  // Offscreen buffer for baked strokes (no re-render flicker)
  const offscreen = document.createElement('canvas');
  const offCtx = offscreen.getContext('2d');

  let w, h;
  let currentScrollY = 0;
  let smoothScrollY = 0;
  let mouseX = -200, mouseY = -200;

  const palette = [
    { r: 196, g: 168, b: 130 },  // warm brown
    { r: 139, g: 167, b: 199 },  // soft blue
    { r: 184, g: 169, b: 201 },  // lavender
    { r: 212, g: 165, b: 165 },  // rose
    { r: 163, g: 181, b: 160 },  // sage green
    { r: 182, g: 207, b: 226 },  // light blue
    { r: 210, g: 190, b: 160 },  // sand
  ];

  const strokes = [];
  const TOTAL_STROKES = 45;
  let bakedStrokeCount = 0;

  // Mouse trail
  const trail = [];
  const MAX_TRAIL = 30;
  let lastTrailTime = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    offscreen.width = w * dpr;
    offscreen.height = h * dpr;
    offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Rebake all revealed strokes
    bakedStrokeCount = 0;
    offCtx.clearRect(0, 0, w, h);
    strokes.forEach(s => {
      if (s.baked) {
        s.baked = false;
        s.opacity = 1;
        s.targetOpacity = 1;
      }
    });
  }

  function generateStrokes() {
    strokes.length = 0;
    bakedStrokeCount = 0;
    const pageH = document.documentElement.scrollHeight;

    for (let i = 0; i < TOTAL_STROKES; i++) {
      const color = palette[Math.floor(Math.random() * palette.length)];
      const yTrigger = (i / TOTAL_STROKES) * pageH;

      const startX = Math.random() * w;
      const startY = Math.random() * h;
      const spread = 120 + Math.random() * 350;
      const angle = Math.random() * Math.PI * 2;

      const points = [];
      const numPoints = 4 + Math.floor(Math.random() * 5);
      for (let j = 0; j < numPoints; j++) {
        const t = j / (numPoints - 1);
        const drift = (Math.random() - 0.5) * 70;
        points.push({
          x: startX + Math.cos(angle) * spread * t + drift,
          y: startY + Math.sin(angle) * spread * t + (Math.random() - 0.5) * 50
        });
      }

      strokes.push({
        points,
        color,
        lineWidth: 40 + Math.random() * 100,
        alpha: 0.06 + Math.random() * 0.08,
        yTrigger,
        opacity: 0,
        targetOpacity: 0,
        baked: false,
        parallax: (Math.random() - 0.5) * 0.03
      });
    }
  }

  // Draw a single stroke to a given context
  function drawStrokeTo(target, stroke, alpha) {
    const pts = stroke.points;
    if (pts.length < 2) return;

    target.save();
    target.globalAlpha = alpha;
    target.globalCompositeOperation = 'multiply';
    target.lineCap = 'round';
    target.lineJoin = 'round';

    // Build path once
    target.beginPath();
    target.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      target.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    target.quadraticCurveTo(
      pts[pts.length - 2].x, pts[pts.length - 2].y,
      pts[pts.length - 1].x, pts[pts.length - 1].y
    );

    const c = stroke.color;

    // Soft wide pass (shadow/glow via wider stroke, no filter)
    target.lineWidth = stroke.lineWidth * 1.8;
    target.strokeStyle = `rgba(${c.r},${c.g},${c.b},${stroke.alpha * 0.3})`;
    target.stroke();

    // Main pass
    target.lineWidth = stroke.lineWidth;
    target.strokeStyle = `rgba(${c.r},${c.g},${c.b},${stroke.alpha})`;
    target.stroke();

    target.restore();
  }

  function bakeStroke(stroke) {
    drawStrokeTo(offCtx, stroke, 1);
    stroke.baked = true;
    bakedStrokeCount++;
  }

  function drawTrail() {
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      p.life -= 0.012;
      p.radius += (p.maxRadius - p.radius) * 0.08;

      if (p.life <= 0) {
        trail.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = p.life * 0.15;
      const c = p.color;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
      grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},0.4)`);
      grad.addColorStop(0.6, `rgba(${c.r},${c.g},${c.b},0.1)`);
      grad.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function render() {
    // Smooth scroll interpolation (kills jitter)
    currentScrollY = window.scrollY;
    smoothScrollY += (currentScrollY - smoothScrollY) * 0.12;

    ctx.clearRect(0, 0, w, h);

    // 1) Draw the offscreen baked strokes (zero cost, single drawImage)
    const parallaxY = smoothScrollY * 0.015;
    ctx.save();
    ctx.translate(0, -parallaxY);
    ctx.drawImage(offscreen, 0, 0, w, h);
    ctx.restore();

    // 2) Animate & bake newly revealed strokes
    let needsDraw = false;
    strokes.forEach(stroke => {
      if (stroke.baked) return;

      if (currentScrollY >= stroke.yTrigger - h * 0.7) {
        stroke.targetOpacity = 1;
      }

      if (stroke.targetOpacity > 0) {
        stroke.opacity += (stroke.targetOpacity - stroke.opacity) * 0.05;

        if (stroke.opacity > 0.95) {
          // Fully revealed → bake to offscreen and stop per-frame rendering
          stroke.opacity = 1;
          bakeStroke(stroke);
        } else {
          // Still fading in → draw on main canvas
          const px = smoothScrollY * stroke.parallax;
          ctx.save();
          ctx.translate(px, -parallaxY);
          drawStrokeTo(ctx, stroke, stroke.opacity);
          ctx.restore();
          needsDraw = true;
        }
      }
    });

    // 3) Mouse trail
    if (trail.length > 0) {
      drawTrail();
      needsDraw = true;
    }

    requestAnimationFrame(render);
  }

  // Mouse interaction
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    const now = Date.now();
    if (now - lastTrailTime > 60) {
      trail.push({
        x: mouseX,
        y: mouseY,
        radius: 2,
        maxRadius: 25 + Math.random() * 40,
        life: 1,
        color: palette[Math.floor(Math.random() * palette.length)]
      });
      if (trail.length > MAX_TRAIL) trail.shift();
      lastTrailTime = now;
    }
  });

  // Init
  resize();
  generateStrokes();
  render();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      generateStrokes();
    }, 200);
  });
})();

// ===== LOADER =====
window.addEventListener('load', () => {
  const loader = document.getElementById('loader');
  const fill = document.getElementById('loaderFill');
  let progress = 0;

  const interval = setInterval(() => {
    progress += Math.random() * 25 + 10;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      setTimeout(() => loader.classList.add('hidden'), 300);
    }
    fill.style.width = progress + '%';
  }, 200);
});

// ===== CUSTOM CURSOR =====
const dot = document.getElementById('cursorDot');
const ring = document.getElementById('cursorRing');

if (dot && ring && window.matchMedia('(pointer: fine)').matches) {
  let mouseX = 0, mouseY = 0;
  let ringX = 0, ringY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.transform = `translate(${mouseX - 4}px, ${mouseY - 4}px)`;
  });

  function animateRing() {
    ringX += (mouseX - 20 - ringX) * 0.15;
    ringY += (mouseY - 20 - ringY) * 0.15;
    ring.style.transform = `translate(${ringX}px, ${ringY}px)`;
    requestAnimationFrame(animateRing);
  }
  animateRing();

  // Hover effect on interactive elements
  const hoverTargets = document.querySelectorAll('a, button, input, select, textarea, .service-card');
  hoverTargets.forEach(el => {
    el.addEventListener('mouseenter', () => ring.classList.add('hover'));
    el.addEventListener('mouseleave', () => ring.classList.remove('hover'));
  });
}

// ===== PARTICLES =====
const particlesContainer = document.getElementById('particles');
if (particlesContainer) {
  for (let i = 0; i < 50; i++) {
    const particle = document.createElement('div');
    particle.classList.add('particle');
    particle.style.left = Math.random() * 100 + '%';
    particle.style.top = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 4 + 's';
    particle.style.animationDuration = (3 + Math.random() * 3) + 's';
    particlesContainer.appendChild(particle);
  }
}

// ===== NAVIGATION =====
const nav = document.getElementById('nav');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

// Scroll effect
let lastScroll = 0;
window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  if (scrollY > 50) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
  lastScroll = scrollY;
});

// Mobile toggle
navToggle.addEventListener('click', () => {
  navToggle.classList.toggle('active');
  navLinks.classList.toggle('open');
});

// Close mobile nav on link click
navLinks.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    navToggle.classList.remove('active');
    navLinks.classList.remove('open');
  });
});

// ===== REVEAL ON SCROLL =====
const revealElements = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

revealElements.forEach(el => revealObserver.observe(el));

// ===== SERVICE CARDS MOUSE FOLLOW =====
document.querySelectorAll('.service-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mouse-x', x + '%');
    card.style.setProperty('--mouse-y', y + '%');
  });
});

// ===== COUNTER ANIMATION =====
const statNumbers = document.querySelectorAll('.stat-number');
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const target = parseInt(el.dataset.target);
      animateCounter(el, target);
      counterObserver.unobserve(el);
    }
  });
}, { threshold: 0.5 });

statNumbers.forEach(el => counterObserver.observe(el));

function animateCounter(el, target) {
  const duration = 2000;
  const start = performance.now();

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(ease * target);
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// ===== TEMOIGNAGES CAROUSEL =====
const track = document.getElementById('temoignagesTrack');
const prevBtn = document.getElementById('temoPrev');
const nextBtn = document.getElementById('temoNext');

if (track && prevBtn && nextBtn) {
  let currentSlide = 0;

  function getVisibleCount() {
    if (window.innerWidth <= 580) return 1;
    if (window.innerWidth <= 968) return 2;
    return 3;
  }

  function getTotalSlides() {
    return track.children.length;
  }

  function getMaxSlide() {
    return Math.max(0, getTotalSlides() - getVisibleCount());
  }

  function updateCarousel() {
    const cardWidth = track.children[0].offsetWidth + 24; // gap
    track.style.transform = `translateX(-${currentSlide * cardWidth}px)`;
  }

  prevBtn.addEventListener('click', () => {
    currentSlide = Math.max(0, currentSlide - 1);
    updateCarousel();
  });

  nextBtn.addEventListener('click', () => {
    currentSlide = Math.min(getMaxSlide(), currentSlide + 1);
    updateCarousel();
  });

  window.addEventListener('resize', () => {
    currentSlide = Math.min(currentSlide, getMaxSlide());
    updateCarousel();
  });
}

// ===== PERFORMANCE TABS =====
const perfTabs = document.querySelectorAll('.perf-tab');
const perfPanels = document.querySelectorAll('.perf-panel');

perfTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;

    perfTabs.forEach(t => t.classList.remove('active'));
    perfPanels.forEach(p => p.classList.remove('active'));

    tab.classList.add('active');
    const panel = document.getElementById('panel-' + target);
    if (panel) {
      panel.classList.add('active');
      // Trigger animations for newly visible panel
      animatePanel(target);
    }
  });
});

// ===== CHART ANIMATIONS =====
function animateLineChart() {
  const goldLine = document.querySelector('.chart-line-gold');
  const areaFill = document.querySelector('.chart-area-fill');
  const dots = document.querySelectorAll('.chart-dot');

  if (goldLine) goldLine.classList.add('animate');
  if (areaFill) areaFill.classList.add('animate');
  dots.forEach(d => d.classList.add('animate'));
}

function animateBarChart() {
  const bars = document.querySelectorAll('.bar-gold');
  bars.forEach(bar => {
    const targetY = bar.getAttribute('data-target-y');
    const targetH = bar.getAttribute('data-target-h');
    if (targetY && targetH) {
      bar.setAttribute('y', targetY);
      bar.setAttribute('height', targetH);
    }
  });
}

function animateKPIs(panel) {
  const kpis = panel.querySelectorAll('.perf-kpi-value');
  kpis.forEach(el => {
    const target = parseInt(el.dataset.target);
    if (target) animateCounter(el, target);
  });

  const bars = panel.querySelectorAll('.perf-kpi-bar-fill');
  bars.forEach(bar => {
    const w = bar.dataset.width;
    if (w) {
      bar.classList.add('animate');
      bar.style.width = w + '%';
    }
  });
}

function animateNewServiceBars() {
  document.querySelectorAll('.new-service-bar-fill').forEach(bar => {
    const w = bar.dataset.width;
    if (w) bar.style.width = w + '%';
  });
}

function animateRevenueCounter() {
  const el = document.getElementById('revenueCounter');
  if (el) {
    const target = 1480;
    const duration = 2500;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(ease * target).toLocaleString('fr-FR');
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  // Animate gauge
  const gauge = document.querySelector('.gauge-fill');
  if (gauge) {
    setTimeout(() => {
      gauge.style.strokeDashoffset = '60';
    }, 300);
  }
}

function animatePanel(panelName) {
  const panel = document.getElementById('panel-' + panelName);
  if (!panel) return;

  if (panelName === 'temps') {
    animateLineChart();
    animateKPIs(panel);
  } else if (panelName === 'revenus') {
    animateBarChart();
    animateKPIs(panel);
  } else if (panelName === 'services') {
    animateNewServiceBars();
    animateRevenueCounter();
    animateKPIs(panel);
  }
}

// Trigger first panel animation on scroll
const perfSection = document.getElementById('performances');
if (perfSection) {
  const perfObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animatePanel('temps');
        perfObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  perfObserver.observe(perfSection);
}

// ===== CHART TOOLTIP (hover on dots) =====
const chartDots = document.querySelectorAll('.chart-dot');
const chartTooltip = document.getElementById('chartTooltip');
const tooltipData = ['5h récupérées', '15h récupérées', '25h récupérées', '33h récupérées', '40h+ récupérées'];

chartDots.forEach((dot, i) => {
  dot.style.cursor = 'pointer';
  dot.style.pointerEvents = 'all';

  dot.addEventListener('mouseenter', (e) => {
    if (chartTooltip) {
      chartTooltip.textContent = tooltipData[i] || '';
      chartTooltip.style.opacity = '1';
      const rect = dot.closest('.chart-container').getBoundingClientRect();
      const cx = parseFloat(dot.getAttribute('cx'));
      const cy = parseFloat(dot.getAttribute('cy'));
      const svgRect = dot.closest('svg').getBoundingClientRect();
      const scaleX = svgRect.width / 600;
      const scaleY = svgRect.height / 300;
      chartTooltip.style.left = (cx * scaleX - 40) + 'px';
      chartTooltip.style.top = (cy * scaleY - 40) + 'px';
    }
  });

  dot.addEventListener('mouseleave', () => {
    if (chartTooltip) chartTooltip.style.opacity = '0';
  });
});

// ===== NEW SERVICE ITEMS HOVER - live revenue update =====
const serviceItems = document.querySelectorAll('.new-service-item');
serviceItems.forEach(item => {
  item.addEventListener('mouseenter', () => {
    item.style.borderColor = 'rgba(74, 222, 128, 0.3)';
  });
  item.addEventListener('mouseleave', () => {
    item.style.borderColor = '';
  });
});

// ===== SMOOTH SCROLL =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ===== CONTACT FORM =====
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const btn = contactForm.querySelector('button[type="submit"]');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span>Message envoyé !</span>';
    btn.style.background = 'linear-gradient(135deg, #4ade80, #22c55e)';

    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
      contactForm.reset();
    }, 3000);
  });
}

// ===== MAGNETIC BUTTONS =====
document.querySelectorAll('.btn').forEach(btn => {
  btn.addEventListener('mousemove', (e) => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
  });

  btn.addEventListener('mouseleave', () => {
    btn.style.transform = '';
  });
});

// ===== TILT EFFECT on service cards =====
document.querySelectorAll('[data-tilt]').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const tiltX = (y - 0.5) * 8;
    const tiltY = (x - 0.5) * -8;
    card.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-4px)`;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});

// ===== TEXT SCRAMBLE on hero badge =====
const heroBadge = document.querySelector('.hero-badge');
if (heroBadge) {
  const originalText = heroBadge.textContent;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  function scrambleText(el, finalText) {
    let iteration = 0;
    const interval = setInterval(() => {
      el.textContent = finalText
        .split('')
        .map((char, i) => {
          if (i < iteration) return finalText[i];
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join('');

      if (iteration >= finalText.length) clearInterval(interval);
      iteration += 1/2;
    }, 40);
  }

  // Run once after loader
  setTimeout(() => scrambleText(heroBadge, originalText), 1800);
}

// ===== SMOOTH PARALLAX ENGINE =====
(function initParallax() {
  let ticking = false;
  let smoothScroll = 0;
  const heroGradient = document.querySelector('.hero-gradient');
  const heroContent = document.querySelector('.hero-content');
  const heroScroll = document.querySelector('.hero-scroll');
  const aboutBgText = document.querySelector('.about-bg-text');
  const sections = document.querySelectorAll('section');

  function updateParallax() {
    const scrollY = window.scrollY;
    smoothScroll += (scrollY - smoothScroll) * 0.1;
    const vh = window.innerHeight;

    // Hero parallax — content fades and floats up
    if (heroGradient) {
      heroGradient.style.transform = `translateY(${smoothScroll * 0.25}px)`;
    }
    if (heroContent) {
      const heroProgress = Math.min(smoothScroll / vh, 1);
      heroContent.style.transform = `translateY(${smoothScroll * 0.15}px)`;
      heroContent.style.opacity = 1 - heroProgress * 1.2;
    }
    if (heroScroll) {
      heroScroll.style.opacity = 1 - Math.min(smoothScroll / (vh * 0.3), 1);
    }

    // About background text parallax
    if (aboutBgText) {
      const rect = aboutBgText.closest('section').getBoundingClientRect();
      const progress = -rect.top / vh;
      aboutBgText.style.transform = `translate(-50%, -50%) translateX(${progress * 60}px)`;
    }

    // Section scale-in effect
    sections.forEach(section => {
      const rect = section.getBoundingClientRect();
      const visible = rect.top < vh && rect.bottom > 0;
      if (visible) {
        const entry = Math.max(0, 1 - rect.top / vh);
        const scale = 0.97 + Math.min(entry, 1) * 0.03;
        section.style.transform = `scale(${scale})`;
        section.style.transformOrigin = 'center top';
      }
    });

    requestAnimationFrame(updateParallax);
  }

  updateParallax();
})();

// ===== HERO TEXT STAGGER ANIMATION =====
(function initHeroAnimation() {
  const lines = document.querySelectorAll('.hero-title-line');
  const subtitle = document.querySelector('.hero-subtitle');
  const actions = document.querySelector('.hero-actions');
  const badge = document.querySelector('.hero-badge');

  // Wait for loader to finish
  setTimeout(() => {
    if (badge) {
      badge.style.transition = 'opacity 0.8s, transform 0.8s';
      badge.style.opacity = '1';
      badge.style.transform = 'translateY(0)';
    }
    lines.forEach((line, i) => {
      setTimeout(() => {
        line.classList.add('hero-line-visible');
      }, 200 + i * 200);
    });
    if (subtitle) {
      setTimeout(() => subtitle.classList.add('hero-fade-in'), 700);
    }
    if (actions) {
      setTimeout(() => actions.classList.add('hero-fade-in'), 900);
    }
  }, 1600);
})();

// ===== SMOOTH NUMBER TICKER (for stats on re-count) =====
function smoothTick(el, from, to, duration) {
  const start = performance.now();
  const formatter = new Intl.NumberFormat('fr-FR');

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 4);
    const current = Math.round(from + (to - from) * ease);
    el.textContent = formatter.format(current);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}
