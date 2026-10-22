// Link figure layers with the text terms they explain (hover/focus). No motion.
(function () {
  function bind(scope) {
    var set = function (key, on) {
      scope.querySelectorAll('[data-tf="' + key + '"]').forEach(function (n) { n.classList.toggle('tf-on', on); });
    };
    scope.querySelectorAll('[data-tf]').forEach(function (el) {
      var key = el.getAttribute('data-tf');
      ['mouseenter', 'focusin'].forEach(function (t) { el.addEventListener(t, function () { set(key, true); }); });
      ['mouseleave', 'focusout'].forEach(function (t) { el.addEventListener(t, function () { set(key, false); }); });
    });
  }
  function init() { document.querySelectorAll('.tf-scope').forEach(bind); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
