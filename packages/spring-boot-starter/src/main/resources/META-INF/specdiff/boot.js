// Reads config.json (served by the starter) and mounts the Viewer. Kept out of index.html so a strict CSP works.
fetch('config.json')
  .then(function (r) { return r.json(); })
  .then(function (cfg) {
    document.title = cfg.title || document.title;
    var url = new URL(cfg.url, location.origin).toString();
    var compareWith = cfg.compareWith ? new URL(cfg.compareWith, location.origin).toString() : undefined;
    window.Specdiff.mount(document.getElementById('specdiff'), { url: url, compareWith: compareWith, brand: cfg.brand });
  });
