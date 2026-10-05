"use client";

type Props = { filename: string; headers: string[]; rows: (string | number)[][] };

/** Descarga el reporte tal como se ve en pantalla, para adjuntarlo a un informe. */
export function ExportCsv({ filename, headers, rows }: Props) {
  function download() {
    const escape = (value: string | number) => {
      const text = String(value ?? "");
      return /[",;\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
    // BOM para que Excel en español respete las tildes.
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="btn ghost" onClick={download} disabled={!rows.length}>
      Descargar CSV
    </button>
  );
}
