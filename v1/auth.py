from flask import Blueprint, redirect, request, session, url_for
from google_auth_oauthlib.flow import Flow
import os

auth_bp = Blueprint("auth", __name__)
SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.profile"]
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"  # Allow http for local dev

# NOTE: Must match the OAuth redirect URI in Google Cloud Console
REDIRECT_URI = "http://localhost:5000/oauth2callback"


@auth_bp.route("/login")
def login():
    flow = Flow.from_client_secrets_file(
        "credentials.json",
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI
    )
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true"
    )
    session["state"] = state
    session["flow_info"] = {
        "client_secrets_file": "credentials.json",
        "scopes": SCOPES,
        "redirect_uri": REDIRECT_URI
    }
    return redirect(authorization_url)


@auth_bp.route("/logout")
def logout():
    """
    Clear all session data and redirect to the login info page.
    """
    try:
        keys = list(session.keys())
        for k in keys:
            session.pop(k, None)
    except Exception:
        # As a safe fallback, nuke the whole session
        session.clear()
    return redirect(url_for("login_info"))


@auth_bp.route("/oauth2callback")
def oauth2callback():
    if "state" not in session or "flow_info" not in session:
        return "Missing session state or flow info. Please try logging in again."

    flow = Flow.from_client_secrets_file(
        session["flow_info"]["client_secrets_file"],
        scopes=session["flow_info"]["scopes"],
        redirect_uri=session["flow_info"]["redirect_uri"]
    )
    flow.fetch_token(authorization_response=request.url)

    if not flow.credentials:
        return "OAuth failed. No credentials."

    session["token"] = flow.credentials.token
    session["refresh_token"] = flow.credentials.refresh_token
    session["logged_in"] = True
    return redirect(url_for("home"))
