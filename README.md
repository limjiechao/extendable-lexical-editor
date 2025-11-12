## Purpose of this repo

This repository provides an extendable, production-ready wrapper around the Lexical playground: a reusable `<ExtendableEditor />` React component plus a curated set of nodes, themes, contexts, and plugins. It’s intended to be a starting point for building rich-text editors that you can customize with your own nodes, toolbar, and behaviors.

## Example: set up and use `<ExtendableEditor />`

Here’s a minimal example for an external app that installed this package. Install and then import from the exported subpaths:

```bash
npm install extendable-lexical-editor react react-dom
```

Then use the component:

```tsx
'use client';

import {useState} from 'react';

import ExtendableEditor from 'extendable-lexical-editor/extendable-editor.tsx';
import nodes from 'extendable-lexical-editor/nodes.ts';
import theme from 'extendable-lexical-editor/editor-theme.ts';

export default function App() {
  const [doc, setDoc] = useState(null);

  return (
    <ExtendableEditor
      collabDocId="demo-doc" // identifier for collaboration room
      name="Demo Editor"     // editor name (for diagnostics)
      namespace="demo"       // editor namespace (for serialization/source)
      nodes={nodes}          // optional: extend with your own nodes
      theme={theme}          // optional: customize styling
      initialDocument={doc ?? undefined}
      onChangeDocument={setDoc}
      onSaveDocument={(nextDoc) => {
        // Invoked on Cmd/Ctrl+S (handled internally)
        console.log('Saved document:', nextDoc);
      }}
    />
  );
}
```

Notes:
- The component merges your `features` with sensible defaults; pass a partial config via the `features` prop only if you need overrides.
- Use `onChangeDocument` to keep external state in sync, and `onSaveDocument` to persist via Cmd/Ctrl+S.
- You can provide your own nodes array and theme to fully customize behavior and appearance.

