# Kortkollen – projektplan

> Värdera fotbollskort genom att fotografera dem med mobilkameran.

Det här dokumentet beskriver hela planeringen: mål, krav, arkitektur, värderingsmetod,
risker, teststrategi och genomförandet i etapper. Allt som står under **Etapp 1–6**
finns implementerat i repot.

---

## 1. Vision och mål

**Problem.** Den som har en pärm med fotbollskort (Panini, Topps, Merlin, Adrenalyn,
klistermärken, graderade kort …) vet sällan vad korten är värda. Att själv slå upp
varje kort på eBay, Tradera eller 130point tar lång tid och kräver att man vet exakt
vilken utgåva, parallell och numrering det är.

**Lösning.** En mobilapp där man riktar kameran mot kortet, trycker på en knapp och
inom några sekunder får:

1. **Identifiering** – spelare, lag, säsong, tillverkare, serie, kortnummer,
   parallell/variant, numrering (t.ex. 23/99), rookie, autograf, tröjbit, graderingsetikett.
2. **Skickbedömning** – centrering, hörn, kanter, yta och ett uppskattat
   PSA-ekvivalent betyg.
3. **Värdering** – ett prisintervall (lågt / troligt / högt) i SEK, med källor,
   jämförbara försäljningar och ett tydligt säkerhetsmått.
4. **Samling** – spara korten, se samlingens totala värde, exportera.

**Mål för version 1**

| Mål | Mätetal |
|---|---|
| Snabb skanning | < 15 s från knapptryck till identifierat kort (utan webbsökning) |
| Korrekt identifiering | ≥ 85 % rätt spelare + serie på tydliga foton |
| Ärlig värdering | Varje värde visar intervall, källor och säkerhet – aldrig en "exakt" siffra |
| Fungerar på alla mobiler | PWA i webbläsaren, installerbar, ingen App Store krävs |
| Kostnadskontroll | Rate limiting, valfri åtkomstnyckel, cache av värderingar |

**Utanför scope för v1:** köp/sälj-funktion, inloggning/molnsynk av samling,
äkthetskontroll av förfalskningar, andra sporter (fungerar delvis men är inte testat).

---

## 2. Användare och användarberättelser

**Personas**
- *Samlaren* (30–50 år) med gamla pärmar från 90-talet som vill veta om något är värt pengar.
- *Föräldern* vars barn byter Adrenalyn/Match Attax-kort och vill veta vad som är "bra".
- *Säljaren* som snabbt vill prissätta kort inför försäljning på Tradera/eBay.

**Användarberättelser (MVP)**

| # | Som … | vill jag … | så att … |
|---|---|---|---|
| U1 | samlare | fotografera ett kort med kameran | jag slipper skriva in uppgifter |
| U2 | samlare | få tydlig hjälp att hålla kortet rätt (ram, ljus, skärpa) | bilden blir bra nog att analysera |
| U3 | samlare | även fota baksidan (valfritt) | kortnummer och årtal kan läsas av |
| U4 | användare utan kamera/behörighet | ladda upp en bild från galleriet | appen fungerar ändå |
| U5 | samlare | se vilket kort appen tror det är | jag kan kontrollera identifieringen |
| U6 | samlare | rätta fel i identifieringen och värdera om | värdet blir rätt även om AI:n gissar fel |
| U7 | samlare | se skickbedömning och vad kortet kan vara värt graderat | jag kan avgöra om gradering lönar sig |
| U8 | säljare | se källor och jämförbara annonser med länkar | jag kan lita på/verifiera priset |
| U9 | samlare | spara kort i en samling och se totalvärdet | jag har koll på hela samlingen |
| U10 | samlare | exportera samlingen som CSV | jag kan använda den i Excel/försäkring |
| U11 | användare | välja valuta (SEK, EUR, USD, NOK, DKK, GBP) | värdet visas i min valuta |
| U12 | ägare av appen | skydda servern med en åtkomstnyckel | ingen annan förbrukar min API-kvot |

---

## 3. Teknikval

| Område | Val | Motivering |
|---|---|---|
| Klient | **PWA** – React 19 + TypeScript + Vite | En kodbas för iOS/Android/desktop, kamera via `getUserMedia`, installerbar, ingen app-butik |
| Server | **Node.js + Fastify 5** (TypeScript) | Håller API-nycklar hemliga, snabb, enkel att driftsätta |
| Bildigenkänning | **Claude (Anthropic API), vision + strukturerad output** | Läser text, logotyper, parallellfärger, graderingsetiketter; returnerar validerad JSON (Zod) |
| Prisdata | Pluggbara **prisleverantörer** (se §6) | Ingen enskild gratis källa har pålitliga fotbollskortspriser – vi väger ihop flera |
| Lagring (klient) | **IndexedDB** (idb-keyval) | Samlingen ligger lokalt på telefonen, fungerar offline, ingen inloggning |
| Delad logik | `@kort/shared` – Zod-scheman, värderingsmotor, valuta | Samma typer och regler i klient och server, enhetstestat |
| Tester | **Vitest** (enhet/integration) + **Playwright** (E2E med fejkad kamera) | Snabbt och täcker hela flödet |
| Drift | **Docker** (en container serverar API + byggd klient) | Fungerar på Fly.io, Render, Railway, egen VPS |
| CI | **GitHub Actions** | Typkontroll, tester, bygge och E2E på varje push |

**Varför inte en native-app?** Kameran i webbläsaren räcker gott för stillbilder av
kort, och en PWA slipper granskning i App Store/Google Play. Om vi senare behöver
t.ex. bakgrundsskanning av många kort kan klienten flyttas till React Native/Expo
utan att servern ändras.

---

## 4. Arkitektur

```
┌──────────────────────────── Mobil (PWA) ─────────────────────────────┐
│  Kameravy ─► kvalitetskontroll (ljus/skärpa) ─► beskärning till ram  │
│        │                                     ─► JPEG ≤ 1568 px        │
│        ▼                                                              │
│  POST /api/scan  { front, back?, currency }                           │
│        ▲                                                              │
│  Resultatvy (redigerbar) ─► POST /api/valuate ─► Samling (IndexedDB)  │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ HTTPS
┌──────────────────────────── Server (Fastify) ────────────────────────┐
│  Säkerhet: åtkomstnyckel · rate limit · storleks- & bildvalidering    │
│                                                                      │
│  CardIdentifier ──► Claude vision (Zod-schema)  | DemoIdentifier     │
│        │                                                             │
│        ▼                                                             │
│  ValuationService ─┬─► WebResearchProvider (Claude + web_search)      │
│   (cache 24 h)     ├─► EbayBrowseProvider (aktiva annonser, valfri)   │
│                    └─► HeuristicProvider (regelmotor, alltid)         │
│        │                                                             │
│        ▼                                                             │
│  aggregate() ─► valutaomräkning (Frankfurter/ECB, fallback-kurser)    │
└──────────────────────────────────────────────────────────────────────┘
```

### Kataloger

```
shared/   Zod-scheman, typer, värderingsmotor, aggregering, valuta (ren TS)
server/   Fastify-API, Claude-integration, prisleverantörer
web/      React-PWA: kamera, resultat, samling, inställningar
e2e/      Playwright-tester (fejkad kamera, demoläge)
docs/     Denna plan
```

### API

| Metod | Sökväg | Beskrivning |
|---|---|---|
| `GET` | `/api/health` | Status, läge (`live`/`demo`), aktiva prisleverantörer |
| `GET` | `/api/rates` | Aktuella växelkurser (bas USD) |
| `POST` | `/api/scan` | `{ front, back?, currency? }` (base64-JPEG/PNG/WebP) → identifiering + skick + värdering |
| `POST` | `/api/valuate` | `{ identification, condition, currency? }` → ny värdering (efter manuell rättning) |

Fel returneras som `{ error: { code, message } }` med svenska meddelanden.

### Datamodell (förkortad)

```ts
CardIdentification {
  isCard, player, team, season, manufacturer, set, cardNumber,
  parallel, serialNumber, printRun, insert,
  isRookie, isAutograph, isMemorabilia,
  cardType: "trading_card" | "sticker" | "game_card" | "other",
  playerPopularity: "legend" | "superstar" | "star" | "regular" | "unknown",
  grading: { isGraded, company, grade, certNumber },
  searchQuery, confidence (0–1), notes
}
ConditionAssessment { centering, corners, edges, surface, overall (1–10), summary, issues[] }
Valuation {
  currency, low, mid, high, confidence, confidenceLabel,
  sources: ProviderEstimate[], comparables: Comparable[],
  gradeScenarios: { grade, value }[], gradingAdvice, rates, generatedAt, disclaimer
}
SavedCard { id, createdAt, updatedAt, image, thumbnail, identification, condition, valuation }
```

---

## 5. Kameraflödet i detalj

1. **Starta kameran** med `facingMode: environment` och hög upplösning (ideal 1920×1080).
   Ficklampa (torch) visas om enheten stödjer det.
2. **Ram i kortformat** (63 × 88 mm, stående; kan vridas till liggande).
3. **Live-kvalitetskontroll** var 300:e ms på en nedskalad bild av ramen:
   - *Ljus*: medelluminans – "För mörkt" / "För ljust / reflexer".
   - *Skärpa*: varians av Laplace-filtret – "Håll stilla".
   - Knappen blir grön när bilden är bra (men går alltid att trycka).
4. **Beskärning**: ramens position i CSS översätts till videons pixelkoordinater
   (hänsyn till `object-fit: cover`), beskärs i full upplösning, skalas till max
   1568 px (optimalt för Claude vision) och kodas som JPEG.
5. **Baksida (valfritt)**: samma flöde – kan hoppas över.
6. **Fallback**: filuppladdning (`<input type="file" accept="image/*">`) om kameran
   saknas eller nekas.

> Kameran kräver **HTTPS** (eller `localhost`). Se README för hur man testar på mobilen.

---

## 6. Värderingsmetod

Ingen gratis, öppen databas har tillförlitliga priser på fotbollskort. Därför väger
appen ihop flera **prisleverantörer**, var och en med eget säkerhetsmått:

| Leverantör | Data | Kräver | Säkerhet |
|---|---|---|---|
| `web_research` | Claude söker på webben (eBay sålda, 130point, Card Ladder, Tradera, PSA APR …) och rapporterar faktiska försäljningar via ett strikt verktygsanrop | `ANTHROPIC_API_KEY` + `PRICE_RESEARCH=web` | Hög om ≥ 3 jämförbara försäljningar |
| `ebay_active` | eBay Browse API – aktiva annonser i kategori 261328, trimmat median, rabatt (−15 %) eftersom utropspris > slutpris | `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` | Medel |
| `heuristic` | Regelmotor: produktnivå × spelarpopularitet × parallell/numrering × rookie/autograf/tröjbit × ålder × skick/gradering | – | Låg (alltid med, som golv) |

**Aggregering** (`shared/src/valuation/aggregate.ts`): priser är log-normalfördelade,
så mittvärdet är ett viktat *geometriskt* medelvärde där vikten är leverantörens
säkerhet. Heuristiken får låg vikt när bättre källor finns. Totalsäkerheten sänks om
källorna är oense (stor spridning).

**Skick → värde.** Ograderade kort skalas med skicksfaktor (10 → 1,0 … ≤ 4 → 0,2).
Graderade kort använder en multiplikatortabell per betyg (PSA 10 ≈ 3× ett
råkort i toppskick, PSA 9 ≈ 1,4×, PSA 8 ≈ 1,0×, …).

**Graderingsråd.** Utifrån uppskattat betyg räknar appen fram troligt graderat värde
och jämför med kostnaden (standard 350 kr inkl. frakt, konfigurerbart). Rådet blir
"Gradering lönar sig troligen", "Kan vara värt det" eller "Lönar sig troligen inte".

**Valuta.** Alla interna beräkningar i USD; omräkning med dagliga ECB-kurser via
Frankfurter (cache 12 h) och inbyggda reservkurser om tjänsten inte nås.

**Transparens.** Varje värdering visar intervall, säkerhet (Låg/Medel/Hög), alla
källor med motivering och jämförbara försäljningar med länkar, samt en
ansvarsfriskrivning.

---

## 7. Prompt- och AI-design

- **Modell:** `claude-opus-5-5` (konfigurerbar via `CLAUDE_MODEL`), adaptivt tänkande,
  `effort: medium` för identifiering.
- **Strukturerad output:** Zod-schema → `output_config.format`; svaret valideras
  automatiskt (`parsed_output`) och normaliseras (klampning av betyg 1–10, säkerhet 0–1).
- **Regler i systemprompten:** gissa aldrig – okänt fält = `null` och lägre
  `confidence`; skilj på parallellfärger/refractor; läs numrering och graderingsetikett
  ordagrant; bedöm skick försiktigt (reflexer/upplösning kan dölja skador); `isCard=false`
  om bilden inte visar ett kort; fritext på svenska.
- **Webbsökning:** `web_search` (max 5 sökningar) + egendefinierat verktyg
  `report_valuation` med `strict: true` som Claude anropar när underlaget är klart.
  `pause_turn` hanteras genom att fortsätta turen.
- **Avslag:** `stop_reason: "refusal"` hanteras före läsning av innehållet;
  server-side `fallbacks: "default"` är påslaget.
- **Demoläge:** utan API-nyckel returnerar servern påhittade exempelkort
  (märkta DEMO) så att hela flödet kan testas utan kostnad.

---

## 8. Säkerhet, integritet och kostnad

- API-nycklar finns **bara på servern** (miljövariabler), aldrig i klienten.
- `APP_ACCESS_TOKEN` (valfri): kräver headern `x-app-token` – för privata driftsättningar.
- **Rate limiting** per IP (standard 30 skanningar / 10 min).
- **Validering**: max 12 MB request, bara JPEG/PNG/WebP (magic bytes), Zod på all indata.
- **Integritet**: bilder sparas inte på servern. Samlingen ligger lokalt i webbläsaren.
- **Kostnad**: värderingscache (24 h) per normaliserat kort; webbsökning kan stängas av.
  Ungefärlig kostnad per skanning: identifiering ≈ 2–3k tokens in (bild) + ~1k ut;
  webbsökning tillkommer.

---

## 9. Risker och åtgärder

| Risk | Sannolikhet | Konsekvens | Åtgärd |
|---|---|---|---|
| Fel identifiering (liknande paralleller) | Medel | Fel värde | Visa säkerhet, redigerbar identifiering, valfri baksida, "Värdera om" |
| Felaktiga/inaktuella priser | Hög | Missvisande värde | Flera källor, intervall, källhänvisning, ansvarsfriskrivning |
| Reflexer/dåligt ljus | Hög | Dålig skickbedömning | Live-kvalitetskontroll, ficklampa, tips i UI |
| Skickbedömning från foto är osäker | Hög | Felaktigt graderingsråd | Betyg presenteras som uppskattning, rådet tar höjd för osäkerhet |
| API-kostnad skenar | Låg | Kostnad | Rate limit, åtkomstnyckel, cache, webbsökning valfri |
| Förfalskningar | Låg | Övervärdering | Utanför scope v1 – nämns i friskrivningen |
| eBay API-villkor | Låg | Avstängd nyckel | Endast officiellt API, inga skrapor |
| Kamera nekas/saknas | Medel | Kan inte skanna | Filuppladdning som fallback |

---

## 10. Teststrategi

| Nivå | Verktyg | Vad |
|---|---|---|
| Enhet | Vitest | Värderingsmotor, aggregering, valuta, graderingsråd, scheman/normalisering, bildkvalitet (luminans/skärpa), beskärningsmatematik, CSV-export |
| Integration | Vitest + `fastify.inject` | Alla API-rutter med fejkad identifierare/leverantörer, felkoder, åtkomstnyckel, bildvalidering; Claude-integrationen med stubbad klient; eBay-parsning med mockad `fetch` |
| E2E | Playwright (Chromium med fejkad kamera) | Skanna → resultat → spara → samling → totalvärde; uppladdningsflödet; rättning och omvärdering |
| Manuell | Riktiga mobiler | iOS Safari + Android Chrome: kamerabehörighet, ficklampa, installation som app |

---

## 11. Etapper (genomförande)

| Etapp | Innehåll | Status |
|---|---|---|
| 1. Grund | Monorepo (npm workspaces), TypeScript, Vitest, delade scheman | ✅ |
| 2. Värderingsmotor | Heuristik, skick/gradering, aggregering, valuta, graderingsråd + tester | ✅ |
| 3. Server | Fastify-API, Claude-identifiering, webbsökning, eBay, demoläge, säkerhet + tester | ✅ |
| 4. Klient | Kamera med ram & kvalitetskontroll, uppladdning, resultat, redigering, samling, inställningar, PWA | ✅ |
| 5. Kvalitet | E2E-tester med fejkad kamera, CI-workflow | ✅ |
| 6. Drift | Dockerfile, README med driftsättning och mobiltest | ✅ |

### Färdplan efter v1

1. **Batch-skanning** – fota en hel pärmsida (9 kort) och dela upp automatiskt.
2. **Prishistorik** – spara värderingar över tid, visa trend per kort och för samlingen.
3. **Molnsynk** – valfritt konto för att synka samlingen mellan enheter.
4. **Tradera-integration** – svenska slutpriser som egen leverantör.
5. **Perspektivkorrigering** – hitta kortets hörn automatiskt (OpenCV.js) i stället för fast ram.
6. **Native-app** (Expo) om det behövs för t.ex. bakgrundsuppladdning.
7. **Äkthetsindikatorer** – varningar för kända förfalskningsmönster.
