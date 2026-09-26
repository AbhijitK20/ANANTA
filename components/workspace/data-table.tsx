import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * One table, used by both operator surfaces.
 *
 * `/provider` has two queues and `/admin/operations` has four. Written out
 * separately that is six near-identical blocks of thead markup, and six places
 * for a header row to stop matching its body. So the chrome is here once and
 * each queue supplies its own columns and cells.
 *
 * Two rules the shape enforces rather than asks for:
 *
 * 1. **One source per row.** A row is a `cells` array in the order of
 *    `columns`, so there is no parallel "mobile card" version of the same data
 *    that can drift. On a narrow screen the `secondary` columns are hidden and
 *    whatever is important goes in the first cell, which is responsive markup the
 *    caller already had to write.
 * 2. **The count is never the design.** `DESIGN-CONTRACT.md` lines 17 to 19 ban
 *    fake metrics, and this component is where a dashboard is most tempted to
 *    invent one. The summary line is caller-supplied and every number in it has
 *    to come from state.
 */

export type TableColumn = {
  head: string;
  /**
   * Hidden below `md`. Secondary facts belong to a desktop table; a phone gets
   * the entity, its status, and the controls.
   */
  secondary?: boolean;
};

export type TableRow = {
  id: string;
  cells: ReactNode[];
  /** Row-level controls. Rendered in their own cell so they never shift a fact. */
  actions?: ReactNode;
};

export function DataTable({
  label,
  note,
  columns,
  rows,
  empty,
}: {
  /** The visible heading. Also the table's accessible name, so it is not optional. */
  label: string;
  note?: ReactNode;
  columns: TableColumn[];
  rows: TableRow[];
  /** What to show when there is nothing. A blank table is a state nobody wrote. */
  empty?: ReactNode;
}) {
  if (!rows.length) {
    return (
      <section className="card p-5" aria-label={label}>
        <h3 className="text-sm font-bold text-ink">{label}</h3>
        {note ? <p className="mt-1 text-xs leading-5 text-muted">{note}</p> : null}
        <div className="mt-3">{empty}</div>
      </section>
    );
  }

  const head = (
    <thead>
      <tr className="border-b border-line bg-canvas">
        {columns.map((column) => (
          <th
            key={column.head}
            scope="col"
            className={`px-5 py-2.5 text-left text-xs font-bold uppercase tracking-[0.08em] text-muted ${
              column.secondary ? "hidden md:table-cell" : ""
            }`}
          >
            {column.head}
          </th>
        ))}
        {rows.some((row) => row.actions) ? (
          <th scope="col" className="px-5 py-2.5 text-right text-xs font-bold uppercase tracking-[0.08em] text-muted">
            Actions
          </th>
        ) : null}
      </tr>
    </thead>
  );

  return (
    <section className="card overflow-hidden">
      <div className="px-5 py-4">
        <h3 className="text-sm font-bold text-ink">{label}</h3>
        {note ? <div className="mt-1 text-xs leading-5 text-muted">{note}</div> : null}
      </div>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{label}</caption>
          {head}
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line align-top last:border-b-0">
                {columns.map((column, index) => (
                  <td
                    key={column.head}
                    className={`px-5 py-4 text-left text-sm ${column.secondary ? "hidden md:table-cell" : ""}`}
                  >
                    {row.cells[index]}
                  </td>
                ))}
                {row.actions ? (
                  <td className="px-5 py-4 text-right align-top">
                    <div className="flex flex-wrap justify-end gap-2">{row.actions}</div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const ACTION_BASE =
  "inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-bold transition-colors duration-120";

/**
 * Three tones, and none of them is a solid fill.
 *
 * `DESIGN-CONTRACT.md:32` allows exactly one primary action per screen, and a
 * table with twenty rows of Verify buttons is twenty primary actions. So the
 * strongest thing in here is a blue outline, and the solid royal blue fill is
 * left to the one control that is genuinely the page's main action.
 */
const ACTION_TONE = {
  /** The row's main act: a state change a traveller would eventually see. */
  primary: "border-blue bg-blueSoft text-blue hover:border-blue",
  /** A state change that adds something. Green, because it verifies a source. */
  confirm: "border-green bg-greenSoft text-green hover:border-green",
  quiet: "border-line bg-white text-ink hover:border-blue hover:text-blue",
} as const;

export function TableAction({
  tone = "quiet",
  className = "",
  children,
  ...rest
}: {
  tone?: keyof typeof ACTION_TONE;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  // `className` is merged rather than spread last, because a caller that passes
  // one wants to add to these classes, not replace them.
  return (
    <button className={`${ACTION_BASE} ${ACTION_TONE[tone]} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}

/** A select inside a table cell. Same language as the buttons above it. */
export function TableSelect({
  value,
  onChange,
  children,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-[36px] rounded border border-line bg-white px-2.5 py-1.5 text-xs font-bold text-ink"
    >
      {children}
    </select>
  );
}

/**
 * A labelled fact inside a table cell, so a cell never becomes a run of bare
 * numbers. A definition list is the right element because these are named
 * values, not a sentence.
 */
export function CellFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted">{label}</p>
      <div className="mt-1 text-sm font-semibold text-ink">{children}</div>
    </div>
  );
}
