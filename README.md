# FoldNote

Anteckningar där varje stycke kan bära flera alternativa formuleringar
samtidigt. Skriv ett stycke, lägg till en omformulering bredvid, och
låt båda ligga kvar tills du vet vilken som var bäst.

Flask i botten, vanlig HTML/CSS/JS på framsidan — inget byggsteg, inga
npm-beroenden, inget CDN. Enda Python-beroendet är Flask. All data
ligger i en enda JSON-fil.

## Kom igång

```bash
git clone https://github.com/DITT-NAMN/foldnote.git
cd foldnote
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Öppna `http://localhost:5000`.

### På telefonen

Servern lyssnar på `0.0.0.0`, så vilken enhet som helst på samma Wi-Fi
kommer åt den. Ta reda på datorns IP med `ipconfig` (Windows),
`ipconfig getifaddr en0` (macOS) eller `hostname -I` (Linux) och gå till
`http://DIN-IP:5000`.

Är port 5000 upptagen — vanligt på macOS på grund av AirPlay — kör
`PORT=5050 python app.py`.

## Data

Allt ligger i `data/foldnote.json`. Vill du säkerhetskopiera: kopiera
filen. Vill du flytta till en annan dator: kopiera filen. Vill du rätta
ett stavfel i tio anteckningar på en gång: öppna filen i en
textredigerare.

```json
{
  "version": 1,
  "notes": [
    {
      "id": "…",
      "title": "Pitch",
      "tags": "jobb",
      "created_at": "2026-09-15T17:15:17",
      "updated_at": "2026-09-15T18:02:44",
      "segments": [
        {
          "id": "…",
          "original": "Vi bygger verktyg.",
          "versions": [
            { "id": "…", "label": "Kort", "text": "Vi bygger verktyg." },
            { "id": "…", "label": "Utförlig", "text": "Vi bygger praktiska verktyg för eget bruk." }
          ]
        }
      ]
    }
  ]
}
```

Varje skrivning går först till `foldnote.json.tmp` i samma mapp och byts
sedan in med `os.replace`, som är atomärt på Linux, macOS och Windows.
Ett avbrott mitt i en skrivning kan alltså aldrig lämna en halv fil —
antingen ligger den gamla versionen kvar eller den nya. Skulle filen
ändå bli oläslig startar appen tom och lägger undan den trasiga filen
som `foldnote-trasig-DATUM.json` i stället för att skriva över den.

**Begränsningen värd att känna till:** hela filen läses och skrivs vid
varje ändring, och sparar du från två enheter i exakt samma sekund
vinner den sista. För en app du kör själv spelar det ingen roll. Först
vid tusentals anteckningar, eller om flera personer ska skriva samtidigt,
blir en riktig databas motiverad.

Knapparna **Exportera** och **Importera** nere till vänster laddar ner
respektive läser in samma JSON-format. Importerade anteckningar läggs
till med nya id:n — inget befintligt skrivs över.

Startar du appen och det redan finns en `data/foldnote.db` eller
`data/foldnote.xlsx` från en tidigare version flyttas innehållet över
automatiskt, och originalfilen döps om till `foldnote-gammal.*`.
För xlsx krävs `pip install openpyxl` den gången, sedan aldrig mer.

## Layout

Under 760 px bredd blir anteckningslistan en låda som glider in från
vänster. Över 1000 px står originaltexten och formuleringarna sida vid
sida i varje stycke — det är hela poängen med en bred skärm, att kunna
jämföra dem utan att scrolla. Över 1500 px ställs formuleringarna i två
kolumner.

## Tema

Knappen nere till vänster växlar Auto → Ljust → Mörkt. Auto följer
klockan: mörkt mellan 19 och 07.

## Installera som app

Klicka install-ikonen i adressfältet på datorn, eller "Lägg till på
startskärmen" på telefonen. Offline-cachen kräver HTTPS, vilket
`localhost` räknas som men `http://192.168.x.x` inte gör. Appen fungerar
likadant på telefonen ändå, bara utan cache; vill du ha den även där är
[mkcert](https://github.com/FiloSottile/mkcert) enklaste vägen.

## API

| Metod | Väg | Gör |
|---|---|---|
| GET | `/api/notes` | Lista med titel, taggar och förhandsvisning |
| POST | `/api/notes` | Skapa anteckning |
| GET | `/api/notes/<id>` | Hämta hela anteckningen |
| PUT | `/api/notes/<id>` | Spara hela anteckningen |
| DELETE | `/api/notes/<id>` | Ta bort |
| GET | `/api/export` | Ladda ner datafilen |
| POST | `/api/import` | Lägg till anteckningar från en export |

## Säkerhet

Debugläget är på som standard och ger auto-reload, men eftersom servern
lyssnar på `0.0.0.0` betyder det att Werkzeugs interaktiva felsökare är
nåbar från hela ditt lokala nätverk. På ett hemmanätverk är det normalt
oproblematiskt; stäng annars av med `FLASK_DEBUG=0 python app.py`.

Appen har ingen inloggning och är byggd för att köras på ett nät du
litar på. Lägg den inte öppet på internet som den är.

`.gitignore` håller `data/` utanför repot, så dina egna anteckningar
följer inte med när du pushar.

## Struktur

```
app.py                        Rutter, JSON-lagring, migrering
templates/index.html          App-skal och mallar för stycken och versioner
static/css/style.css          Tokens, teman, responsiv layout
static/js/app.js              Rendering, autospar, tema, import
static/sw.js                  Service worker (serveras från /sw.js)
static/manifest.json
static/icons/
data/                         Din data, ignoreras av git
```

## Kvar att bygga

Markera text i ett stycke för att skapa ett alternativ direkt,
"ersätt markerad text", ångra/gör om, dra-och-släpp för att ordna om
stycken, och fritextsökning.

## Licens

MIT — se [LICENSE](LICENSE).
