/** Triggers a file download from an extension page (side panel). */
export function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function downloadCsv(filename: string, csv: string): void {
  downloadText(filename, csv, 'text/csv');
}

export function downloadJson(filename: string, json: string): void {
  downloadText(filename, json, 'application/json');
}
