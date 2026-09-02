/* ============================================================
   AIBNKO - gated GA4. Loads gtag when MEASUREMENT_ID (or
   window.AIBNKO_GA_MEASUREMENT_ID) is a non-empty G- ID.
   A blank MEASUREMENT_ID remains a no-op.
   ============================================================ */
(function () {
  "use strict";

  var MEASUREMENT_ID = "G-2XWEQQZ8V2";

  var fromWindow =
    typeof window.AIBNKO_GA_MEASUREMENT_ID === "string"
      ? window.AIBNKO_GA_MEASUREMENT_ID
      : "";
  var id = String(fromWindow || MEASUREMENT_ID || "").trim();

  if (!id) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  var loader = document.createElement("script");
  loader.async = true;
  loader.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(loader);

  gtag("js", new Date());
  gtag("config", id, { anonymize_ip: true });

  function track(name, params) {
    gtag("event", name, params || {});
  }

  function ctaLocation(el) {
    if (!el || !el.closest) return "nav";
    if (el.closest("#nav")) return "nav";
    if (el.closest("#hero")) return "hero";
    if (el.closest("#demoModal")) return "modal";
    return "cta";
  }

  document.querySelectorAll("[data-open-demo]").forEach(function (el) {
    el.addEventListener("click", function () {
      track("cta_walkthrough_clicked", { location: ctaLocation(el) });
    });
  });

  var form = document.getElementById("demoForm");
  if (form) {
    form.addEventListener("submit", function () {
      track("walkthrough_form_submitted", { form_type: "walkthrough" });
    });
  }

  document.querySelectorAll('a[href="https://app.aibnko.com"]').forEach(function (el) {
    el.addEventListener("click", function () {
      track("login_clicked");
    });
  });
})();
