# Google Maps Business Data Extractor with OAuth Access Control

## References

https://developers.google.com/maps/documentation/javascript/place-search

This guide walks you through building a secure backend using **Google Places API + OAuth** to limit usage to your Google account(s). You will extract:
- Address
- Website
- Phone
- Place ID
- CID (via URL parsing)
- KG ID (optional via KG API)

---

## Step 1: Install Required Packages

Open Command Prompt (Windows + R, type `cmd`, press Enter) and run:

pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client pandas openpyxl colorama

---

## Step 2: Set Up Google Cloud Project

1. Go to https://console.cloud.google.com/
2. Sign in with your Google account
3. Click **Select a project** → **NEW PROJECT**
4. Name it: `maps-extractor`
5. Click **CREATE** and wait for confirmation

---

## Step 3: Enable Required APIs

With `maps-extractor` selected:

### A. Enable Places API
- Search for **Places API**
- Click it, then click **ENABLE**

### B. Enable Knowledge Graph Search API (optional)
- Search for **Knowledge Graph Search API**
- Click it, then click **ENABLE**

---

## Step 4: Create OAuth Credentials

### A. Navigate to Credentials
- In the left sidebar, click **Credentials**
- Click **+ CREATE CREDENTIALS** → **OAuth client ID**

### B. Configure Consent Screen (if prompted)
- Choose **External**
- App name: `maps-extractor`
- User support email: your Gmail
- Developer contact email: same
- Click **SAVE AND CONTINUE**

### C. Create OAuth Client ID
- Application type: **Desktop app**
- Name: `Maps Extractor`
- Click **CREATE**
- Click **OK** on the popup

---

## Step 5: Set Up OAuth Scopes

### A. Go to OAuth Consent Screen
- In the left sidebar, click **OAuth consent screen**

### B. Add Required Scopes
Click **ADD OR REMOVE SCOPES**, and check:

- `https://www.googleapis.com/auth/cloud-platform.read-only`  

> These scopes allow your app to fetch place details securely using OAuth + API key

Click **UPDATE** → **SAVE AND CONTINUE**

---

## Step 6: Add Test Users

On the OAuth Consent Screen page:

- Scroll to **Test users**
- Click **+ ADD USERS**
- Enter your Gmail address (and any others)
- Click **ADD** → **SAVE**

**Note**: Only these users can run the app while it's in "testing" mode.

---

## Step 7: Download OAuth Credentials

1. Go to **Credentials**
2. Find your **OAuth 2.0 Client ID** for "Maps Extractor"
3. Click the **download icon** to get `credentials.json`
4. Save to a folder, e.g., `MapsExtractor`

Your folder should now contain:

- `credentials.json` — OAuth config
- `maps_extractor.py` — Python script (you’ll write this later)

---

## Step 8: Restrict API Key (optional)

If you plan to use an API key for fallback or KG API access:

1. Go to **Credentials**
2. Create an **API key**
3. Restrict:
   - **Application restriction**: IP address or HTTP referrer
   - **API restrictions**: Limit to `Places API` and/or `Knowledge Graph Search API`
4. Save and store the key securely

---

## Summary of Required APIs and Scopes

### APIs to Enable:
- **Places API**
- **Knowledge Graph Search API** (optional)

### OAuth Scopes:
- `https://www.googleapis.com/auth/cloud-platform.read-only`
- `https://www.googleapis.com/auth/maps-platform.places` # could not find

---

## Reference Links

- [Google Places API Pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Google OAuth Scopes](https://developers.google.com/identity/protocols/oauth2/scopes)
- [Knowledge Graph Search API](https://developers.google.com/knowledge-graph/)
- [Google Cloud Console](https://console.cloud.google.com/)

---