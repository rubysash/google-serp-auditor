// FILE: static/js/scripts.js
// Enhanced JavaScript with Knowledge Graph API integration

let parsedData = {};
let googleMapsReady = false;
let placesService = null;

// Attach event listeners once the DOM is ready
window.addEventListener("DOMContentLoaded", function () {
  var btnSearchMaps = document.getElementById("btnSearchMaps");
  var btnExtract = document.getElementById("btnExtract");
  var btnFetch = document.getElementById("btnFetch");
  var btnSave = document.getElementById("btnSave");

  if (btnSearchMaps) {
    btnSearchMaps.addEventListener("click", openGoogleMaps);
  }
  if (btnExtract) {
    btnExtract.addEventListener("click", extractData);
  }
  if (btnFetch) {
    btnFetch.addEventListener("click", fetchData);
  }
  if (btnSave) {
    btnSave.addEventListener("click", saveRecord);
  }
});

// This function is called by the Google Maps API when it loads
window.onGoogleMapsLoaded = function () {
  console.log("Google Maps API loaded successfully");
  googleMapsReady = true;
  
  // Initialize Places service
  const map = new google.maps.Map(document.createElement('div'));
  placesService = new google.maps.places.PlacesService(map);
  
  logStatus("Google Maps API loaded successfully via callback.");
};

// Error handling for Maps API
window.gm_authFailure = function() {
  console.error("Google Maps API authentication failed");
  logStatus("ERROR: Google Maps API authentication failed. Check your API key.");
  alert("Google Maps API authentication failed. Please check your API key configuration.");
};

function verifyGoogleMapsApi() {
  try {
    if (googleMapsReady && typeof google === "object" && typeof google.maps === "object") {
      logStatus("Google Maps API verified and ready.");
      return true;
    } else {
      logStatus("ERROR: Google Maps API not loaded properly.");
      console.error("Google Maps API verification failed:", {
        googleMapsReady,
        googleExists: typeof google !== "undefined",
        mapsExists: typeof google !== "undefined" && typeof google.maps !== "undefined"
      });
      return false;
    }
  } catch (err) {
    logStatus("ERROR: Google Maps API verification failed - " + err.message);
    console.error("Google Maps API verification error:", err);
    return false;
  }
}

function openGoogleMaps() {
  const searchTerm = document.getElementById("searchTerm").value.trim();
  if (!searchTerm) {
    alert("Please enter a search term.");
    return;
  }
  const url = "https://www.google.com/maps/search/" + encodeURIComponent(searchTerm);
  window.open(url, "_blank");
}

function extractData() {
  const url = document.getElementById("mapsUrl").value.trim();
  if (!url || !url.includes("google.com/maps")) {
    alert("Please enter a valid Google Maps URL.");
    return;
  }

  try {
    const latLngMatch = url.match(/@([-.\d]+),([-.\d]+)/);
    const lat = latLngMatch ? parseFloat(latLngMatch[1]) : null;
    const lng = latLngMatch ? parseFloat(latLngMatch[2]) : null;

    let cid = "N/A";
    const cidHexMatch = url.match(/:0x([a-f0-9]+)/i);
    if (cidHexMatch) {
      try {
        cid = BigInt("0x" + cidHexMatch[1]).toString();
      } catch (err) {
        logStatus("Error parsing CID as BigInt: " + err.message);
      }
    }
    const fallbackMatch = url.match(/[?&]cid=([0-9]+)/);
    if (fallbackMatch) {
      cid = fallbackMatch[1];
    }

    const name = extractNameFromUrl(url);

    parsedData = {
      lat: lat !== null ? lat.toString() : "N/A",
      lng: lng !== null ? lng.toString() : "N/A",
      cid: cid,
      place_id: "Loading...",
      name: name
    };

    document.getElementById("nameField").innerText = parsedData.name;
    document.getElementById("latField").innerText = parsedData.lat;
    document.getElementById("lngField").innerText = parsedData.lng;
    document.getElementById("cidField").innerText = parsedData.cid;
    document.getElementById("placeIdField").innerText = parsedData.place_id;

    if (lat !== null && lng !== null) {
      getPlaceIdFromLatLng(lat, lng);
    } else {
      parsedData.place_id = "N/A";
      document.getElementById("placeIdField").innerText = parsedData.place_id;
      logStatus("Could not extract lat/lng for Place ID lookup.");
    }

    logStatus("URL parsed. Looking up Place ID...");
    renderOutput();
  } catch (err) {
    logStatus("Error extracting data: " + err.message);
    console.error("Extraction error:", err);
  }
}

function getPlaceIdFromLatLng(lat, lng) {
  if (!verifyGoogleMapsApi()) {
    logStatus("Google Maps API not ready. Cannot fetch Place ID.");
    parsedData.place_id = "API Not Ready";
    document.getElementById("placeIdField").innerText = parsedData.place_id;
    renderOutput();
    return;
  }

  if (!placesService) {
    logStatus("Places service not initialized. Cannot fetch Place ID.");
    parsedData.place_id = "Service Error";
    document.getElementById("placeIdField").innerText = parsedData.place_id;
    renderOutput();
    return;
  }

  const location = new google.maps.LatLng(lat, lng);

  const request = {
    location: location,
    radius: 20  // in meters, tight radius for specificity
  };

  logStatus("Searching for nearby places...");

  placesService.nearbySearch(request, (results, status) => {
    console.log("Places API response:", status, results);
    
    if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
      parsedData.place_id = results[0].place_id || "Not Found";
      logStatus("Place ID fetched successfully: " + parsedData.place_id);
    } else if (status === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) {
      parsedData.place_id = "API Key Error";
      logStatus("ERROR: Places API request denied - check API key permissions and restrictions.");
    } else if (status === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) {
      parsedData.place_id = "Quota Exceeded";
      logStatus("ERROR: Places API quota exceeded.");
    } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
      parsedData.place_id = "No Results";
      logStatus("No places found at this location.");
    } else {
      parsedData.place_id = "API Error: " + status;
      logStatus("Places API error: " + status);
      console.error("Places API error:", status, results);
    }
    
    document.getElementById("placeIdField").innerText = parsedData.place_id;
    renderOutput();
  });
}

function extractNameFromUrl(url) {
  const segments = url.split("/");
  const placeIndex = segments.findIndex((s) => s === "place");
  if (placeIndex !== -1 && segments.length > placeIndex + 1) {
    return decodeURIComponent(segments[placeIndex + 1].replace(/\+/g, " "));
  }
  return "Unknown";
}

async function fetchData() {
  const usePlaceDetails = document.getElementById("placeDetailsCheckbox").checked;
  const useKG = document.getElementById("kgCheckbox").checked;

  if (!parsedData || !parsedData.place_id || parsedData.place_id === "N/A" || parsedData.place_id === "Loading...") {
    if (!useKG) {
      alert("Valid Place ID is required for enrichment.");
      return;
    }
  }

  let enriched = {};

  // Handle Place Details API
  if (usePlaceDetails) {
    if (!verifyGoogleMapsApi()) {
      logStatus("Google Maps API not ready. Cannot fetch details.");
      return;
    }

    if (!placesService) {
      logStatus("Places service not initialized. Cannot fetch details.");
      return;
    }

    await new Promise((resolve) => {
      logStatus("Fetching place details from Google Places API...");
      
      const request = {
        placeId: parsedData.place_id,
        fields: [
          'name',
          'formatted_address',
          'formatted_phone_number',
          'international_phone_number',
          'website',
          'url',
          'types',
          'business_status',
          'rating',
          'user_ratings_total',
          'price_level',
          'opening_hours'
        ]
      };

      placesService.getDetails(request, (place, status) => {
        console.log("Place Details API response:", status, place);
        
        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
          enriched = {
            ...enriched,
            address: place.formatted_address || "Not available",
            website: place.website || "Not available",
            phone: place.formatted_phone_number || place.international_phone_number || "Not available",
            google_url: place.url || "Not available",
            business_status: place.business_status || "Not available",
            rating: place.rating || "Not available",
            total_ratings: place.user_ratings_total || 0,
            types: place.types ? place.types.join(", ") : "Not available"
          };

          if (place.opening_hours) {
            enriched.is_open_now = place.opening_hours.isOpen ? place.opening_hours.isOpen() : "Unknown";
            enriched.hours = place.opening_hours.weekday_text ? place.opening_hours.weekday_text.join("; ") : "Not available";
          }

          logStatus("Place details fetched successfully.");
        } else if (status === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) {
          logStatus("ERROR: Place Details API request denied - check API key permissions.");
          enriched.place_details_error = "API Access Denied";
        } else if (status === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) {
          logStatus("ERROR: Place Details API quota exceeded.");
          enriched.place_details_error = "Quota Exceeded";
        } else {
          logStatus("Place Details API error: " + status);
          enriched.place_details_error = `API Error: ${status}`;
        }
        
        resolve();
      });
    });
  }

  // Handle Knowledge Graph API using backend endpoint
  if (useKG) {
    logStatus("Fetching Knowledge Graph data from backend...");
    
    try {
      // Extract location from address if available for better KG matching
      let location = "";
      if (enriched.address) {
        // Extract city, state from address
        const addressParts = enriched.address.split(",");
        if (addressParts.length >= 2) {
          // Get the last 2 parts (typically city, state zip)
          location = addressParts.slice(-2).join(",").trim();
        }
      }

      const requestData = {
        business_name: parsedData.name,
        location: location,
        place_id: parsedData.place_id
      };

      logStatus(`Searching Knowledge Graph for: "${requestData.business_name}" in "${requestData.location}"`);
      console.log("Knowledge Graph request data:", requestData);

      const kgResponse = await fetch('/api/knowledge-graph', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      if (!kgResponse.ok) {
        throw new Error(`HTTP ${kgResponse.status}: ${kgResponse.statusText}`);
      }

      const kgData = await kgResponse.json();
      console.log("Knowledge Graph backend response:", kgData);

      if (kgData.success) {
        if (kgData.entity) {
          // Extract Knowledge Graph data from backend response
          enriched.kg_id = kgData.entity.kg_id || kgData.kg_id || "Not found";
          enriched.kg_name = kgData.entity.name || "Not available";
          enriched.kg_description = kgData.entity.description || "Not available";
          enriched.kg_types = kgData.entity.types ? 
            (Array.isArray(kgData.entity.types) ? kgData.entity.types.join(", ") : kgData.entity.types) : 
            "Not available";
          enriched.kg_url = kgData.entity.url || "Not available";
          enriched.kg_detailed_description = kgData.entity.detailed_description || "Not available";
          
          logStatus(`✓ Knowledge Graph entity found: ${enriched.kg_name} (${enriched.kg_id})`);
        } else {
          // Show more detailed information about what was searched
          enriched.kg_id = "Not found in Knowledge Graph";
          enriched.kg_search_query = `"${requestData.business_name}" in "${requestData.location}"`;
          enriched.kg_debug_info = kgData.message || "No entities returned from search";
          logStatus(`✗ No Knowledge Graph entity found for: "${requestData.business_name}" in "${requestData.location}"`);
        }
      } else {
        enriched.kg_error = kgData.error || "Unknown error";
        enriched.kg_id = enriched.kg_error;
        enriched.kg_debug_info = kgData.message || "API call failed";
        logStatus(`✗ Knowledge Graph API error: ${enriched.kg_error}`);
      }

    } catch (error) {
      console.error("Knowledge Graph backend request failed:", error);
      enriched.kg_error = `Network error: ${error.message}`;
      enriched.kg_id = "Backend Error";
      enriched.kg_debug_info = `Failed to connect to backend: ${error.message}`;
      logStatus(`✗ Knowledge Graph lookup failed: ${error.message}`);
    }
  }

  // Update parsedData with enriched information
  parsedData = { ...parsedData, ...enriched };
  renderOutput();
}

function saveRecord() {
  if (!parsedData || !parsedData.cid || parsedData.cid === "N/A") {
    alert("No valid data to save. CID is required.");
    logStatus("ERROR: Cannot save record - no valid CID available.");
    return;
  }

  // Check if we have only URL-parsed data (no enrichment)
  const hasOnlyUrlData = !parsedData.address && !parsedData.website && !parsedData.phone && !parsedData.kg_id;
  
  if (hasOnlyUrlData) {
    logStatus("ERROR: Save functionality not yet implemented. Backend integration required.");
    alert("Save functionality is not yet implemented. This requires backend database integration.");
  } else {
    logStatus("ERROR: Save functionality not yet implemented. Backend integration required.");
    alert("Save functionality is not yet implemented. This requires backend database integration.");
  }
  
  // Show what would be saved for debugging purposes
  console.log("Data that would be saved:", parsedData);
}

function renderOutput() {
  const outputBox = document.getElementById("outputBox");
  if (outputBox) {
    outputBox.textContent = JSON.stringify(parsedData, null, 2);
  }
}

function logStatus(message) {
  const log = document.getElementById("statusLog");
  if (!log) return;
  const timestamp = new Date().toLocaleTimeString();
  log.innerText = `[${timestamp}] ${message}`;
  console.log(message);
}