# Full UI and Architecture Documentation
## Project: Local SEO / GMB Intelligence Collector (Minimal Working Product)

This document defines the complete UI flow, architecture, and data logic required for building a minimal, extensible desktop application using `ttkbootstrap` (Darkly theme) to collect and store business data from Google Maps, with API enrichment.

---

## 1. APPLICATION OVERVIEW

The app is designed to:
- Search for local businesses on Google Maps
- Allow manual or assisted selection of a target business
- Parse CID, Place ID, lat/lng, and basic info from the URL
- Optionally fetch extended metadata using API calls (only on demand)
- Save enriched records for historical lookup and comparison
- Export data to structured formats for future reporting or checklists

---

## 2. USER FLOW SUMMARY

1. Open App
2. Navigate to **New Search** tab
3. Enter a search term (e.g., "Plumbers near me")
4. Click "Search on Google Maps" → Opens browser to relevant search
5. Copy URL of a selected business
6. Paste into field → click "Extract"
7. Parsed results (Name, CID, Lat/Lng, Place ID) appear
8. Choose enrichment (checkboxes), click "Fetch Data"
9. View and confirm parsed + enriched fields
10. Click "Save" → stored under business_id + record_id
11. Review saved data under **Previous Searches** tab

---

## 3. UI STRUCTURE (ttkbootstrap)

### TABS

#### Tab 1: New Search
- **Top Section: Search Initiation**
  - Entry field: `search_term`
  - Button: `Search on Google Maps` → opens browser

- **Middle Section: URL Parsing**
  - Entry field: `maps_url_input`
  - Button: `Extract Data`
  - Result fields: `name`, `lat`, `lng`, `CID`, `place_id`

- **Bottom Section: Enrichment Controls**
  - Checkboxes:
    - [ ] Place Details API
    - [ ] Knowledge Graph ID
  - Button: `Fetch Selected Data`
  - Button: `Save Record`
  - Output pane: JSON/text preview
  - Status log (bottom)

---

#### Tab 2: Previous Searches
- **Top Section: Filters**
  - Entry fields:
    - Business Name
    - City
    - CID
    - Lookup Date Range (start / end)
    - Category/Industry
  - Button: `Apply Filters`

- **Middle Section: Sortable Table (Treeview)**
  - Columns:
    - Name
    - Location
    - CID
    - Place ID
    - Date Added
    - Tags (optional)
  - Features:
    - Sort on click
    - Multi-select
    - Right-click context menu

- **Bottom Section: Actions**
  - Button: `View Record`
  - Button: `Re-Fetch Selected API`
  - Button: `Delete Record`
  - Button: `Generate HTML Report (placeholder)`

---

#### Tab 3: Help
- Markdown-style text
- Sections:
  - How to use the app
  - Setting up Google Cloud
  - API key and OAuth config
  - Rate-limiting guidance
  - Export instructions
- Future support for collapsible sections or integrated viewer

---

## 4. FILE AND FOLDER STRUCTURE

/maps-intel-tool/
├── .env                    # Maps API and Server Secret loaded from dotenv
├── app.py                  # Flask entry point
├── auth.py                 # oauth functions
├── kg_api_handler.py       # kg api stuff
├── config.py               # Configuration (rate limits, nonsecret config, etc)
├── requirements.txt        # Required Python packages
├── /templates/             # Jinja2 templates
│   ├── base.html           # Shared layout with nav
│   ├── search.html         # Tab 1: New Search
│   ├── history.html        # Tab 2: Previous Searches
│   └── help.html           # Tab 3: Help
├── /static/
│   ├── /css/
│   │   └── styles.css
│   └── /js/
│       └── scripts.js      # client side api parsing without full maps oauth
├── /data/
│   └── db.sqlite           # SQLite database
└── /backend/
    ├── db_handler.py       # DB access
    ├── url_parser.py       # URL parsing logic
    ├── api_fetcher.py      # Places + KG API logic
    ├── playwright_fallback.py # Scraping fallback
    ├── utils.py            # Logging, deduplication, etc.
    └── oauth_handler.py    # OAuth credentials + refresh


---

## 5. DATABASE STRUCTURE

### SQLite (Preferred for scalability)

#### Table: `businesses`
- `business_id` (TEXT, PK)
- `name`
- `cid`
- `place_id`
- `location`
- `created_at`

#### Table: `records`

- `record_id` (TEXT, PK)
- `business_id` (FK)
- `timestamp`
- `api_source` (e.g., "place_details", "kg")
- `raw_data` (JSON blob)
- `note`
- `is_primary` (bool)

---


Each record contains:
- Metadata: name, cid, place_id, etc.
- Lookup date
- API data
- Optional user note

---

## 6. LOGIC FLOW

### On Extract:
- Parse URL for:
  - CID (from `?cid=`)
  - Place ID (if present)
  - lat/lng (from `@lat,lng`)
  - Business Name (from title or URL if possible)

### On API Fetch:
- Respect user checkbox selection
- Hit only selected endpoints
- Save full raw response (structured)
- Parse only critical fields for UI display

### On Save:
- If CID/Place ID already seen → reuse `business_id`
- Else → create new one
- Create timestamped `record_id`
- Store full snapshot to disk/DB

---

## 7. PERFORMANCE AND SAFETY

- Throttling:
  - Sleep between API calls (1–2 sec if needed)
- Duplicate suppression:
  - Auto-skip lookup if record exists today
- No background threading yet (initial version = blocking calls)

---

## 8. FUTURE FEATURES (V2+)

- HTML report generation
- Audit checklists (configurable)
- Domain crawling (site map + broken link checker)
- PDF export
- Timeline chart for field changes (e.g., phone number history)
- Competitive compare (N business side-by-side)
- Auto-categorization (via website scan or NER)

---

## 9. USER PROFILE / SETTINGS (Future Option)

- Configurable API key file
- Limit API calls per day
- Dark/Light theme toggle
- Choose output folder
- Auto-save reports

---

## 10. DEPENDENCIES

- Python 3.12+
- ttkbootstrap
- requests
- json
- sqlite3
- os / pathlib
- datetime
- Google API client

---



