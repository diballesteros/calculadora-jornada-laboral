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
- Las horas nocturnas se calculan entre las 18:00 y las 06:00.
- Los turnos no pueden cruzar a otro dia. Un turno puede terminar a las 24:00.
- Si `Dia Dominical` esta marcado, todo el turno cuenta como dominical o feriado.
- Las categorias son superpuestas. Una misma hora puede ser nocturna y dominical al mismo tiempo.

## Importar desde Excel

Se puede cargar un archivo `.xlsx` con el formato de horas extras (columnas `FECHA`, `HORA DE ENTRADA`, `HORA DE SALIDA` y opcionalmente `CONCEPTO`). El archivo se procesa solo en el navegador.

- Las horas se aceptan como `05:30am`, `03:30pm`, `00.00am`, `17:00` o celdas de hora de Excel.
- Las filas con `/` en entrada y salida se consideran dias de descanso y se omiten.
- Una salida a las `00:00am` significa el final del dia (24:00).
- Los turnos con la misma fecha se suman y el limite de 8 horas se aplica al total del dia.
- Los domingos y festivos de Colombia se marcan automaticamente y se pueden cambiar por dia.
- Al hacer clic en un turno importado se cargan sus valores en el formulario.

### Descargar el Excel corregido

Despues de importar, la app compara las columnas `HORAS LABORADAS`, `EXTRAS A REPORTAR`, `NOCTURNAS` y `DOMINICALES` de cada fila con el calculo y lista por fecha los valores que no coinciden. Cada correccion tiene una casilla, marcada por defecto; al descargar se genera una copia del mismo archivo con solo las correcciones marcadas aplicadas. Las celdas conservan su formato original y el resto del archivo (imagenes, otras hojas) no cambia.

- Cuando un dia tiene varios turnos, las 8 horas laborales se asignan a los primeros turnos del dia y las extras a los siguientes.
- Las celdas vacias que deberian ser 0 se dejan vacias.
- Las filas con errores (horas no reconocidas o turnos superpuestos) no se modifican.

## Desarrollo local

```bash
npm install
npm run dev
```

## Pruebas

```bash
npm test
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

## GitHub Pages

Este proyecto ya esta preparado para publicarse en GitHub Pages desde el repositorio:

- `diballesteros/calculadora-jornada-laboral`

Pasos:

1. Haz commit y push de la rama `main`.
2. En GitHub, abre `Settings > Pages`.
3. En `Source`, selecciona `GitHub Actions`.
4. El workflow publicara automaticamente la app cada vez que haya cambios en `main`.

La URL esperada de publicacion sera:

- `https://diballesteros.github.io/calculadora-jornada-laboral/`
