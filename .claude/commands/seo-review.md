# SEO Review

Audit `index.html` against this SEO checklist and report pass/fail for each item. Fix any failures automatically, then confirm what was changed.

## Checklist

### Meta & Head
- [ ] `<title>` tag exists and is 50–60 characters
- [ ] `<meta name="description">` exists and is 150–160 characters
- [ ] `<meta name="robots" content="index, follow">` present
- [ ] `<link rel="canonical">` present with correct URL
- [ ] `<html lang="...">` attribute set

### Open Graph (Social Sharing)
- [ ] `og:title` present
- [ ] `og:description` present
- [ ] `og:image` present (ideally 1200×630px)
- [ ] `og:url` present
- [ ] `og:type` present

### Semantic HTML
- [ ] Exactly one `<h1>` on the page
- [ ] Heading hierarchy is logical (h1 → h2 → h3, no skipped levels)
- [ ] `<main>`, `<nav>`, `<footer>` landmarks used
- [ ] `<section>` and `<article>` used where appropriate

### Images
- [ ] Every `<img>` has a descriptive `alt` attribute (not empty, not "image")
- [ ] Images have `width` and `height` attributes to prevent layout shift

### Performance Signals
- [ ] Above-the-fold images are NOT lazy-loaded (`loading="eager"` or no attribute)
- [ ] Below-the-fold images use `loading="lazy"`
- [ ] No render-blocking scripts without `defer` or `async`

### Structured Data
- [ ] JSON-LD schema block present (at minimum: Organization or WebPage type)

Report results as a table: Item | Status | Notes. Then fix all failures.
