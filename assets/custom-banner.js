/**
 * Custom Banner - Mobile Menu Toggle
 * --------------------------------------------------------------------------
 * Vanilla JS only. Toggles the mobile top bar between its collapsed state
 * (hamburger + logo only) and its open state (heading + "Choose Gift"
 * button revealed, hamburger icon morphs into an X) - matches the
 * Figma "Component 189" mobile design.
 */
(function () {
  'use strict';

  document.addEventListener('click', function (event) {
    var toggle = event.target.closest('[data-menu-toggle]');
    if (!toggle) return;

    var topbar = toggle.closest('.custom-banner__topbar');
    if (!topbar) return;

    var isOpen = topbar.classList.toggle('is-menu-open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
})();