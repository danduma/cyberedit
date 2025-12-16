# Cyberedit (Embeddable Editor)

Embeddable ProseMirror-based editor extracted from flowscribe.

## Contents
- `src/embeddable/*`: editor components, hooks, highlight plugin, demo.
- `src/index.ts`: export surface.

## Build
```
npm install
npx tsup src/index.ts --dts --format esm,cjs
```

## Usage (host app)
```tsx
import { EmbeddableEditor } from 'cyberedit'
import 'cyberedit/dist/style.css'
```

Ensure peer deps (react 18+, prosemirror packages) are available in host.
