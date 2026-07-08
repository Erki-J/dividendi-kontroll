# Dividendi kontroll

Dividendide jätkusuutlikkuse kontroll, ex-kuupäevade kalender ja portfelli skaneerimine (≥5% tootlus).

**GitHub:** https://github.com/Erki-J/dividendi-kontroll

**Veebileht:** https://dividendi-kontroll.vercel.app

## Veebileht (Render — tasuta)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Erki-J/dividendi-kontroll)

1. Klõpsa nuppu **Deploy to Render** (või mine [Render Dashboard → New → Blueprint](https://dashboard.render.com/select-repo?type=blueprint))
2. Ühenda GitHub konto ja vali repo `dividendi-kontroll`
3. Render loob teenuse automaatselt (`render.yaml`)
4. ~2 min pärast on leht valmis aadressil `https://dividendi-kontroll.onrender.com` (või sarnane URL)

*Renderi tasuta plaan magab pärast tegevusetust — esimene laadimine võib võtta ~30 sek.*

## Kohalik käivitus

```bash
npm install
npm start
```

Ava: http://localhost:3847

## API

- `GET /api/analyze/:symbol` — aktsia analüüs
- `GET /api/calendar?days=45` — ex-dividendi kalender
- `GET /api/portfolio` — portfelli ülevaade
- `GET /api/health` — tervisekontroll

Andmed: Yahoo Finance. Informatiivne tööriist — mitte finantsnõuanne.
