# FILE: app.py
# Main Flask application with Knowledge Graph API integration

import secrets
import os
from flask import Flask, render_template, session, redirect, url_for, g, request, jsonify
from auth import auth_bp
from dotenv import load_dotenv
import logging

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "fallback-unsafe-dev-key")
app.register_blueprint(auth_bp)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.before_request
def set_csp_nonce():
    # nonce is useful if you later add a tiny inline script you explicitly want to allow
    g.csp_nonce = secrets.token_urlsafe(16)

@app.after_request
def apply_csp(response):
    csp_nonce = getattr(g, "csp_nonce", "")
    # More permissive CSP for Google Maps - allows inline scripts with specific hashes
    csp = (
        f"default-src 'self'; "
        f"script-src 'self' 'unsafe-eval' 'unsafe-inline' 'nonce-{csp_nonce}' "
        f"'sha256-lA6DFZV6V7GN5UYD5Y6H7epxXzehHxeXQjoJVsIfqxI=' "
        f"'sha256-7AcVsEOyOE8yFFMDWrYQoomjBEFOMdd7BAy3FH3i5nc=' "
        f"https://maps.googleapis.com https://maps.gstatic.com https://cdn.jsdelivr.net; "
        f"style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
        f"img-src 'self' data: https://*.googleapis.com https://*.gstatic.com https://*.google.com; "
        f"connect-src 'self' https://*.googleapis.com; "
        f"font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com; "
        f"object-src 'none'; base-uri 'self'; frame-ancestors 'self';"
    )
    response.headers["Content-Security-Policy"] = csp
    return response

@app.context_processor
def inject_nonce():
    # If you later add an inline <script nonce="{{ csp_nonce }}">...</script>, it will pass CSP
    return {"csp_nonce": getattr(g, "csp_nonce", "")}

# Automatically inject API key into all templates that extend base.html
@app.context_processor
def inject_google_maps_api_key():
    return {
        "google_maps_api_key": os.environ.get("GOOGLE_MAPS_API_KEY", "")
    }

@app.context_processor
def inject_knowledge_graph_status():
    """Inject Knowledge Graph API status into templates"""
    try:
        # Check if API key is available (using same key as Maps API)
        api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
        kg_enabled = bool(api_key)
        return {"knowledge_graph_enabled": kg_enabled}
    except Exception:
        return {"knowledge_graph_enabled": False}

@app.route("/")
def home():
    if not session.get("logged_in"):
        return redirect(url_for("auth.login"))
    return render_template("search.html")

@app.route("/history")
def history():
    return render_template("history.html")

@app.route("/help")
def help_page():
    return render_template("help.html")

# Knowledge Graph API Routes
@app.route("/api/knowledge-graph", methods=["POST"])
def fetch_knowledge_graph_data():
    """
    Fetch Knowledge Graph data for a business entity
    
    Expected JSON payload:
    {
        "business_name": "Kenny Bunch Plumbing",
        "location": "Wylie, TX" (optional),
        "place_id": "ChIJZU_6qw4ETIYRuXC6ixLcbOk" (optional)
    }
    """
    if not session.get("logged_in"):
        return jsonify({"error": "Authentication required"}), 401
    
    try:
        # Import here to avoid import error if file doesn't exist yet
        from kg_api_handler import KnowledgeGraphAPI
        
        data = request.get_json()
        if not data:
            return jsonify({"error": "JSON payload required"}), 400
        
        business_name = data.get("business_name")
        if not business_name:
            return jsonify({"error": "business_name is required"}), 400
        
        location = data.get("location", "")
        place_id = data.get("place_id", "")
        
        # Initialize Knowledge Graph API using the same API key as Maps
        try:
            api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
            if not api_key:
                return jsonify({
                    "success": False,
                    "error": "API_CONFIG_ERROR",
                    "message": "Google Maps API key not configured"
                }), 500
                
            kg_api = KnowledgeGraphAPI(api_key)
        except ValueError as e:
            logger.error(f"Knowledge Graph API initialization failed: {e}")
            return jsonify({
                "success": False,
                "error": "API_CONFIG_ERROR",
                "message": str(e)
            }), 500
        
        # Search for the business entity
        result = kg_api.find_business_entity(business_name, location)
        
        # Add additional metadata
        result["request_data"] = {
            "business_name": business_name,
            "location": location,
            "place_id": place_id
        }
        
        # Log the request for debugging
        logger.info(f"Knowledge Graph lookup for '{business_name}' - Success: {result['success']}")
        
        return jsonify(result)
        
    except ImportError:
        logger.error("kg_api_handler module not found")
        return jsonify({
            "success": False,
            "error": "MODULE_ERROR",
            "message": "Knowledge Graph handler not available. Please ensure kg_api_handler.py exists."
        }), 500
    except Exception as e:
        logger.error(f"Knowledge Graph API route error: {e}")
        return jsonify({
            "success": False,
            "error": "INTERNAL_ERROR",
            "message": "Internal server error occurred"
        }), 500

@app.route("/api/test-kg", methods=["GET"])
def test_knowledge_graph():
    """Test endpoint to verify Knowledge Graph API is working"""
    if not session.get("logged_in"):
        return jsonify({"error": "Authentication required"}), 401
    
    try:
        from kg_api_handler import KnowledgeGraphAPI
        
        # Use the same API key as Maps API
        api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
        if not api_key:
            return jsonify({
                "test_status": "failed",
                "api_configured": False,
                "error": "No API key found",
                "message": "GOOGLE_MAPS_API_KEY not set in environment"
            })
        
        # Test with a well-known entity
        kg_api = KnowledgeGraphAPI(api_key)
        result = kg_api.find_business_entity("Starbucks", "Seattle")
        
        return jsonify({
            "test_status": "completed",
            "api_configured": True,
            "test_result": result
        })
        
    except ImportError:
        return jsonify({
            "test_status": "failed",
            "api_configured": False,
            "error": "kg_api_handler module not found",
            "message": "Please create kg_api_handler.py file"
        })
    except Exception as e:
        logger.error(f"Knowledge Graph test error: {e}")
        return jsonify({
            "test_status": "failed",
            "api_configured": False,
            "error": str(e),
            "message": "Test failed with unexpected error"
        })

if __name__ == "__main__":
    app.run(debug=True)