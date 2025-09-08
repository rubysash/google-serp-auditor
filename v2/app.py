# FILE: app.py
# Main Flask application with Knowledge Graph API integration

import secrets
import os
from flask import Flask, render_template, session, redirect, url_for, g, request, jsonify
from auth import auth_bp
from dotenv import load_dotenv
import logging
from datetime import datetime

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "fallback-unsafe-dev-key")
app.register_blueprint(auth_bp)

# Set up logging
DEBUG_MODE = os.environ.get("DEBUG", "False").lower() == "true"

# Set up logging based on debug mode
if DEBUG_MODE:
    logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger(__name__)
    logger.debug("Debug mode enabled")
else:
    logging.basicConfig(level=logging.WARNING)
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
def inject_template_globals():
    """Inject all template globals in one place"""
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    
    # Check KG availability
    kg_enabled = False
    try:
        from kg_api_handler import KnowledgeGraphAPI
        kg_enabled = bool(api_key)
    except ImportError:
        kg_enabled = False
    
    return {
        "debug_mode": DEBUG_MODE,
        "csp_nonce": getattr(g, "csp_nonce", ""),
        "google_maps_api_key": api_key,
        "knowledge_graph_enabled": kg_enabled
    }

@app.route("/login-info")
def login_info():
    """Display the login page with explanations before OAuth"""
    if session.get("logged_in"):
        return redirect(url_for("home"))
    return render_template("login.html")

@app.route("/")
def home():
    if not session.get("logged_in"):
        return redirect(url_for("login_info"))
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
        "place_id": "ChIJZU_6qw4ETIYRuXC6ixLcbOk" (optional),
        "kgmid_from_url": "/g/11bzt6slj6" (optional)
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
        kgmid_from_url = data.get("kgmid_from_url", None)
        
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
        
        # Search for the business entity with KG ID if available
        result = kg_api.find_business_entity(business_name, location, kgmid_from_url)
        
        # Track API usage in session
        if result.get('success') and result.get('entity'):
            session['api_usage_today'] = session.get('api_usage_today', 0) + 1
            session['kg_api_calls'] = session.get('kg_api_calls', 0) + 1
        
        # Add additional metadata
        result["request_data"] = {
            "business_name": business_name,
            "location": location,
            "place_id": place_id,
            "kgmid_from_url": kgmid_from_url
        }
        
        # Log the request for debugging
        if DEBUG_MODE:
            logger.debug(f"Knowledge Graph lookup for '{business_name}' - Success: {result['success']}")
            if kgmid_from_url:
                logger.debug(f"Used KG ID from URL: {kgmid_from_url}")
        
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

@app.route("/api/test-kg", methods=["GET", "POST"])
def test_knowledge_graph():
    """Test endpoint to verify Knowledge Graph API is working - DEBUG ONLY"""
    if not DEBUG_MODE:
        return jsonify({"error": "Endpoint not available"}), 404
        
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
        
        kg_api = KnowledgeGraphAPI(api_key)
        
        # Handle POST requests for custom testing
        if request.method == "POST":
            data = request.get_json()
            business_name = data.get("business_name", "Starbucks")
            location = data.get("location", "Seattle")
            debug_mode = data.get("debug", False)
            
            if debug_mode:
                # Return comprehensive debug results
                result = kg_api.debug_search_results(business_name, location)
                return jsonify({
                    "test_status": "debug_completed",
                    "api_configured": True,
                    "debug_results": result
                })
            else:
                # Standard business search
                result = kg_api.find_business_entity(business_name, location)
                return jsonify({
                    "test_status": "completed",
                    "api_configured": True,
                    "test_result": result
                })
        
        # Default GET behavior - test with Starbucks
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

@app.route("/api/status", methods=["GET"])
def api_status():
    """Get API status and usage information"""
    if not session.get("logged_in"):
        return jsonify({"error": "Authentication required"}), 401
    
    try:
        # Check if APIs are configured
        api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
        places_enabled = bool(api_key)
        
        # Check Knowledge Graph availability
        kg_enabled = False
        try:
            from kg_api_handler import KnowledgeGraphAPI
            kg_enabled = True
        except ImportError:
            kg_enabled = False
        
        # Get usage from session (persistent across page reloads)
        usage_today = session.get("api_usage_today", 0)
        
        return jsonify({
            "success": True,
            "places_enabled": places_enabled,
            "kg_enabled": kg_enabled,
            "usage_today": usage_today,
            "usage_limit": "$200 monthly credit",
            "status": "online"
        })
        
    except Exception as e:
        logger.error(f"API status check failed: {e}")
        return jsonify({
            "success": False,
            "error": str(e),
            "status": "error"
        }), 500

@app.route("/api/usage-stats", methods=["GET"])
def get_usage_stats():
    """Get detailed API usage statistics"""
    if not session.get("logged_in"):
        return jsonify({"error": "Authentication required"}), 401
    
    try:
        # Get session-based usage counts
        places_calls = session.get("places_api_calls", 0)
        kg_calls = session.get("kg_api_calls", 0)
        total_calls = places_calls + kg_calls
        
        # Calculate estimated costs (approximate pricing)
        places_cost = places_calls * 0.005  # $5 per 1000 calls
        kg_cost = kg_calls * 0.005  # Assuming similar pricing
        total_cost = places_cost + kg_cost
        
        return jsonify({
            "success": True,
            "usage_stats": {
                "places_api": {
                    "calls_today": places_calls,
                    "estimated_cost": round(places_cost, 4)
                },
                "knowledge_graph": {
                    "calls_today": kg_calls,
                    "estimated_cost": round(kg_cost, 4)
                },
                "total": {
                    "calls_today": total_calls,
                    "estimated_cost": round(total_cost, 4)
                }
            },
            "pricing": {
                "places_api": "$5 per 1000 calls",
                "knowledge_graph": "$5 per 1000 calls",
                "free_tier": "First 5000 calls free monthly"
            },
            "session_start": session.get("session_start", "Unknown")
        })
        
    except Exception as e:
        logger.error(f"Usage stats error: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route("/api/increment-usage", methods=["POST"])
def increment_usage():
    """Increment API usage counter in session with API type tracking"""
    if not session.get("logged_in"):
        return jsonify({"error": "Authentication required"}), 401
    
    try:
        data = request.get_json()
        api_type = data.get('api_type', 'unknown')  # 'places' or 'kg'
        count = data.get('count', 1)
        
        # Track by API type
        if api_type == 'places':
            session['places_api_calls'] = session.get('places_api_calls', 0) + count
        elif api_type == 'kg':
            session['kg_api_calls'] = session.get('kg_api_calls', 0) + count
        
        # Legacy total counter
        session['api_usage_today'] = session.get('api_usage_today', 0) + count
        
        # Set session start time if not exists
        if 'session_start' not in session:
            session['session_start'] = datetime.now().isoformat()
        
        return jsonify({
            "success": True,
            "usage_today": session['api_usage_today'],
            "places_calls": session.get('places_api_calls', 0),
            "kg_calls": session.get('kg_api_calls', 0)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)