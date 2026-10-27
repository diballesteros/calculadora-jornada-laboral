import { useId, useMemo, useState, type ChangeEvent } from "react";
import {
	groupShiftsByDate,
	parseShiftSheet,
	type ImportIssue,
	type ImportedShift,
} from "../utils/excelImport";
import {
	applyCorrections,
	columnLetter,
	findCorrections,
	type CellCorrection,
} from "../utils/excelExport";
import { isSundayOrHoliday } from "../utils/holidays";
import { formatDecimalHours } from "../utils/hours";

type ParsedSheet = {
	name: string;
	data: unknown[][];
	shifts: ImportedShift[];
	issues: ImportIssue[];
};

type ExcelImportProps = {
	onUseShift: (start: string, end: string, isSunday: boolean) => void;
};

const totalKeys = [
	"regularMinutes",
	"overtimeMinutes",
	"nightMinutes",
	"sundayMinutes",
] as const;

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
	weekday: "short",
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	timeZone: "UTC",
});

function formatDate(dateKey: string) {
	return dateFormatter.format(new Date(`${dateKey}T00:00:00Z`));
}

function cellKey(cell: CellCorrection) {
	return `${cell.row}-${cell.column}`;
}

function toggleInSet(current: Set<string>, value: string) {
	const next = new Set(current);

	if (next.has(value)) {
		next.delete(value);
	} else {
		next.add(value);
	}

	return next;
}

export function ExcelImport({ onUseShift }: ExcelImportProps) {
	const fileId = useId();
	const sheetId = useId();

	const [file, setFile] = useState<File | null>(null);
	const [fileName, setFileName] = useState("");
	const [sheets, setSheets] = useState<ParsedSheet[]>([]);
	const [sheetIndex, setSheetIndex] = useState(0);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [downloadError, setDownloadError] = useState<string | null>(null);
	// Corrections (by cell) the user chose not to apply; all apply by default.
	const [skippedCells, setSkippedCells] = useState<Set<string>>(new Set());
	// Dates whose automatic Sunday/holiday flag the user has flipped.
	const [toggledDates, setToggledDates] = useState<Set<string>>(new Set());

	const sheet = sheets[sheetIndex];

	const days = useMemo(() => {
		if (!sheet) {
			return [];
		}

		return groupShiftsByDate(
			sheet.shifts,
			(date) => isSundayOrHoliday(date) !== toggledDates.has(date),
		);
	}, [sheet, toggledDates]);

	const totals = useMemo(() => {
		return totalKeys.map((key) =>
			days.reduce((sum, day) => sum + (day.results?.[key] ?? 0), 0),
		);
	}, [days]);

	const corrections = useMemo(
		() => (sheet ? findCorrections(sheet.data, days) : []),
		[sheet, days],
	);

	const selectedCorrections = corrections.filter(
		(cell) => !skippedCells.has(cellKey(cell)),
	);

	async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];

		if (!file) {
			return;
		}

		setFile(file);
		setFileName(file.name);
		setDownloadError(null);
		setSheets([]);
		setSheetIndex(0);
		setToggledDates(new Set());
		setSkippedCells(new Set());
		setLoadError(null);

		try {
			const { default: readXlsxFile } = await import(
				"read-excel-file/browser"
			);
			const parsed = (await readXlsxFile(file)).flatMap(({ sheet, data }) => {
				const result = parseShiftSheet(data as unknown[][]);
				return result && (result.shifts.length || result.issues.length)
					? [{ name: sheet, data: data as unknown[][], ...result }]
					: [];
			});

			if (!parsed.length) {
				setLoadError(
					"No se encontro una hoja con columnas FECHA, HORA DE ENTRADA y HORA DE SALIDA con turnos registrados.",
				);
			}

			setSheets(parsed);
		} catch {
			setLoadError(
				"No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) valido.",
			);
		}
	}

	async function handleDownload() {
		if (!file || !sheet) {
			return;
		}

		setDownloadError(null);

		try {
			const workbook = applyCorrections(
				new Uint8Array(await file.arrayBuffer()),
				sheet.name,
				selectedCorrections,
			);
			const url = URL.createObjectURL(
				new Blob([workbook as BlobPart], {
					type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				}),
			);
			const link = document.createElement("a");
			link.href = url;
			link.download = fileName.replace(/(\.xlsx)?$/i, " (corregido).xlsx");
			link.click();
			URL.revokeObjectURL(url);
		} catch {
			setDownloadError(
				"No se pudo generar el Excel corregido: el archivo tiene un formato que no se puede editar.",
			);
		}
	}

	function toggleCorrection(key: string) {
		setSkippedCells((current) => toggleInSet(current, key));
	}

	function toggleDate(date: string) {
		setToggledDates((current) => toggleInSet(current, date));
	}

	return (
		<section className="results-card import-card">
			<div className="section-heading">
				<p className="eyebrow">Importar</p>
				<h2>Turnos desde Excel</h2>
			</div>

			<label className="field" htmlFor={fileId}>
				<span>Archivo Excel (.xlsx)</span>
				<input
					id={fileId}
					type="file"
					accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
					onChange={handleFileChange}
				/>
			</label>

			{loadError ? (
				<p className="status-message is-error">{loadError}</p>
			) : null}

			{sheets.length > 1 ? (
				<label className="field" htmlFor={sheetId}>
					<span>Hoja</span>
					<select
						id={sheetId}
						value={sheetIndex}
						onChange={(event) => {
							setSheetIndex(Number(event.target.value));
							setToggledDates(new Set());
							setSkippedCells(new Set());
						}}>
						{sheets.map((option, index) => (
							<option key={option.name} value={index}>
								{option.name}
							</option>
						))}
					</select>
				</label>
			) : null}

			{sheet ? (
				<>
					<p className="status-message is-ready">
						{fileName}: {days.length} dias con turnos en la hoja "
						{sheet.name}". Domingos y festivos se marcan
						automaticamente; puedes cambiarlos por dia.
					</p>

					{sheet.issues.length ? (
						<ul className="import-issues">
							{sheet.issues.map((issue) => (
								<li key={issue.row}>
									Fila {issue.row}: {issue.message}
								</li>
							))}
						</ul>
					) : null}

					<div className="results-table-wrap">
						<table className="results-table import-table">
							<thead>
								<tr>
									<th scope="col">Fecha</th>
									<th scope="col">Turnos</th>
									<th scope="col">Dom./Fest.</th>
									<th scope="col">Laborales</th>
									<th scope="col">Extra</th>
									<th scope="col">Nocturnas</th>
									<th scope="col">Dominicales</th>
								</tr>
							</thead>
							<tbody>
								{days.map((day) => (
									<tr key={day.date}>
										<th scope="row">{formatDate(day.date)}</th>
										<td>
											<ul className="shift-list">
												{day.shifts.map((shift) => (
													<li key={shift.row}>
														<button
															type="button"
															className="shift-button"
															title={
																shift.concept ||
																"Cargar en el formulario"
															}
															onClick={() =>
																onUseShift(
																	shift.start,
																	shift.end,
																	day.isSunday,
																)
															}>
															{shift.start} - {shift.end}
														</button>
													</li>
												))}
											</ul>
										</td>
										<td>
											<input
												type="checkbox"
												aria-label={`Dominical o festivo ${formatDate(day.date)}`}
												checked={day.isSunday}
												onChange={() => toggleDate(day.date)}
											/>
										</td>
										{day.results ? (
											totalKeys.map((key) => (
												<td key={key}>
													{formatDecimalHours(day.results![key])}
												</td>
											))
										) : (
											<td colSpan={4} className="import-error">
												{day.error}
											</td>
										)}
									</tr>
								))}
							</tbody>
							<tfoot>
								<tr>
									<th scope="row" colSpan={3}>
										Total
									</th>
									{totals.map((total, index) => (
										<td key={totalKeys[index]}>
											{formatDecimalHours(total)}
										</td>
									))}
								</tr>
							</tfoot>
						</table>
					</div>

					<div className="export-panel">
						<p className="status-message">
							{corrections.length
								? `${corrections.length} valores de la hoja no coinciden con el calculo. Marca las correcciones que quieres aplicar al descargar.`
								: "Los valores de la hoja ya coinciden con el calculo."}
						</p>

						{corrections.length ? (
							<ul className="corrections">
								{corrections.map((cell) => {
									const key = cellKey(cell);

									return (
										<li key={key}>
											<label
												title={`Celda ${columnLetter(cell.column)}${cell.row}`}>
												<input
													type="checkbox"
													checked={!skippedCells.has(key)}
													onChange={() => toggleCorrection(key)}
												/>
												<span>
													<strong>{formatDate(cell.date)}</strong> ·{" "}
													{cell.label}: {cell.previous || "vacio"} →{" "}
													{formatDecimalHours(cell.value * 60)}
												</span>
											</label>
										</li>
									);
								})}
							</ul>
						) : null}

						<button
							type="button"
							className="download-button"
							onClick={handleDownload}>
							{selectedCorrections.length
								? `Descargar Excel con ${selectedCorrections.length} correcciones`
								: "Descargar Excel sin cambios"}
						</button>

						{downloadError ? (
							<p className="status-message is-error">{downloadError}</p>
						) : null}
					</div>
				</>
			) : null}
		</section>
	);
}
