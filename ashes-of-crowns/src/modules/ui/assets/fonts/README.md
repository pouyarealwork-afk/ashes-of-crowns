# Fonts for the UI module

The font files are **not included** in this delivery (the build sandbox had no network access, so they
could not be downloaded). Both fonts are free under the SIL Open Font License 1.1.

| File to add here              | Where to get it                                   | Used for                    |
| ----------------------------- | ------------------------------------------------- | --------------------------- |
| `Vazirmatn-Variable.woff2`    | https://github.com/rastikerdar/vazirmatn          | Persian text (all UI)       |
| `Cinzel-Variable.woff2`       | https://fonts.google.com/specimen/Cinzel          | English headings / buttons  |

After adding them, import `src/modules/ui/styles/fonts.files.css` once in the game entry.

Without the files the UI still works: `styles/fonts.css` uses `local()` and `styles/tokens.css` falls
back to system fonts (Persian: Noto Naskh/Sans Arabic, Segoe UI, Tahoma; English: Palatino/Georgia serif).
