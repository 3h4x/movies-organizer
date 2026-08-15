# Shared UI Components

Reusable primitives live in `components/ui/`. Import them with the `@/components/ui/` alias.

## Spinner

`components/ui/Spinner.tsx`

```tsx
import Spinner from "@/components/ui/Spinner";

// Large centered loader (default) — page/section loading states
<Spinner />

// Inside a fixed-width button (white on indigo background)
<Spinner size="sm" color="white" className="mx-auto" />

// Inline with flex siblings
<Spinner size="md" className="flex-shrink-0" />

// Section loader with bottom margin
<Spinner className="mx-auto mb-3" />
```

**Props**

| Prop | Type | Default | Values |
|------|------|---------|--------|
| `size` | string | `"lg"` | `"sm"` (w-4), `"md"` (w-5), `"lg"` (w-8) |
| `color` | string | `"indigo"` | `"indigo"`, `"white"` |
| `className` | string | — | Tailwind layout utilities (mx-auto, mb-3, flex-shrink-0, …) |

## Button

`components/ui/Button.tsx`

Indigo primary action button with built-in loading state. Pass layout/sizing classes via `className`; the variant handles color and interaction styles.

```tsx
import Button from "@/components/ui/Button";

// Basic
<Button onClick={handleSearch}>Search</Button>

// With loading spinner (disables automatically while loading)
<Button onClick={handleImport} loading={loading} disabled={!path.trim()} className="px-5 py-2.5 rounded-xl text-sm min-w-[80px]">
  Import
</Button>
```

**Props**

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `variant` | string | `"primary"` | Only `"primary"` currently |
| `loading` | boolean | `false` | Shows spinner, disables the button |
| `disabled` | boolean | — | Additional disabled condition (stacks with `loading`) |
| `className` | string | `""` | Tailwind sizing/layout overrides (`px-5 py-2.5 rounded-xl …`) |
| `children` | ReactNode | — | Button label (hidden while `loading`) |
| all `<button>` attrs | — | — | Passed through via `...rest` |

## Modal

`components/ui/Modal.tsx`

Dark overlay + centered panel with a title header and close button. Requires `"use client"` callers (already the case for all current modal components).

```tsx
import Modal from "@/components/ui/Modal";

// Default (max-w-lg, z-50, no backdrop click-to-close)
<Modal title="Import from Folder" labelId="import-modal-title" onClose={onClose}>
  {/* panel body */}
</Modal>

// Wider scrollable modal with backdrop click-to-close (e.g. SearchModal)
<Modal
  title={targetMovieId ? "Relink Metadata" : "Add to Library"}
  labelId="search-modal-title"
  onClose={onClose}
  maxWidth="max-w-2xl"
  zIndex="z-[90]"
  panelClassName="max-h-[75vh] overflow-y-auto"
  closeOnBackdrop
>
  {/* panel body */}
</Modal>
```

**Props**

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `title` | ReactNode | — | Rendered in h2; can be a string or JSX expression |
| `labelId` | string | — | `id` for the h2; linked via `aria-labelledby` on the panel |
| `onClose` | () => void | — | Called by the close button (and backdrop when `closeOnBackdrop`) |
| `children` | ReactNode | — | Panel body content below the title row |
| `maxWidth` | string | `"max-w-lg"` | Tailwind width class applied to the panel |
| `zIndex` | string | `"z-50"` | Tailwind z-index class applied to the overlay |
| `panelClassName` | string | `""` | Extra Tailwind classes on the panel (e.g. `max-h-[75vh] overflow-y-auto`) |
| `closeOnBackdrop` | boolean | `false` | If true, clicking the dark overlay calls `onClose` |

## EmptyState

`components/ui/EmptyState.tsx`

Centred empty / error state with optional emoji icon, subtext, and action area. Use the default section variant for full-page or full-section states; use `variant="card"` for compact inline result panels.

```tsx
import EmptyState from "@/components/ui/EmptyState";

// Simple
<EmptyState icon="💡" message="No recommendations yet" subtext="Add some movies to your library first" />

// With action buttons as children (wrapped in mt-6)
<EmptyState
  icon="🎬"
  message="Your library is empty"
  subtext="Import a folder or search to start building your collection"
>
  <button onClick={onImport} className="...">Import Folder</button>
</EmptyState>

// No icon, with extra wrapper class
<EmptyState message="TMDb search failed" subtext="Try again in a moment" className="mx-auto max-w-xl">
  <button onClick={retry} className="...">Retry</button>
</EmptyState>

// Compact inline panel
<EmptyState variant="card" message="No TMDb results" subtext="Try a different title" />

// Minimal inline message
<EmptyState variant="plain" message="No movies match your filters" />
```

**Props**

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `icon` | string | — | Emoji rendered at 4xl inside a rounded gray badge |
| `message` | ReactNode | — | Primary line: `text-gray-400 text-lg font-medium` |
| `subtext` | ReactNode | — | Secondary line: `text-gray-600 text-sm mt-2`; accepts string or JSX |
| `children` | ReactNode | — | Action area rendered inside `<div className="mt-6">` |
| `className` | string | — | Extra Tailwind classes on the outer wrapper |
| `variant` | string | `"section"` | `"section"` (py-24), `"card"` (rounded border panel with py-8), or `"plain"` (py-12 with smaller gray message) |
