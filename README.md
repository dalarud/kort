# Kortkollen ⚽📸

**Värdera fotbollskort med mobilkameran.** Rikta kameran mot kortet, tryck på knappen och få:

- **Identifiering** – spelare, lag, säsong, tillverkare, serie, kortnummer, parallell, numrering, rookie/autograf/tröjbit och graderingsetikett.
- **Skickbedömning** – centrering, hörn, kanter, yta och ett uppskattat PSA-betyg.
- **Värdering** – intervall (lågt / troligt / högt) i SEK eller annan valuta, med källor, jämförbara försäljningar och säkerhetsnivå.
- **Graderingsråd** – vad kortet kan vara värt som PSA 8/9/10 och om gradering lönar sig.
- **Samling** – spara korten lokalt i telefonen, se totalvärdet, sök, sortera och exportera till CSV (Excel).

Appen är en installerbar webbapp (PWA) och fungerar på iPhone, Android och dator utan App Store.
Hela planeringen – krav, arkitektur, värderingsmetod, risker och teststrategi – finns i
[`docs/PLAN.md`](docs/PLAN.md).

---

## Snabbstart

Kräver **Node.js 20.19+** (eller 22.12+).

```bash
npm install
npm run dev          # API på :8787 + webbapp på http://localhost:5173
```

Utan API-nyckel körs appen i **demoläge**: allt fungerar, men korten som "hittas" är påhittade
exempelkort (märkta DEMO) och värdet kommer från regelmotorn. Bra för att prova flödet gratis.

### Riktig identifiering och värdering

```bash
cp .env.example .env
# fyll i ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Med nyckel identifierar Claude kortet från bilden och söker på webben efter faktiska försäljningar
(eBay sålda, 130point, PSA APR, Tradera …). Lägg gärna till eBay-nycklar för en extra priskälla.

### Testa på mobilen

Kameran fungerar bara över **HTTPS** (eller `localhost`). För att testa från telefonen på samma wifi:

```bash
npm run dev:phone    # Vite med självsignerat certifikat
```

Öppna adressen som visas under `Network` (t.ex. `https://192.168.1.20:5173`) i telefonen och
godkänn certifikatvarningen. Alternativt: kör en tunnel som `cloudflared tunnel --url http://localhost:5173`.

---

## Så fungerar det

```
Mobil (PWA)                              Server (Fastify)
───────────                              ────────────────
Kamera + kortram                          POST /api/scan
Live-kontroll: ljus, reflexer, skärpa ──►   ├─ Claude vision → strukturerad JSON (Zod)
Beskärning till ramen, JPEG ≤1568 px        └─ Värderingstjänst (parallellt, cache 24 h)
                                                 ├─ Webbsökning efter sålda kort (Claude + web_search)
Resultat (redigerbart) ◄─────────────────        ├─ eBay Browse API (aktiva annonser, valfritt)
Samling i IndexedDB                              └─ Regelmotor (alltid, låg vikt)
                                              → viktat geometriskt medelvärde → valuta (ECB-kurser)
```

- **Identifieringen** använder `claude-opus-5-5` med strukturerad output, adaptivt tänkande och
  server-side fallback vid avslag. Svaret valideras och normaliseras (betyg 1–10, numrering → upplaga).
- **Värderingen** väger ihop källorna efter säkerhet (confidence²) i log-skala. Oense källor ger
  bredare intervall och lägre säkerhet. Detaljer i [`docs/PLAN.md` §6](docs/PLAN.md#6-värderingsmetod).
- **Fel i identifieringen?** Tryck *Rätta*, ändra fälten och *Värdera om* – då körs bara värderingen igen.

## Projektstruktur

```
shared/   Zod-scheman, typer, värderingsmotor, aggregering, valuta (används av server + webb)
server/   Fastify-API: Claude-identifiering, prisleverantörer, säkerhet, statisk servering
web/      React-PWA: kamera, resultat, samling, inställningar
e2e/      Playwright-tester (fejkad kamera, demoläge)
docs/     Projektplan
```

## Kommandon

| Kommando | Vad |
|---|---|
| `npm run dev` | API + webbapp med hot reload |
| `npm run dev:phone` | Som ovan men webbappen över HTTPS (för mobiltest) |
| `npm run build` | Produktionsbygge av webb (`web/dist`) och server (`server/dist`) |
| `npm start` | Kör produktionsbygget – servern serverar både API och app på en port |
| `npm run typecheck` | TypeScript-kontroll av alla paket |
| `npm test` | Enhets- och integrationstester (Vitest) |
| `npm run test:e2e` | End-to-end-tester i Chromium med fejkad kamera (kör `npm run build` först) |

## Konfiguration

Alla inställningar görs med miljövariabler – se [`.env.example`](.env.example).

| Variabel | Standard | Beskrivning |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Aktiverar AI-identifiering. Saknas den körs demoläge. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Modell för identifiering och prisresearch |
| `PRICE_RESEARCH` | `web` | `off` stänger av webbsökningen (billigare, sämre priser) |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | – | Aktiverar eBay som priskälla |
| `EBAY_MARKETPLACE` | `EBAY_US` | t.ex. `EBAY_GB`, `EBAY_DE` |
| `APP_ACCESS_TOKEN` | – | Kräver åtkomstnyckel (anges under *Inställningar* i appen) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | `30` / `10 minutes` | Skanningar per IP och tidsfönster |
| `DEFAULT_CURRENCY` | `SEK` | Valuta om appen inte anger någon |
| `GRADING_COST_SEK` | `350` | Graderingskostnad i graderingsrådet |
| `DEMO_MODE` | auto | `true` tvingar demoläge |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | |

## Driftsättning

Servern serverar både API och den byggda webbappen, så det räcker med **en** tjänst.

```bash
docker build -t kortkollen .
docker run -p 8080:8080 -e ANTHROPIC_API_KEY=sk-ant-... -e APP_ACCESS_TOKEN=valfri-hemlighet kortkollen
```

Fungerar på t.ex. Fly.io, Render, Railway eller en egen server bakom HTTPS (krävs för kameran).
Sätt gärna `APP_ACCESS_TOKEN` om adressen är publik, så att ingen annan förbrukar din API-kvot.

Utan Docker: `npm ci && npm run build && npm start`.

## API

| Metod | Sökväg | Beskrivning |
|---|---|---|
| `GET` | `/api/health` | Läge (`live`/`demo`), modell, priskällor |
| `GET` | `/api/rates` | Växelkurser (bas USD) |
| `POST` | `/api/scan` | `{ front, back?, currency? }` – bilder som data-URL (JPEG/PNG/WebP, max 8 MB) |
| `POST` | `/api/valuate` | `{ identification, condition, currency? }` – värdera om efter rättning |

Fel returneras som `{ "error": { "code": "...", "message": "..." } }` med svenska meddelanden.

## Integritet och kostnad

- Bilderna skickas till servern (och Claude) för analys men **sparas inte** på servern.
- Samlingen ligger **bara lokalt** i webbläsaren på din enhet.
- Värderingar cachas i 24 h per kort, och det finns rate limiting per IP.

## Ansvarsfriskrivning

Värderingarna är uppskattningar baserade på tillgänglig marknadsdata och AI-analys av en bild.
Verkliga försäljningspriser kan avvika kraftigt beroende på skick, äkthet, efterfrågan och
försäljningskanal. Kontrollera alltid jämförbara försäljningar innan du köper eller säljer.
