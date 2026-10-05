"use client";

import { Fragment, useState } from "react";
import { EmptyState } from "@/components/ui";
import { CatalogActions, CatalogEditRow, deleteCatalogRecord } from "@/components/catalog-management";

type Client = { id: string; name: string; contact_name: string | null; contact_phone: string | null; email: string | null; address: string | null; is_active: boolean };
type Material = { id: string; sku: string; name: string; unit: string; unit_cost: number; minimum_quantity: number; is_active: boolean };
type MaterialUsage = { material_id: string; client_id: string; client_name: string; unit: string; consumed_quantity: number; consumed_cost: number; last_consumed_at: string };

type Props =
  | { type: "clients"; records: Client[]; canManage: boolean }
  | { type: "materials"; records: Material[]; canManage: boolean; materialUsage?: MaterialUsage[] };

/**
 * Tabla de catálogo con edición a todo el ancho: al abrir "Editar" en una fila
 * se despliega una segunda fila con el formulario completo, en vez de
 * apretarlo dentro de la celda de "Acciones".
 */
export function CatalogTable(props: Props) {
  const { type, records, canManage } = props;
  const materialUsage = type === "materials" ? props.materialUsage ?? [] : [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const columns = type === "clients" ? 6 : 7;

  async function handleDelete(id: string) {
    setError(null);
    setBusyId(id);
    const result = await deleteCatalogRecord(type, id, type === "clients" ? "cliente" : "material");
    setBusyId(null);
    if (!result.ok) setError(result.message);
  }

  if (!records.length) {
    return (
      <EmptyState
        title={type === "clients" ? "Sin clientes registrados" : "Sin materiales en el catálogo"}
        hint={
          canManage
            ? "Agrega el primero con el formulario de arriba."
            : `Solicita a un administrador que ${type === "clients" ? "registre los clientes" : "cargue el catálogo"}.`
        }
      />
    );
  }

  return (
    <>
      {error && <div className="panel-body" style={{ paddingBottom: 0 }}><p className="msg error" role="alert">{error}</p></div>}
      <table className="table-stack">
        {type === "clients" ? (
          <thead>
            <tr><th>Cliente</th><th>Contacto</th><th>Teléfono</th><th>Correo</th><th>Estado</th>{canManage && <th>Acciones</th>}</tr>
          </thead>
        ) : (
          <thead>
            <tr><th>SKU</th><th>Material</th><th>Unidad</th><th>Costo unitario</th><th>Mínimo de compra</th><th>Estado</th>{canManage && <th>Acciones</th>}</tr>
          </thead>
        )}
        <tbody>
          {records.map((record) => {
            const open = editingId === record.id;
            return (
              <Fragment key={record.id}>
                {type === "clients" ? (
                  <tr key={record.id}>
                    <td data-label="">{(record as Client).name}</td>
                    <td data-label="Contacto">{(record as Client).contact_name ?? "—"}</td>
                    <td data-label="Teléfono">{(record as Client).contact_phone ?? "—"}</td>
                    <td data-label="Correo">{(record as Client).email ?? "—"}</td>
                    <td data-label="Estado"><span className={`badge ${record.is_active ? "cerrada" : "borrador"}`}>{record.is_active ? "Activo" : "Inactivo"}</span></td>
                    {canManage && (
                      <td data-label="Acciones">
                        <CatalogActions open={open} onToggle={() => setEditingId(open ? null : record.id)} busy={busyId === record.id} onDelete={() => handleDelete(record.id)} />
                      </td>
                    )}
                  </tr>
                ) : (
                  <tr key={record.id}>
                    <td data-label=""><span className="mono">{(record as Material).sku}</span></td>
                    <td data-label="Material">
                      {(record as Material).name}
                      {(() => {
                        const usage = materialUsage.filter((item) => item.material_id === record.id);
                        if (!usage.length) return <span className="sub">Sin consumo registrado por cliente.</span>;
                        return (
                          <details className="material-usage">
                            <summary>Consumido por {usage.length} cliente{usage.length === 1 ? "" : "s"}</summary>
                            {usage.map((item) => <span className="sub" key={item.client_id}>{item.client_name}: {item.consumed_quantity} {item.unit} · Q {Number(item.consumed_cost).toFixed(2)}</span>)}
                          </details>
                        );
                      })()}
                    </td>
                    <td data-label="Unidad">{(record as Material).unit}</td>
                    <td data-label="Costo unitario">Q {Number((record as Material).unit_cost).toFixed(2)}</td>
                    <td data-label="Mínimo de compra">{(record as Material).minimum_quantity} {(record as Material).unit}</td>
                    <td data-label="Estado"><span className={`badge ${record.is_active ? "cerrada" : "borrador"}`}>{record.is_active ? "Activo" : "Inactivo"}</span></td>
                    {canManage && (
                      <td data-label="Acciones">
                        <CatalogActions open={open} onToggle={() => setEditingId(open ? null : record.id)} busy={busyId === record.id} onDelete={() => handleDelete(record.id)} />
                      </td>
                    )}
                  </tr>
                )}
                {open && canManage && (
                  <CatalogEditRow type={type} record={record} columns={columns} onDone={() => setEditingId(null)} />
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
