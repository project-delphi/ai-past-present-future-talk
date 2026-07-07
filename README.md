# The Architecture of Intelligence

Slides for a talk on the past, present, and future of AI — a PhD inauguration lecture by Ravi Kalia.

**▶ View the slides: [project-delphi.github.io/ai-past-present-future-talk](https://project-delphi.github.io/ai-past-present-future-talk/)**

## About

The deck is built with [Quarto](https://quarto.org) and [Reveal.js](https://revealjs.com), organized around three threads:

- **Minds run on prediction** — animal, human, and machine alike
- **"AI" is an ambiguous term** — today, largely a marketing label for LLMs
- **Human intelligence is sample-efficient novel problem solving** — written first in our biology

Eight sections: minds & consciousness, human intelligence as machine learning, "AI" as an ambiguous term, generative AI & LLMs, the five tribes of machine learning, the state of the art, what we want from AGI, and the future.

## Development

```bash
quarto preview index.qmd    # live-reload preview
quarto render index.qmd     # render to index.html
```

Pushing to `main` renders and deploys the slides to GitHub Pages automatically via GitHub Actions.
