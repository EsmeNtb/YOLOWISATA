# YoloWisata

**Travel local. Stay connected. Even offline.**
An offline-first website for travelers and small local businesses of any kind (a farm, a workshop, a kitchen, a guide).
Built for the World Bank Small AI Hackathon 2026, tourism track.

## What is in this folder

```
yolowisata/
├── frontend/                  The website. Plain HTML, CSS, JavaScript. No build step. Works on phone and computer.
│   ├── index.html             Page shell: top bar, content area, navigation
│   ├── app.css                Design: palette, Plus Jakarta Sans, all components, phone and desktop layouts
│   ├── app.js                 All screens and logic (map of the file below)
│   ├── config.js              One setting: the backend address ("" = no backend)
│   ├── sw.js                  Service worker: the site opens with no internet after the first visit
│   ├── manifest.webmanifest   Lets people "Add to Home Screen"
│   ├── icon.svg               App icon (the mascot)
│   ├── vercel.json            Vercel settings
│   └── data/content.json      Copy of the data, made by scripts/export_static.py. Do not edit this copy.
├── backend/                   Small Python server (FastAPI)
│   ├── main.py                API, shared store, and it can serve the website too
│   ├── ai.py                  The small AI: voice note to listing, visitor insights, optional speech-to-text
│   ├── requirements.txt
│   └── .env.example           Settings (speech model, where to keep the store, allowed website addresses)
├── data/
│   └── content.json           THE data: businesses, postcards, questions, phrases, sectors, swipe cards, theme keywords
│   (store.json appears here when the backend is used: shared postcards, messages, bookings, listings)
├── scripts/
│   ├── xlsx_to_data.py        Spreadsheet template -> data/content.json (then exports and validates)
│   ├── make_template.py       data/content.json -> a fresh spreadsheet template
│   ├── export_static.py       Copies data/content.json into frontend/data/ before deploying
│   ├── validate_data.py       Checks the data and warns about rows that will not be counted or translated
│   └── columns.py             Column names shared by the two spreadsheet scripts
├── templates/
│   ├── YoloWisata_Data_Template.xlsx   Fill this in to add businesses, postcards, questions, phrases
│   └── business_template.json          One business, as it looks inside content.json
├── docs/
│   └── DATA.md                Which datasets you need, the format for your own data, the data sheet for the judges
├── run.sh / run.bat           One command to run everything on your computer
└── README.md
```

## Run it on your computer

```
./run.sh          (Windows: run.bat)
```

Then open http://localhost:8000. This starts the backend, which also serves the website and turns sharing on.
Open the same address in two browser windows (one as guest, one as a local business) to see messages and bookings travel between them.

Website only, no backend: `cd frontend && python3 -m http.server 8000`.

## Deploy

**Frontend on Vercel**

1. Put this folder in a GitHub repository.
2. In Vercel, import the repository. Root Directory: `frontend`. Framework preset: Other. No build command.
3. Deploy. With `config.js` left at `api: ""` the site works fully, but each phone keeps its own data.

**Backend (needed for sharing between phones)**

The backend keeps its records in a file (`data/store.json`), so it needs a host that runs Python and keeps a disk between requests.
Serverless hosting does not keep files, so run the backend on a small always-on server instead of as a Vercel function.

1. On the server: `pip install -r backend/requirements.txt`, then `uvicorn backend.main:app --host 0.0.0.0 --port 8000` from the project root.
2. Copy `backend/.env.example` to `backend/.env`. Set `YOLO_ORIGINS` to your Vercel address.
3. In `frontend/config.js`, set `api` to the backend's https address. Redeploy the frontend.

**Every time you change something**

- Data changed: run `python scripts/export_static.py` (or `xlsx_to_data.py`, which does it for you).
- Any frontend file changed: bump `VERSION` in `frontend/sw.js`, or phones keep the old copy.

## How the pieces talk

```
Spreadsheet template ── xlsx_to_data.py ──> data/content.json ── export_static.py ──> frontend/data/content.json
                                                   │
Website (phone or computer) <── content ───────────┤
   │  keeps everything on the device first         │
   └── when online and a backend is set ──> backend/main.py ──> data/store.json
            POST postcards, messages, bookings, listings, new businesses
            GET  /api/sync every few seconds, so the other phone sees them
```

## Backend endpoints

| Method and path | What it does |
|---|---|
| `GET /api/health` | Is the server up, and is a speech model set |
| `GET /api/content` | data/content.json |
| `GET /api/sync` | Everything shared so far |
| `POST /api/login` | Phone number and PIN, for guests and for businesses. The first login with a number creates the account |
| `POST /api/postcards`, `/messages`, `/bookings`, `/bookingstatus`, `/listings`, `/businesses` | Save one record by its id. An older copy never replaces a newer one |
| `POST /api/extract` | Text of a voice note in, listing fields out, plus which fields were not heard |
| `POST /api/voice` | Audio in, transcript and listing fields out. With no speech model it returns the sector's sample transcript and `"demo": true` |
| `GET /api/businesses/{id}/insights` | Theme counts with the quotes behind each count and an evidence label |

## Map of frontend/app.js

| Section (search for the comment) | What it holds |
|---|---|
| `Content` | Loads content.json into the app. No data is written in the code any more |
| `State` | Everything saved on the device |
| `AI 1` | Travel DNA and match score |
| `AI 4` | Experience DNA: counts, evidence, visitor segments |
| `AI 2` | Voice transcript to listing fields |
| `Screens` | One function per screen. Guest: `land`, `login`, `explore`, `swipe`, `dna`, `match`, `exp`, `inbox`, `chat`, `trips`, `help`, `card`, `thanks`, `story`. Business: `b-list`, `b-msgs`, `b-thread`, `b-book`, `b-insights`, `b-journey`. Plus `ai` (how it works) |
| `Render` | Navigation, top bar, sheets, toasts |
| `Sync with the backend` | `outbox`, `flush` (send), `pull` (receive) |
| `Actions` | Every button, by its `data-a` name |

## What is real and what is simulated

| Part | Status |
|---|---|
| Travel DNA, matching, theme counts, evidence labels, listing extraction | Real, computed on the device |
| Offline opening | Real once deployed (service worker). The Online/Offline pill also lets you simulate losing signal |
| Sharing between phones | Real with the backend running. Without it, one device only |
| Voice note | With the backend: really recorded and uploaded. Turned into text only if a speech model is installed; otherwise a sample transcript, and the site says so. Without the backend: sample transcript |
| Translation | A prepared phrase list and the translations stored in the data. Free-typed text is shown untranslated and says so |
| Theme analysis | A multilingual keyword list standing in for a small language model |
| Location | The phone is asked for a real position, but Ondera is fictional, so the pin starts at the village gate |
| Data | All synthetic. See docs/DATA.md |

## Known limits (be upfront about these)

- **Login identifies, it does not protect yet.** Guests browse with no account. Guests and businesses can log in with a phone number and PIN (stored hashed), which lets them pick up their data on another device. But the other endpoints do not check who is calling, so anyone who knows the backend address can still read every message and booking. Do not put real personal data in it. There is also no SMS check that the number is really theirs, and no PIN reset.
- **Accounts need the backend.** On the Vercel-only deployment, login is switched off and says so; the demo business accounts still work.
- **File store.** Fine for a demo and a pilot village; a real launch needs a database.
- **Not yet tested by me:** the live microphone upload in a real browser, the speech model path, and the layouts on real devices. The backend API, the two-phone sync logic and all screens were tested by script.
- **Indonesian wording** on the business side should be read by a native speaker.