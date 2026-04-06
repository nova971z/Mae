// ===== INTERACTIVE PAINT CANVAS BACKGROUND =====
(function initPaintCanvas() {
  const canvas = document.getElementById('paintCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let w, h;
  let scrollY = 0;
  let lastScrollY = -1;
  let mouseX = -100, mouseY = -100;
  let animFrame;

  // Paint stroke palette — pastel harmonious colors
  const palette = [
    { r: 196, g: 168, b: 130, a: 0.045 },  // warm brown
    { r: 139, g: 167, b: 199, a: 0.04 },    // soft blue
    { r: 184, g: 169, b: 201, a: 0.035 },   // lavender
    { r: 212, g: 165, b: 165, a: 0.035 },   // rose
    { r: 163, g: 181, b: 160, a: 0.03 },    // sage green
    { r: 182, g: 207, b: 226, a: 0.035 },   // light blue
    { r: 158, g: 124, b: 90,  a: 0.03 },    // deep brown accent
  ];

  // Pre-computed paint strokes to reveal on scroll
  const strokes = [];
  const TOTAL_STROKES = 60;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function generateStrokes() {
    strokes.length = 0;
    const pageH = document.documentElement.scrollHeight;

    for (let i = 0; i < TOTAL_STROKES; i++) {
      const color = palette[Math.floor(Math.random() * palette.length)];
      const yTrigger = (i / TOTAL_STROKES) * pageH;

      // Generate a bezier brush stroke path
      const startX = Math.random() * w;
      const startY = Math.random() * h;
      const spread = 150 + Math.random() * 400;
      const angle = Math.random() * Math.PI * 2;

      const points = [];
      const numPoints = 5 + Math.floor(Math.random() * 6);
      for (let j = 0; j < numPoints; j++) {
        const t = j / (numPoints - 1);
        const drift = (Math.random() - 0.5) * 80;
        points.push({
          x: startX + Math.cos(angle) * spread * t + drift,
          y: startY + Math.sin(angle) * spread * t + (Math.random() - 0.5) * 60
        });
      }

      strokes.push({
        points,
        color,
        lineWidth: 30 + Math.random() * 120,
        yTrigger,
        opacity: 0,
        targetOpacity: 0,
        side: Math.random() > 0.5 ? 1 : -1,
        revealed: false,
        rotateAngle: (Math.random() - 0.5) * 0.3
      });
    }
  }

  function drawBrushStroke(stroke) {
    if (stroke.opacity < 0.002) return;

    const pts = stroke.points;
    if (pts.length < 2) return;

    ctx.save();
    ctx.globalAlpha = stroke.opacity;
    ctx.globalCompositeOperation = 'multiply';

    // Main brush body
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.quadraticCurveTo(
      pts[pts.length - 2].x, pts[pts.length - 2].y,
      pts[pts.length - 1].x, pts[pts.length - 1].y
    );

    ctx.lineWidth = stroke.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const c = stroke.color;
    ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${c.a * 8})`;
    ctx.stroke();

    // Soft glow
    ctx.lineWidth = stroke.lineWidth * 2;
    ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${c.a * 2})`;
    ctx.filter = 'blur(20px)';
    ctx.stroke();
    ctx.filter = 'none';

    ctx.restore();
  }

  // Mouse interaction — subtle watercolor ripple
  let mouseStrokes = [];

  function addMouseRipple(x, y) {
    const color = palette[Math.floor(Math.random() * palette.length)];
    mouseStrokes.push({
      x, y,
      radius: 0,
      maxRadius: 40 + Math.random() * 60,
      opacity: 0.12,
      color
    });
    if (mouseStrokes.length > 8) mouseStrokes.shift();
  }

  function drawMouseRipples() {
    mouseStrokes.forEach((ripple, i) => {
      ripple.radius += (ripple.maxRadius - ripple.radius) * 0.06;
      ripple.opacity *= 0.97;

      if (ripple.opacity < 0.005) {
        mouseStrokes.splice(i, 1);
        return;
      }

      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = ripple.opacity;
      const grad = ctx.createRadialGradient(ripple.x, ripple.y, 0, ripple.x, ripple.y, ripple.radius);
      const c = ripple.color;
      grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},0.3)`);
      grad.addColorStop(0.5, `rgba(${c.r},${c.g},${c.b},0.1)`);
      grad.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function render() {
    scrollY = window.scrollY;
    const pageH = document.documentElement.scrollHeight - window.innerHeight;
    const scrollProgress = pageH > 0 ? scrollY / pageH : 0;

    ctx.clearRect(0, 0, w, h);

    // Update strokes based on scroll
    strokes.forEach(stroke => {
      if (scrollY >= stroke.yTrigger - h * 0.6) {
        stroke.targetOpacity = 1;
      }
      // Smooth fade in
      stroke.opacity += (stroke.targetOpacity - stroke.opacity) * 0.04;

      // Slight parallax shift based on scroll
      const parallaxShift = (scrollY * 0.02) * stroke.side;
      ctx.save();
      ctx.translate(parallaxShift, 0);
      drawBrushStroke(stroke);
      ctx.restore();
    });

    // Mouse ripples
    drawMouseRipples();

    animFrame = requestAnimationFrame(render);
  }

  // Mouse move for ripples (throttled)
  let lastRippleTime = 0;
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    const now = Date.now();
    if (now - lastRippleTime > 120) {
      addMouseRipple(mouseX, mouseY);
      lastRippleTime = now;
    }
  });

  // Init
  resize();
  generateStrokes();
  render();

  window.addEventListener('resize', () => {
    resize();
    generateStrokes();
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

// ===== PARALLAX on hero gradient =====
window.addEventListener('scroll', () => {
  const hero = document.querySelector('.hero-gradient');
  if (hero) {
    const scrollY = window.scrollY;
    hero.style.transform = `translateY(${scrollY * 0.3}px)`;
  }
});
