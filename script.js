/* ============================================================
   AIBNKO - landing interactions
   ============================================================ */
(function () {
  "use strict";

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. VIDEO MOUSE-SCRUBBING ----------
     Maps the cursor's horizontal position to the video timeline so the
     subject's head turns to follow the user. The clip is re-encoded as
     all-intra (every frame a keyframe) so arbitrary seeks are instant. */
  const video = document.getElementById("scrubVideo");
  const portrait = document.getElementById("portrait");

  if (video) {
    let duration = 0;
    let target = 0;      // desired time (driven by the mouse)
    let current = 0;     // smoothed time actually shown
    let ready = false;
    let seeking = false;
    let rafId = null;

    // Keep the video paused - we drive frames manually.
    video.pause();

    const onMeta = () => {
      duration = video.duration || 0;
      ready = duration > 0;
      // Nudge a frame onto the canvas so we don't sit on the poster only.
      try { video.currentTime = 0.001; } catch (e) {}
      // Start centered.
      target = current = duration * 0.5;
      if (!prefersReduced) loop();
    };

    if (video.readyState >= 1) onMeta();
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("seeked", () => { seeking = false; });

    // Map pointer X (full viewport) -> timeline. Cursor right => faces forward.
    function setTargetFromX(clientX) {
      if (!ready) return;
      const ratio = Math.min(1, Math.max(0, clientX / window.innerWidth));
      target = ratio * duration;
    }

    window.addEventListener("mousemove", (e) => setTargetFromX(e.clientX), { passive: true });
    window.addEventListener(
      "touchmove",
      (e) => { if (e.touches[0]) setTargetFromX(e.touches[0].clientX); },
      { passive: true }
    );

    // Smoothly ease the shown frame toward the target each animation frame.
    function loop() {
      rafId = requestAnimationFrame(loop);
      if (!ready) return;
      current += (target - current) * 0.16;        // easing factor
      if (Math.abs(target - current) < 0.002) current = target;
      // Only issue a new seek once the previous one resolved (avoids jank).
      if (!seeking && Math.abs(video.currentTime - current) > 0.004) {
        seeking = true;
        try { video.currentTime = current; } catch (e) { seeking = false; }
      }
    }

    // Graceful fallback: if reduced-motion is on, just gently loop the clip.
    if (prefersReduced) {
      video.setAttribute("loop", "");
      video.muted = true;
      video.play().catch(() => {});
    }

    // Hide the "move your cursor" hint after the first real interaction.
    const hint = document.getElementById("scrubHint");
    let hinted = false;
    window.addEventListener("mousemove", () => {
      if (hinted || !hint) return;
      hinted = true;
      hint.style.transition = "opacity .6s ease";
      hint.style.opacity = "0.45";
    }, { passive: true, once: false });

    // Pause the rAF loop when the portrait is far off-screen (perf).
    if ("IntersectionObserver" in window && portrait) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { if (!rafId && !prefersReduced) loop(); }
          else if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        });
      }, { rootMargin: "200px" });
      io.observe(portrait);
    }
  }

  /* ---------- 2. NAV SCROLL STATE ---------- */
  const nav = document.getElementById("nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- 3. KPI COUNT-UP ---------- */
  const nums = document.querySelectorAll(".kpi__num[data-target]");
  function animateNum(el) {
    const targetVal = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || "";
    const prefix = el.dataset.prefix || "";
    const comma = el.dataset.format === "comma";
    const dur = 1400;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      let val = Math.round(targetVal * eased);
      const text = comma ? val.toLocaleString("en-US") : String(val);
      el.textContent = prefix + text + suffix;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- 4. REVEAL ON SCROLL + KPI TRIGGER ---------- */
  const revealEls = [];
  document.querySelectorAll(".section__head, .card, .pipeline__step, .loop-note, .table-wrap, .cta__inner, .kpi").forEach((el) => {
    el.classList.add("reveal");
    revealEls.push(el);
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add("is-in");
        const num = en.target.querySelector ? en.target.querySelector(".kpi__num[data-target]") : null;
        if (num && !num.dataset.done) { num.dataset.done = "1"; animateNum(num); }
        obs.unobserve(en.target);
      });
    }, { threshold: 0.18 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-in"));
    nums.forEach(animateNum);
  }

  /* ---------- 5. FOOTER YEAR ---------- */
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
