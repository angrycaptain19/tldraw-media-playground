# tldraw Media Playground — Board Game Canvas

A simple web app built with [tldraw](https://tldraw.dev/) as an interactive canvas.
This is the foundation for a multiplayer board-game platform where players can
interact using hand-tracking via camera.

## Tech Stack

| Layer | Choice |
|---|---|
| Build tool | Vite |
| Framework | React 18 + TypeScript |
| Canvas | tldraw v5 |

## Getting Started

```bash
npm install
npm run dev      # start dev server at http://localhost:5173
npm run build    # production build → dist/
npm run typecheck # TypeScript checks only
```

## Features

- **Full tldraw canvas** – draw, select, insert shapes, annotate
- **Auto-persistence** – canvas state saved to `localStorage` across page reloads
- **Export** – download the current canvas as a JSON snapshot
- **Clear** – confirmation-guarded wipe of the canvas
- **Responsive layout** – header + full-height canvas

## Project Structure

```
src/
  main.tsx          – React root mount
  App.tsx           – <Tldraw> integration + state
  App.css           – layout styles
  components/
    Header.tsx      – toolbar with Export / Clear actions
    Header.css
  index.css         – global reset
  vite-env.d.ts     – Vite type shims
index.html          – Vite HTML entry
vite.config.ts      – Vite + React plugin
tsconfig.json       – TypeScript config
```
