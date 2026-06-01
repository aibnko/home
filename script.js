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

  /* ---------- 6. DEMO REQUEST MODAL ---------- */
  const modal = document.getElementById("demoModal");
  const form = document.getElementById("demoForm");

  if (modal && form) {
    const dialog = modal.querySelector(".modal__dialog");
    const statusEl = document.getElementById("demoStatus");
    const SALES_EMAIL = "sales@aibnko.com";

    // Common personal / free mailbox providers — these are rejected so only
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
      const first = form.querySelector("input");
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
      const fields = {
        fName: form.fName, fCompany: form.fCompany,
        fTitle: form.fTitle, fEmail: form.fEmail
      };
      // Required text fields
      [["fName", "Please enter your full name."],
       ["fCompany", "Please enter your company name."],
       ["fTitle", "Please enter your title."]].forEach(([id, msg]) => {
        const el = document.getElementById(id);
        if (!el.value.trim()) { setError(el, msg); ok = false; }
        else setError(el, "");
      });
      // Email
      const emailEl = document.getElementById("fEmail");
      const val = emailEl.value.trim();
      const domain = val.split("@")[1] ? val.split("@")[1].toLowerCase() : "";
      if (!val) { setError(emailEl, "Please enter your work email."); ok = false; }
      else if (!EMAIL_RE.test(val)) { setError(emailEl, "Please enter a valid email address."); ok = false; }
      else if (FREE_DOMAINS.has(domain)) {
        setError(emailEl, "Please use your organization email - personal addresses aren’t accepted.");
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
      const company  = form.fCompany.value.trim();
      const title    = form.fTitle.value.trim();
      const email    = form.fEmail.value.trim();

      // Bot caught the honeypot — silently drop.
      if (form.botcheck && form.botcheck.checked) return;

      const payload = {
        access_key: WEB3FORMS_KEY,
        subject: "Demo request — " + company,
        from_name: "AIBNKO Landing — Demo Request",
        name: fullName,
        email: email,                 // used as reply-to
        company: company,
        title: title,
        message:
          "New demo request from the AIBNKO landing page:\n\n" +
          "Full name: " + fullName + "\n" +
          "Company: "   + company  + "\n" +
          "Title: "     + title    + "\n" +
          "Work email: " + email,
        botcheck: ""
      };

      submitBtn.disabled = true;
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = "Sending…";
      setStatus("Sending your request…");

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
          setStatus((data && data.message) ? data.message : "Something went wrong. Please email " + SALES_EMAIL + " directly.", "err");
        }
      } catch (err) {
        setStatus("Network error - please try again, or email " + SALES_EMAIL + " directly.", "err");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }
})();
