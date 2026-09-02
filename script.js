/* ============================================================
   AIBNKO - landing interactions
   ============================================================ */
(function () {
  "use strict";

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. VIDEO MOUSE-SCRUBBING ----------
     Maps the cursor's horizontal position to the video timeline so the
     subject's head turns to follow the user. The clip is re-encoded as
     all-intra (every frame a keyframe) so arbitrary seeks are instant.
     iOS Safari will not paint frames of a paused <video> when JS only
     seeks currentTime, so iPhone / iPad (including iPadOS that reports
     Macintosh + maxTouchPoints, and Chrome on iOS / WebKit) skip the
     scrub loop and autoplay the portrait instead.

     iOS also budgets muted autoplay to one video. #heroLoop used to stack
     above the portrait on phones and start first, so #scrubVideo.play() was
     rejected. IntersectionObserver is not a user gesture, and pausing
     a below-the-fold portrait after a brief autoplay lifted the overlay
     onto a black unpainted canvas. The poster overlay stays up until a
     decoded playing frame exists; the product loop waits for a gesture. */
  function isIOS() {
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    // iPadOS 13+: Safari and Chrome report as Macintosh.
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
    return false;
  }

  function hasPaintedFrame(el) {
    return !!(
      el &&
      !el.paused &&
      el.readyState >= 2 &&
      el.videoWidth > 0 &&
      el.videoHeight > 0
    );
  }

  const onIOS = isIOS();
  if (onIOS) document.documentElement.classList.add("is-ios");

  const video = document.getElementById("scrubVideo");
  const portrait = document.getElementById("portrait");
  const overlay = document.getElementById("scrubPoster");
  const heroLoop = document.getElementById("heroLoop");
  let iosGestureUnlocked = false;

  if (video && onIOS) {
    const hint = document.getElementById("scrubHint");
    if (hint) hint.hidden = true;

    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.playsInline = true;

    let revealed = false;

    function showPoster() {
      revealed = false;
      if (overlay) overlay.classList.remove("is-ready");
    }

    function revealFrame() {
      if (prefersReduced) return;
      if (!hasPaintedFrame(video)) return;
      if (revealed) return;
      revealed = true;
      if (overlay) overlay.classList.add("is-ready");
    }

    function armFrameCallback() {
      if (typeof video.requestVideoFrameCallback === "function") {
        video.requestVideoFrameCallback(function () {
          revealFrame();
        });
      }
    }

    video.addEventListener("playing", function () {
      armFrameCallback();
      revealFrame();
    });
    video.addEventListener("timeupdate", revealFrame);
    video.addEventListener("loadeddata", revealFrame);
    video.addEventListener("pause", function () {
      if (!hasPaintedFrame(video)) showPoster();
    });
    video.addEventListener("emptied", showPoster);
    video.addEventListener("error", showPoster);

    function tryPlayPortrait() {
      if (prefersReduced) return;
      armFrameCallback();
      const playPromise = video.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise.then(function () {
          armFrameCallback();
          revealFrame();
        }).catch(function () {
          showPoster();
        });
      }
    }

    function tryPlayHeroAfterGesture() {
      if (!heroLoop || prefersReduced || !iosGestureUnlocked) return;
      if (portrait) {
        const r = portrait.getBoundingClientRect();
        const visibleH = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
        if (r.height > 0 && visibleH / r.height > 0.25) {
          tryPlayPortrait();
          return;
        }
      }
      heroLoop.muted = true;
      heroLoop.defaultMuted = true;
      const playPromise = heroLoop.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(function () {});
      }
    }

    function onUnlock() {
      if (prefersReduced) return;
      iosGestureUnlocked = true;
      tryPlayPortrait();
      tryPlayHeroAfterGesture();
    }

    if (prefersReduced) {
      video.loop = false;
      video.removeAttribute("loop");
      video.removeAttribute("autoplay");
      video.pause();
      showPoster();
    } else {
      video.loop = true;
      video.setAttribute("loop", "");
      video.setAttribute("autoplay", "");
      // Claim the single muted-autoplay slot immediately, even off-screen.
      tryPlayPortrait();
    }

    ["touchstart", "touchend", "pointerdown", "click"].forEach(function (ev) {
      document.addEventListener(ev, onUnlock, { passive: true });
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) tryPlayPortrait();
    });

    // Play when the portrait approaches the viewport. Do not pause it:
    // pause() before a painted frame is what produced the black rectangle.
    if ("IntersectionObserver" in window && portrait) {
      const io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (prefersReduced) return;
          if (en.isIntersecting) tryPlayPortrait();
        });
      }, { threshold: 0.01, rootMargin: "240px 0px" });
      io.observe(portrait);
    }
  } else if (video) {
    if (!prefersReduced) document.documentElement.classList.add("is-scrub");
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
      if (!(duration > 0)) return;
      ready = true;
      // Nudge a frame onto the canvas so we don't sit on the poster only.
      try { video.currentTime = 0.001; } catch (e) {}
      // Start centered once; later metadata events only refresh duration.
      if (target === 0 && current === 0) {
        target = current = duration * 0.5;
      }
      if (!prefersReduced && !rafId) loop();
    };

    // Listen first, then poll: a cached video can fire loadedmetadata
    // before this script runs (or between a readyState check and the listener).
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("loadeddata", onMeta);
    video.addEventListener("seeked", () => { seeking = false; });
    onMeta();

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

    // Reduced motion: keep the static poster. Do not autoplay.

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

  /* ---------- 1b. PRODUCT DEMO LOOP ---------- */
  if (heroLoop) {
    heroLoop.muted = true;
    heroLoop.defaultMuted = true;
    heroLoop.playsInline = true;
    const tryPlayHero = () => {
      if (prefersReduced) {
        heroLoop.pause();
        return;
      }
      if (onIOS) {
        // iOS muted-autoplay is a single slot. The portrait claims it.
        // After a tap/touch, onUnlock() starts the product loop.
        heroLoop.removeAttribute("autoplay");
        heroLoop.autoplay = false;
        return;
      }
      const playPromise = heroLoop.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    };
    tryPlayHero();
    if (!onIOS) {
      heroLoop.addEventListener("canplay", tryPlayHero, { once: true });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) tryPlayHero();
      });
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

  /* ---------- 6. DEMO REQUEST MODAL ---------- */
  const modal = document.getElementById("demoModal");
  const form = document.getElementById("demoForm");

  if (modal && form) {
    const dialog = modal.querySelector(".modal__dialog");
    const statusEl = document.getElementById("demoStatus");
    const RESEARCH_EMAIL = "research@aibnko.com";

    // Common personal / free mailbox providers - these are rejected so only
    // organization addresses get through.
    const FREE_DOMAINS = new Set([
      "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.in",
      "ymail.com", "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com",
      "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "protonmail.com",
      "proton.me", "pm.me", "gmx.com", "gmx.net", "mail.com", "yandex.com",
      "yandex.ru", "zoho.com", "hey.com", "fastmail.com", "tutanota.com",
      "qq.com", "163.com", "126.com", "naver.com", "hotmail.fr", "outlook.fr"
    ]);

    let lastFocused = null;

    function openModal() {
      lastFocused = document.activeElement;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      const first = document.getElementById("fName");
      if (first) setTimeout(() => first.focus(), 60);
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    // Open triggers
    document.querySelectorAll("[data-open-demo]").forEach((el) => {
      el.addEventListener("click", (e) => { e.preventDefault(); openModal(); });
    });
    // Close triggers
    modal.querySelectorAll("[data-close-demo]").forEach((el) => {
      el.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
    });

    // Validation helpers
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function setError(input, msg) {
      const err = form.querySelector('[data-err-for="' + input.id + '"]');
      if (err) err.textContent = msg || "";
      input.classList.toggle("is-invalid", !!msg);
      input.setAttribute("aria-invalid", msg ? "true" : "false");
    }

    function validate() {
      let ok = true;
      const nameEl = document.getElementById("fName");
      if (!nameEl.value.trim()) { setError(nameEl, "Please enter your full name."); ok = false; }
      else setError(nameEl, "");
      const emailEl = document.getElementById("fEmail");
      const val = emailEl.value.trim();
      const domain = val.split("@")[1] ? val.split("@")[1].toLowerCase() : "";
      if (!val) { setError(emailEl, "Please enter your work email."); ok = false; }
      else if (!EMAIL_RE.test(val)) { setError(emailEl, "Please enter a valid email address."); ok = false; }
      else if (FREE_DOMAINS.has(domain)) {
        setError(emailEl, "Please use your organization email - personal addresses aren't accepted.");
        ok = false;
      } else setError(emailEl, "");
      return ok;
    }

    // Clear an error as the user fixes a field
    form.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("input", () => { if (inp.classList.contains("is-invalid")) setError(inp, ""); });
    });

    function setStatus(msg, kind) {
      statusEl.textContent = msg || "";
      statusEl.classList.remove("is-ok", "is-err");
      if (kind) statusEl.classList.add(kind === "ok" ? "is-ok" : "is-err");
    }

    const WEB3FORMS_KEY = "913c51f2-5c5c-46a5-bc2b-162a501fee21";
    const submitBtn = form.querySelector(".demo-form__submit");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatus("");
      if (!validate()) { setStatus("Please fix the highlighted fields.", "err"); return; }

      const fullName = form.fName.value.trim();
      const email    = form.fEmail.value.trim();

      // Bot caught the honeypot - silently drop.
      if (form.botcheck && form.botcheck.checked) return;

      const payload = {
        access_key: WEB3FORMS_KEY,
        subject: "Walkthrough request - " + fullName,
        from_name: "AIBNKO Landing - Walkthrough Request",
        name: fullName,
        email: email,                 // used as reply-to
        message:
          "New walkthrough request from the AIBNKO landing page:\n\n" +
          "Full name: " + fullName + "\n" +
          "Work email: " + email,
        botcheck: ""
      };

      submitBtn.disabled = true;
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = "Sending...";
      setStatus("Sending your request...");

      try {
        const res = await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const firstName = fullName.split(" ")[0] || "there";
          setStatus("Thanks, " + firstName + " - your request has been sent. Our team will be in touch shortly.", "ok");
          form.reset();
          setTimeout(closeModal, 2600);
        } else {
          setStatus((data && data.message) ? data.message : "Something went wrong. Please email " + RESEARCH_EMAIL + " directly.", "err");
        }
      } catch (err) {
        setStatus("Network error - please try again, or email " + RESEARCH_EMAIL + " directly.", "err");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }
})();
