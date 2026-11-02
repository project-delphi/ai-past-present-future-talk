# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single Quarto Reveal.js slide deck for a talk: "The Architecture of Intelligence — Past, Present & Future of AI" (a PhD inauguration lecture). All content lives in `index.qmd`, with local assets in `images/`. There is no application code, no tests, no linting.

## Commands

```bash
quarto render index.qmd     # render slides to index.html (self-contained, several MB due to embed-resources: true)
quarto preview index.qmd    # live-reload preview while editing
```

Rendered output (`*.html`, `*_files/`, `.quarto/`) is gitignored — commits contain only `index.qmd`, `images/`, and repo scaffolding. Publishing happens automatically: pushing to `main` triggers `.github/workflows/publish.yml`, which renders with Quarto and deploys to GitHub Pages (the `gh-pages` branch) at https://project-delphi.github.io/ai-past-present-future-talk/. Check deploys with `gh run list` / `gh run watch`.

## Deck structure

`index.qmd` is organized as eight Roman-numeraled sections, each opened by a section-divider slide (`## I. ...` through `## VIII. ...`) tagged with the `{.section-divider}` class, which is styled (centered layout, orange heading, entrance animation) by the custom CSS in the YAML `header-includes`. The deck has a spine of four recurring threads stated up front on the "Four Threads" slide (intelligence as task solving by learning, prediction, "AI" as an ambiguous term, sample-efficient novel task solving). Section VIII ends with Key Takeaways and a "Thank You / Questions?" slide (it borrows the `{.section-divider}` style), followed by back-matter: Key References I–V, Image Credits, and a closing Discussion slide.

Slide conventions — keep new slides consistent with these:

- Slides are separated by `---`; keep new slides in the matching section.
- Terse bullet style: few bullets, bolded key terms.
- Two-column layouts use Quarto's `:::: {.columns}` / `::: {.column width="…"}` divs, typically bullets on the left and a visual on the right.
- Visuals are either raw `<img>` tags pointing into `images/` or small inline `<svg>` diagrams, both sized with inline styles (rounded corners via `border-radius`, side-by-side GIFs at a shared fixed height). No external image URLs on content slides — remote assets are downloaded into `images/` first.
- Some visuals are live three.js scenes: a `<canvas class="viz3d" data-scene="…">` driven by `lib/viz3d.js` (scenes: `network`, `landscape`, `kernel`, `cluster`, `descent`, `gridworld`, `roll`, `garden`, `crystal`). `lib/three.min.js` is vendored (r149, MIT) and both are inlined via `include-after-body` in the YAML front matter. A scene only animates while its slide is current. To add one, add a function `(scene, camera, canvas) -> { update(t, dt), reset? }` to `scenes` in `viz3d.js`; give it `reset()` if it tells a timed story, so it restarts whenever its slide is re-entered. Scenes that need text (`garden`, `crystal`) build an HTML overlay with the `overlay(canvas)` helper, so wrap such a canvas in its own `<div>` — the overlay is positioned against the canvas's parent.
- Every image added to `images/` needs an attribution line on the "Image Credits" slide (name — author, licence).
- Nearly every content slide ends with a `::: {.notes}` speaker-notes block — write one for any new slide, in the existing style: delivery coaching for the speaker (what to emphasize, where to hedge, the one line to land), not a restatement of the bullets.

The deck uses the dark Reveal.js theme with `embed-resources: true` set in the YAML front matter, so inline SVG colors are chosen for a dark background (`#f0a868` orange accent matches the section dividers).
