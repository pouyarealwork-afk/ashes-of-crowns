/** Browser helpers for save export/import. Both only work in a DOM environment. */

/** Triggers a file download of `text`. Returns false if no DOM is available. */
export function downloadTextFile(filename: string, text: string, doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): boolean {
  if (!doc || typeof Blob === 'undefined' || typeof URL === 'undefined') return false;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke later: some Android browsers need the URL alive briefly after click().
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Opens a file picker and resolves with the chosen file's text, or null if cancelled. Must be called from a user gesture. */
export function pickTextFile(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): Promise<string | null> {
  return new Promise((resolve) => {
    if (!doc) return resolve(null);
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.onchange = async () => {
      const f = input.files?.[0];
      input.remove();
      resolve(f ? await f.text() : null);
    };
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    doc.body.appendChild(input);
    input.click();
  });
}
