# Dividendi kontroll

Dividendide jätkusuutlikkuse kontroll, ex-kuupäevade kalender ja portfelli skaneerimine (≥5% tootlus).

## Kohalik käivitus

```bash
npm install
npm start
```

Ava: http://localhost:3847

## Veebis (Render)

1. Mine [Render Dashboard](https://dashboard.render.com/)
2. **New → Blueprint** → ühenda GitHub repo `dividendi-kontroll`
3. Render loob teenuse automaatselt `render.yaml` põhjal

## API

- `GET /api/analyze/:symbol` — aktsia analüüs
- `GET /api/calendar?days=45` — ex-dividendi kalender
- `GET /api/portfolio` — portfelli ülevaade
- `GET /api/health` — tervisekontroll

Andmed: Yahoo Finance. Informatiivne tööriist — mitte finantsnõuanne.
