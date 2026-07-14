# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single Quarto Reveal.js slide deck for a talk: "The Architecture of Intelligence — Past, Present & Future of AI" (a PhD inauguration lecture). All content lives in `index.qmd`. There is no application code, no tests, no linting.

## Commands

```bash
quarto render index.qmd     # render slides to index.html (self-contained, several MB due to embed-resources: true)
quarto preview index.qmd    # live-reload preview while editing
```

Rendered output (`*.html`, `*_files/`, `.quarto/`) is gitignored — only `index.qmd` is committed. Publishing happens automatically: pushing to `main` triggers `.github/workflows/publish.yml`, which renders with Quarto and deploys to GitHub Pages via the `gh-pages` branch. Check deploys with `gh run list` / `gh run watch`.

## Deck structure

`index.qmd` is organized as eight Roman-numeraled sections, each opened by a section-divider slide (`## I. ...` through `## VIII. ...`) tagged with the `{.section-divider}` class, which is styled (centered layout, orange heading, entrance animation) by the custom CSS in the YAML `header-includes`. The deck has a spine of three recurring threads stated up front (prediction, "AI" as an ambiguous term, sample-efficient novel problem solving).

Slide conventions — keep new slides consistent with these:

- Slides are separated by `---`; keep new slides in the matching section.
- Terse bullet style: few bullets, bolded key terms.
- Nearly every content slide ends with a `::: {.notes}` speaker-notes block — write one for any new slide, in the existing style: delivery coaching for the speaker (what to emphasize, where to hedge, the one line to land), not a restatement of the bullets.

The deck uses the dark Reveal.js theme with `embed-resources: true` set in the YAML front matter.
