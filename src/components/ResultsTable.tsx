import type { HoursBreakdown } from "../utils/hours";
import { formatDecimalHours } from "../utils/hours";

type ResultsTableProps = {
	results: HoursBreakdown;
};

const rows = [
	{ key: "regularMinutes", label: "Horas Laborales" },
	{ key: "overtimeMinutes", label: "Horas Extra" },
	{ key: "nightMinutes", label: "Horas Nocturnas" },
	{ key: "sundayMinutes", label: "Horas Dominicales" },
] as const;

export function ResultsTable({ results }: ResultsTableProps) {
	return (
		<div className="results-card" aria-live="polite">
			<div className="section-heading">
				<p className="eyebrow">Resumen</p>
				<h2>Detalle del turno</h2>
			</div>
			<div className="results-table-wrap">
				<table className="results-table">
					<thead>
						<tr>
							<th scope="col">Concepto</th>
							<th scope="col">Horas</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.key}>
								<th scope="row">{row.label}</th>
								<td>{formatDecimalHours(results[row.key])}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
