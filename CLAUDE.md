# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single Quarto Reveal.js slide deck for a talk: "The Architecture of Intelligence — Past, Present & Future of AI" (a PhD inauguration lecture). All content lives in `index.qmd`. There is no application code, no tests, no linting.

## Commands

```bash
quarto render index.qmd     # render slides to index.html (self-contained, ~3.5MB due to embed-resources: true)
quarto preview index.qmd    # live-reload preview while editing
```

Rendered output (`*.html`, `*_files/`, `.quarto/`) is gitignored — only `index.qmd` is committed. Publishing happens automatically: pushing to `main` triggers `.github/workflows/publish.yml`, which renders with Quarto and deploys to GitHub Pages via the `gh-pages` branch. Check deploys with `gh run list` / `gh run watch`.

## Deck structure

`index.qmd` is organized as eight Roman-numeraled sections, each opened by a section-divider slide (`## I. ...` through `## VIII. ...`), with a spine of three recurring threads stated up front (prediction, "AI" as an ambiguous term, sample-efficient novel problem solving). Slides are separated by `---`; keep new slides in the matching section and consistent with the existing terse bullet style (few bullets, bolded key terms). The deck uses the dark Reveal.js theme with `embed-resources: true` set in the YAML front matter.
