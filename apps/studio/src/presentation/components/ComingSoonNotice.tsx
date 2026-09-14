/**
 * ComingSoonNotice — placeholder para módulos en desarrollo ("próximamente").
 * Reemplaza contenido que aún no está disponible (Live Engine, Asistente IA)
 * para que el click muestre un aviso claro en vez de un error o un panel vacío.
 */

"use client";

interface ComingSoonNoticeProps {
  /** Título del módulo que llega pronto (ej: "Live Engine"). */
  title: string;
  /** Mensaje corto en microcopy en español neutro latinoamericano. */
  message: string;
}

export function ComingSoonNotice({ title, message }: ComingSoonNoticeProps) {
  return (
    <div className="flex h-full min-h-[16rem] items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-dashed border-[var(--border-subtle)] p-8 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-active)] text-2xl">
          🚧
        </div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-primary)]">
          Próximamente
        </p>
        <h3 className="mb-2 text-lg font-semibold text-[var(--text-secondary)]">
          {title}
        </h3>
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">{message}</p>
      </div>
    </div>
  );
}