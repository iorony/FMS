import { ReactNode } from "react";

export function CreationPanel({ title, children }: { title: string; children: ReactNode }) {
  return <details className="panel creation-panel">
    <summary>{title}<span className="creation-panel-hint">Abrir formulario</span></summary>
    <div className="panel-body">{children}</div>
  </details>;
}
