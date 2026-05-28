# Calculadora de Horas

Aplicacion frontend en React para calcular un turno del mismo dia con tres campos:

- `Inicio`
- `Fin`
- `Dia Dominical`

Resultados mostrados en formato decimal:

- `Horas Laborales`
- `Horas Extra`
- `Horas Nocturnas`
- `Horas Dominicales`

## Reglas

- Las horas extra son todas las que excedan 8 horas.
- Las horas nocturnas se calculan entre las 19:00 y las 06:00.
- Los turnos no pueden cruzar a otro dia.
- Si `Dia Dominical` esta marcado, todo el turno cuenta como dominical o feriado.
- Las categorias son superpuestas. Una misma hora puede ser nocturna y dominical al mismo tiempo.

## Desarrollo local

```bash
npm install
npm run dev
```

## Build de produccion

```bash
npm run build
```

## Despliegue

La app es totalmente estatica y se puede desplegar facilmente en:

- Vercel
- Netlify
- GitHub Pages
