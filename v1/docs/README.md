## Hybrid Model:

1. **Frontend (JS)**:
   - Keep search and URL parsing for CID and lat/lng
   - Pass extracted Place ID or CID to backend

2. **Backend (Python Flask or Tkinter + Script)**:
   - Use `googlemaps` Python client or direct API call to Places API:
     - `place/details?place_id=...`
   - Use KG API (optional) to fetch KG ID
   - Return:
     - address
     - phone
     - website
     - KG ID (via second call)

3. **Caching layer**:
   - Store Place ID lookups to avoid API cost duplication

---

## Optional Fallback if API Fails

- Add Playwright fallback to render Maps page and extract:
  - JSON-LD block (`application/ld+json`)
  - `<meta>` tags
  - DOM-based panels

Throttle aggressively (1/minute) to avoid bans.



## API Requirements

You want to call Place Details (address, website, phone), plus KG ID. Here’s what must be enabled—and what you’ll be billed for.

---

###  A. Required Google APIs (Enable in Google Cloud Console)

1. **Places API (Web Service – New)**  
   - This covers Place Details requests (returning address, phone number, website, etc.) :contentReference[oaicite:0]{index=0}.

2. Optionally, **Knowledge Graph Search API**  
   - To fetch KG ID (Knowledge Graph entity `@id`), not part of Places API—this is a separate API you must enable. (No details found yet on scope, but typically no additional OAuth scope; uses API key.)


## Pricing

5k to 10k requests free, then $5 per 1000 
https://developers.google.com/maps/billing-and-pricing/pricing








