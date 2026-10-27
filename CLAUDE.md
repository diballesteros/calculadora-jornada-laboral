# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — type-check (`tsc -b`) then production build to `dist/`
- `npm run lint` — ESLint over the whole project
- `npm run preview` — serve the built `dist/`
- `npm test` — run Vitest once (`npm run test:watch` for watch mode); single test: `npx vitest run -t "<test name>"`

Tests live next to the code (`src/utils/*.test.ts`) and pin down the README calculation and import rules. The deploy workflow runs `npm test` before building, so a failing test blocks deployment.

## Architecture

Single-page React 19 + TypeScript + Vite app ("Calculadora de Horas") that splits a same-day work shift into hour categories. UI text is in Spanish.

- `src/utils/hours.ts` holds all business logic and is framework-free: `parseTimeToMinutes` → `calculateHours(start, end, isSunday)` returns a `HoursBreakdown` in **minutes** (or `null` when invalid), and `formatDecimalHours` converts minutes to decimal hours formatted with the `es-ES` locale. Change calculation rules here, not in components.
- `src/components/HoursCalculator.tsx` owns the form state (start/end selects in 30-minute steps, Sunday/holiday checkbox) and derives results and the error message with `useMemo`.
- `src/utils/holidays.ts` computes Colombian public holidays (fixed, Ley Emiliani Monday moves, Easter-based) for any year; dates are `YYYY-MM-DD` strings in UTC.
- `src/utils/excelImport.ts` turns raw sheet rows (`unknown[][]`) into shifts: it locates the FECHA / ENTRADA / SALIDA / CONCEPTO columns by header text (headers span two rows in the template), parses am/pm text times, and groups shifts by date via `calculateDayHours`. It has no spreadsheet-library dependency so it's tested with plain arrays.
- `src/components/ExcelImport.tsx` reads the file with `read-excel-file/browser` (lazy-loaded via dynamic `import()`), shows per-date results and totals, and lets the user flip the Sunday/holiday flag per date or load a shift into the form.
- `src/utils/excelExport.ts` writes the results back into the uploaded file: `findCorrections` compares the HORAS LABORADAS / EXTRAS / NOCTURNAS / DOMINICALES cells with per-row values (`calculateRowHours` gives a date's regular hours to its earliest shifts, overtime to later ones), and `applyCorrections` edits only those cells in the xlsx XML via `fflate` (string-level edits that keep each cell's style; new cells borrow the style of the cell above), so the template's formatting and other parts survive. The UI lists corrections by date with a checkbox each (all on by default) and only applies the checked ones. It assumes the rows from `read-excel-file` start at Excel row 1.
- `src/components/ResultsTable.tsx` renders rows from a `rows` array keyed by `HoursBreakdown` fields — adding a category means adding a field to `HoursBreakdown` and a row here.

### Calculation rules (from README)

- Overtime = everything beyond 8 hours; regular hours are capped at 8.
- Night hours = overlap with 18:00–24:00 and 00:00–06:00.
- Shifts cannot cross midnight: `end <= start` is invalid (returns `null`). `24:00` is accepted as an end time so a shift can finish at midnight.
- If "Dia Dominical" is checked, the whole shift counts as Sunday/holiday hours. Imports set it automatically for Sundays and Colombian holidays.
- Imported shifts sharing a date are summed and the 8-hour limit applies to the day's total (`calculateDayHours`); overlapping shifts on a date are an error.
- In imports, a `/` in both time cells marks a day off, and an end time of `00:00am` means 24:00.
- Categories overlap: the same hour can be night and Sunday at once, so the categories do not sum to the total.

## Deployment

Deployed to GitHub Pages by `.github/workflows/deploy-pages.yml` on every push to `main` (Node 22, `npm ci`, `npm test`, `npm run build`, uploads `dist/`). `vite.config.ts` sets `base: "/calculadora-jornada-laboral/"` to match the Pages repo name — keep it in sync if the repository is renamed.

## Code style

Source files under `src/` use tabs and double quotes (except the Vite-scaffolded `src/main.tsx`). Match the surrounding file.
