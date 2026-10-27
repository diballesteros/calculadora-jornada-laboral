import { useId, useMemo, useState } from "react";
import { ExcelImport } from "./ExcelImport";
import { ResultsTable } from "./ResultsTable";
import { calculateHours, formatDecimalHours } from "../utils/hours";

const timeOptions = Array.from({ length: 48 }, (_, index) => {
	const hours = Math.floor(index / 2);
	const minutes = index % 2 === 0 ? "00" : "30";

	return `${String(hours).padStart(2, "0")}:${minutes}`;
});

// A shift may end at midnight but cannot cross it, so only Fin offers 24:00.
const endTimeOptions = [...timeOptions.slice(1), "24:00"];

// Imported shifts can use times off the 30-minute grid; keep them selectable.
function withSelectedTime(options: string[], value: string) {
	return !value || options.includes(value)
		? options
		: [...options, value].sort();
}

export function HoursCalculator() {
	const startId = useId();
	const endId = useId();
	const sundayId = useId();

	const [startTime, setStartTime] = useState("");
	const [endTime, setEndTime] = useState("");
	const [isSunday, setIsSunday] = useState(false);

	function handleImportedShift(start: string, end: string, sunday: boolean) {
		setStartTime(start);
		setEndTime(end);
		setIsSunday(sunday);
		window.scrollTo({ top: 0, behavior: "smooth" });
	}

	const results = useMemo(() => {
		return calculateHours(startTime, endTime, isSunday);
	}, [endTime, isSunday, startTime]);

	const errorMessage = useMemo(() => {
		if (!startTime || !endTime) {
			return "Ingresa la hora de inicio y la hora de fin para calcular el turno.";
		}

		if (!results) {
			return "La hora de fin debe ser mayor que la hora de inicio. Los turnos no pueden pasar a otro dia.";
		}

		return null;
	}, [endTime, results, startTime]);

	return (
		<main className="app-shell">
			<section className="calculator-grid">
				<form
					className="form-card"
					onSubmit={(event) => event.preventDefault()}>
					<div className="section-heading">
						<p className="eyebrow">Calculadora de jornada</p>
					</div>

					<label className="field" htmlFor={startId}>
						<span>Inicio</span>
						<select
							id={startId}
							value={startTime}
							onChange={(event) =>
								setStartTime(event.target.value)
							}>
							<option value="">Selecciona una hora</option>
							{withSelectedTime(timeOptions, startTime).map((time) => (
								<option key={time} value={time}>
									{time}
								</option>
							))}
						</select>
					</label>

					<label className="field" htmlFor={endId}>
						<span>Fin</span>
						<select
							id={endId}
							value={endTime}
							onChange={(event) =>
								setEndTime(event.target.value)
							}>
							<option value="">Selecciona una hora</option>
							{withSelectedTime(endTimeOptions, endTime).map((time) => (
								<option key={time} value={time}>
									{time}
								</option>
							))}
						</select>
					</label>

					<label className="checkbox-field" htmlFor={sundayId}>
						<input
							id={sundayId}
							type="checkbox"
							checked={isSunday}
							onChange={(event) =>
								setIsSunday(event.target.checked)
							}
						/>
						<span>Dia Dominical</span>
					</label>

					<p
						className={`status-message ${errorMessage ? "is-error" : "is-ready"}`}>
						{errorMessage ??
							"Resultados actualizados con el turno actual."}
					</p>

					<div
						className="summary-strip"
						aria-label="Resumen del turno">
						<div>
							<span>Turno</span>
							<strong>
								{startTime && endTime
									? `${startTime} - ${endTime}`
									: "Sin definir"}
							</strong>
						</div>
						<div>
							<span>Total</span>
							<strong>
								{results
									? `${formatDecimalHours(results.totalMinutes)} h`
									: "--"}
							</strong>
						</div>
					</div>
				</form>

				{results ? (
					<ResultsTable results={results} />
				) : (
					<div className="results-card empty-state">
						<div className="section-heading">
							<p className="eyebrow">Resumen</p>
							<h2>Detalle del turno</h2>
						</div>
						<p>
							Completa un rango valido para ver Horas Laborales,
							Horas Extra, Horas Nocturnas y Horas Dominicales.
						</p>
					</div>
				)}
			</section>

			<ExcelImport onUseShift={handleImportedShift} />
		</main>
	);
}
