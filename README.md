# Quantum Reminder Calculator 

> *Entangle your thoughts with your future timeline.*

A single-page web app that turns any reminder you type into a deterministic future date and time, then hands you calendar export links to anchor it. Wrapped in a quantum-physics theme, complete with a generative ambient synth and an animated particle portal.

Everything runs **client-side**. Your message never leaves the browser: no server, no database, no local storage.

(DISCLAIMER: Not actual quantum mechanics. This is a thematic art/UX piece.)

## How it works

When you submit a message:

1. **Hash** — the message is combined with the "ancilla spin" slider value and an internal search counter, then run through **SHA-256** (Web Crypto API).
2. **Map to a delay** — hash bytes drive a Box-Muller transform into a standard normal, which is fed through a **log-normal mapping** to produce a delay in days. It's tuned so the most likely result lands ~90 days out, clamped to a range of **1 day to 12 years**. The calculation loops (incrementing the counter) until a result fits those bounds.
3. **Decorate** — extra hash bytes are mapped into themed metrics (wave amplitude ψ, phase θ, entropy, decoherence time) shown in the details drawer.
4. **Export** — the resulting date feeds **Google Calendar**, **.ics download**, and **clipboard** actions so you can record it in your real calendar.

The same message + spin always produces the same date (it's deterministic), though the "Erasure Protocol" encourages you to anchor it in your calendar and not look back.

## Getting started

Requires [Node.js](https://nodejs.org/) and uses [Vite](https://vitejs.dev/).

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # build for production into dist/
npm run preview  # preview the production build locally
```

## Project structure

```
index.html      Markup for the three screens (input → collapsing → result) and footer lore
src/main.js     All app logic: hashing/date math, the Web Audio synth, the canvas particle portal, and the UI flow controller
src/style.css   Theming and layout
public/         Static assets (icons, favicon)
```

## Tech

- **Vanilla JavaScript** (ES modules) — no framework
- **Vite** for dev server and bundling
- **Web Crypto API** for SHA-256 hashing
- **Web Audio API** for the generative ambient soundscape
- **Canvas 2D** for the particle portal animation
