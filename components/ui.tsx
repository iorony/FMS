import { ORDER_FLOW, formatDateTime, priorityLabel, statusLabel } from "@/lib/ui";

const STATUS_ICON: Record<string, string> = {
  borrador: "✎", asignada: "↗", en_proceso: "◔", pendiente_de_cierre: "◷", cerrada: "✓", cancelada: "×",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}><span className="badge-icon" aria-hidden="true">{STATUS_ICON[status] ?? "•"}</span>{statusLabel(status)}</span>;
}

export function PriorityTag({ priority }: { priority: string }) {
  return <span className={`prio ${priority}`}>{priorityLabel(priority)}</span>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}

type HistoryEntry = { to_status: string; created_at: string };

/**
 * Línea de estado de la orden. Muestra dónde está y qué falta,
 * usando el historial real para fechar cada etapa alcanzada.
 */
export function StatusFlow({ status, history }: { status: string; history: HistoryEntry[] }) {
  if (status === "cancelada") {
    const cancelled = history.find((entry) => entry.to_status === "cancelada");
    return (
      <div className="stepper">
        <div className="step" data-state="void">
          <span className="step-name">Orden cancelada</span>
          <span className="step-when">{formatDateTime(cancelled?.created_at)}</span>
        </div>
      </div>
    );
  }

  const currentIndex = ORDER_FLOW.indexOf(status as (typeof ORDER_FLOW)[number]);
  const reachedAt = (stage: string) =>
    history.filter((entry) => entry.to_status === stage).sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.created_at;

  return (
    <div className="stepper">
      {ORDER_FLOW.map((stage, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
        const when = reachedAt(stage);
        return (
          <div className="step" key={stage} data-state={state}>
            <span className="step-name">{statusLabel(stage)}</span>
            <span className="step-when">
              {when ? formatDateTime(when) : state === "current" ? "En curso" : "Pendiente"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
