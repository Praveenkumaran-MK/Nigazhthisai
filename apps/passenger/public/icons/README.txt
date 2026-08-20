MISSING: icon-192.png and icon-512.png

This repository ships only icon.svg because binary PNG files cannot be
generated as text output. Before a production build/install, generate the
two PNGs referenced in vite.config.ts and index.html from icon.svg, e.g.:

  npx pwa-asset-generator public/icons/icon.svg public/icons --icon-only --favicon

Without these PNGs the PWA will still install on Android/desktop Chrome
(which can rasterize the SVG maskable icon at runtime in recent versions),
but iOS Safari's "Add to Home Screen" icon will be blank/incorrect.
