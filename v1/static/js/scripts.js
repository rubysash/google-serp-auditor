// FILE: static/js/scripts.js
// Enhanced JavaScript with Knowledge Graph API integration

let parsedData = {};
let googleMapsReady = false;
let placesService = null;
let apiUsageToday = 0;
let lastApiStatusCheck = null;

// Attach event listeners once the DOM is ready
window.addEventListener("DOMContentLoaded", function () {
  var btnSearchMaps = document.getElementById("btnSearchMaps");
  var btnExtract = document.getElementById("btnExtract");
  var btnFetch = document.getElementById("btnFetch");
  var btnSave = document.getElementById("btnSave");

  // Initialize tooltips
  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
  
  // Add API status click handler
  var apiStatusLink = document.getElementById("apiStatusLink");
  if (apiStatusLink) {
    apiStatusLink.addEventListener("click", function(e) {
      e.preventDefault();
      showDetailedApiUsage(); // Changed from updateApiStatus()
    });
  }

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

    // Initial API status check
  updateApiStatus();
  
  // Check API status every 5 minutes
  setInterval(updateApiStatus, 300000);
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
    let lat = null;
    let lng = null;
    
    // First try to extract from the data parameter (more accurate for business locations)
    const dataMatch = url.match(/data=!4m\d+!3m\d+!1s[^!]+!8m2!3d([-.\d]+)!4d([-.\d]+)/);
    if (dataMatch) {
      lat = parseFloat(dataMatch[1]);
      lng = parseFloat(dataMatch[2]);
      logStatus("Extracted coordinates from data parameter (business location)");
    } else {
      // Fallback to the @ coordinates (viewport center)
      const latLngMatch = url.match(/@([-.\d]+),([-.\d]+)/);
      if (latLngMatch) {
        lat = parseFloat(latLngMatch[1]);
        lng = parseFloat(latLngMatch[2]);
        logStatus("Extracted coordinates from viewport (may be approximate)");
      }
    }

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

function getPlaceIdFromLatLng2(lat, lng) {
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
      
      // Track Places API usage
      apiUsageToday++;
      document.getElementById("apiUsageCount").textContent = apiUsageToday;
      
      // Update session counter
      updateSessionUsage(1, 'places');
      
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
          
          // Track Place Details API usage
          apiUsageToday++;
          document.getElementById("apiUsageCount").textContent = apiUsageToday;
          
          // Update session counter
          updateSessionUsage(1, 'places');
          
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
          
          // Track Knowledge Graph API usage
          apiUsageToday++;
          document.getElementById("apiUsageCount").textContent = apiUsageToday;
          
          // Update session counter
          updateSessionUsage(1, 'kg');
          
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

async function fetchData2() {
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
          
          // Increment API usage counter
          apiUsageToday++;
          document.getElementById("apiUsageCount").textContent = apiUsageToday;
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
          
          // Increment API usage counter
          apiUsageToday++;
          document.getElementById("apiUsageCount").textContent = apiUsageToday;
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
  
  // Update the knowledge links table
  updateKnowledgeLinksTable();
}

function updateKnowledgeLinksTable() {
  const tableBody = document.getElementById("knowledgeLinksTable");
  if (!tableBody) return;
  
  const links = [];
  
  // Prepare encoded variables once
  let encodedBusinessName = "";
  let encodedDomain = "";
  let encodedAddress = "";
  let domain = "";
  
  if (parsedData.name) {
    encodedBusinessName = encodeURIComponent(parsedData.name);
  }
  
  if (parsedData.website && parsedData.website !== "Not available") {
    try {
      domain = new URL(parsedData.website).hostname;
      encodedDomain = encodeURIComponent(domain);
    } catch {
      domain = parsedData.website;
      encodedDomain = encodeURIComponent(domain);
    }
  }
  
  if (parsedData.address && parsedData.address !== "Not available") {
    encodedAddress = encodeURIComponent(parsedData.address);
  }
  
  // Add Google Maps link if we have Place ID
  if (parsedData.place_id && parsedData.place_id !== "N/A" && parsedData.place_id !== "Loading...") {
    links.push({
      title: "Google Maps",
      url: `https://maps.google.com/maps?place_id=${parsedData.place_id}`,
      tips: "Direct Google Maps link using Place ID - Check business hours, photos, and basic info"
    });
    
    // Review list display link
    links.push({
      title: "Review List Display",
      url: `https://search.google.com/local/reviews?placeid=${parsedData.place_id}`,
      tips: "View all reviews for this business - Look for response rates, review quality, common complaints"
    });
    
    // Review request link
    links.push({
      title: "Review Request",
      url: `https://search.google.com/local/writereview?placeid=${parsedData.place_id}`,
      tips: "Direct link to request a review - Use for customer follow-up campaigns"
    });
    
    // GMB link with Place ID
    links.push({
      title: "GMB Place ID Link",
      url: `https://www.google.com/maps/place/?q=place_id:${parsedData.place_id}`,
      tips: "Google My Business link using Place ID - Browse to Services, Products, and Posts sections"
    });
  }
  
  // Add Google Business Profile link if we have CID
  if (parsedData.cid && parsedData.cid !== "N/A") {
    links.push({
      title: "Business Profile",
      url: `https://www.google.com/maps/place/?cid=${parsedData.cid}`,
      tips: "Google Business Profile page - Check completeness of profile, photos, and attributes"
    });
    
    // GMB link with CID
    links.push({
      title: "GMB CID Link",
      url: `https://www.google.com/maps/place/?cid=${parsedData.cid}`,
      tips: "Google My Business link using CID - Alternative access method for profile management"
    });
  }
  
  // Add Knowledge Graph links if available
  if (parsedData.kg_id && parsedData.kg_id !== "N/A" && parsedData.kg_id !== "Not found" && parsedData.kg_id.startsWith('/')) {
    const encodedKgId = encodeURIComponent(parsedData.kg_id);
    
    // Knowledge Panel page link
    links.push({
      title: "Knowledge Panel",
      url: `https://www.google.com/search?kgmid=${encodedKgId}`,
      tips: "Google Knowledge Panel for this entity - Check for accuracy, completeness, and claim status"
    });
    
    // GMB Post URL
    links.push({
      title: "GMB Post URL",
      url: `https://www.google.com/search?kgmid=${encodedKgId}&uact=5#lpstate=pid:-1`,
      tips: "Google My Business posts for this entity - Monitor posting frequency and engagement"
    });
    
    // Ask question request URL
    links.push({
      title: "Ask Question Request",
      url: `https://www.google.com/search?kgmid=${encodedKgId}&uact=5#lpqa=a,,d,1`,
      tips: "Ask a question about this business - Test customer interaction features"
    });
    
    // Q&A Panel
    links.push({
      title: "Questions and Answers",
      url: `https://www.google.com/search?kgmid=${encodedKgId}&uact=5#lpqa=d,2`,
      tips: "Google Q&A section for this entity - Check response rate and quality of answers"
    });
    
    // Products
    links.push({
      title: "Products",
      url: `https://www.google.com/search?kgmid=${encodedKgId}#lpc=lpc`,
      tips: "Products listed for this business - Verify product accuracy and pricing"
    });
  }
  
  // Add address-based links if available
  if (encodedAddress) {
    // Other GMB's at same address
    links.push({
      title: "Other GMBs at Address",
      url: `https://www.google.com/maps/place/${encodedAddress}`,
      tips: "Other businesses at the same address - Check for potential duplicate listings or competitors"
    });
  }
  
  // Add website-based links if available
  if (domain && encodedDomain) {
    // GMB's with same website domain
    links.push({
      title: "GMBs with Same Domain",
      url: `https://www.google.com/search?q="${encodedDomain}"&tbm=lcl`,
      tips: "Other businesses with the same website domain - Look for franchise locations or related businesses"
    });
    
    // SEO audit links
    links.push({
      title: "Website Cache",
      url: `https://www.google.com/search?q=cache:${encodedDomain}`,
      tips: "Website cache with Google - Check last crawl date and cached content accuracy"
    });
    
    links.push({
      title: "Website Indexed Content",
      url: `https://www.google.com/search?q=site:${encodedDomain}`,
      tips: "Website content indexed by Google - Check indexing status and page count"
    });
    
    links.push({
      title: "Website Content (Last Week)",
      url: `https://www.google.com/search?q=site:${encodedDomain}&as_qdr=w`,
      tips: "Website content indexed by Google last week - Monitor fresh content publication"
    });
    
    links.push({
      title: "Website Content (Last Month)",
      url: `https://www.google.com/search?q=site:${encodedDomain}&as_qdr=m`,
      tips: "Website content indexed by Google last month - Track content update frequency"
    });
    
    links.push({
      title: "Website Content (6 Months)",
      url: `https://www.google.com/search?q=site:${encodedDomain}&as_qdr=m6`,
      tips: "Website content indexed by Google in the last 6 months - Analyze content strategy trends"
    });
    
    // Website analysis tools
    links.push({
      title: "Traffic Analysis",
      url: `https://app.neilpatel.com/en/traffic_analyzer/overview?domain=${encodedDomain}`,
      tips: "Analyze website traffic - Check organic traffic trends, top pages, and keywords"
    });
    
    links.push({
      title: "Mobile Usability",
      url: `https://search.google.com/search-console/mobile-usability`,
      tips: "Google Search Console mobile usability tool - Test mobile-friendliness and responsive design"
    });
    
    links.push({
      title: "Page Speed",
      url: `https://developers.google.com/speed/pagespeed/insights/?url=${encodeURIComponent(parsedData.website)}`,
      tips: "Google Page Speed score - Check Core Web Vitals and performance optimization opportunities"
    });
    
    links.push({
      title: "Domain Lookup",
      url: `https://whois.domaintools.com/${encodedDomain}`,
      tips: "Domain name lookup - Check registration date, expiration, and ownership details"
    });
    
    links.push({
      title: "Technology Stack",
      url: `https://builtwith.com/${encodedDomain}`,
      tips: "Technology used on website - Identify CMS, analytics, hosting, and marketing tools"
    });
    
    links.push({
      title: "Schema Analyzer",
      url: `https://search.google.com/test/rich-results?url=${encodeURIComponent(parsedData.website)}`,
      tips: "Website schema (structured data) analyzer - Verify LocalBusiness and other schema markup"
    });
    
    links.push({
      title: "Website Audit",
      url: `https://app.neilpatel.com/en/seo_analyzer/site_audit?domain=${encodedDomain}`,
      tips: "Website audit - Check SEO issues, broken links, and optimization opportunities"
    });
    
    links.push({
      title: "Website History",
      url: `https://web.archive.org/web/*/${encodedDomain}`,
      tips: "Website history - Track design changes, content evolution, and business development"
    });

    // Advanced SEO Audit Links
    links.push({
      title: "Backlinks to Domain",
      url: `https://www.google.com/search?q=link:${encodedDomain}+-site:${encodedDomain}`,
      tips: "External sites linking to this domain - Analyze link building opportunities and authority"
    });
    
    links.push({
      title: "Similar Sites",
      url: `https://www.google.com/search?q=related:${encodedDomain}`,
      tips: "Websites similar to this domain - Identify competitors and industry players"
    });
    
    links.push({
      title: "Domain Mentions",
      url: `https://www.google.com/search?q="${encodedDomain}"+-site:${encodedDomain}`,
      tips: "Mentions of the domain across the web - Monitor brand awareness and citations"
    });
    
    links.push({
      title: "PDF Files on Domain",
      url: `https://www.google.com/search?q=site:${encodedDomain}+filetype:pdf`,
      tips: "PDF documents on the website - Check for downloadable resources, catalogs, guides"
    });
    
    links.push({
      title: "Doc Files on Domain",
      url: `https://www.google.com/search?q=site:${encodedDomain}+filetype:doc+OR+filetype:docx`,
      tips: "Word documents on the website - Look for forms, applications, detailed documentation"
    });
    
    links.push({
      title: "Image Files on Domain",
      url: `https://www.google.com/search?q=site:${encodedDomain}&tbm=isch`,
      tips: "Images indexed from this domain - Check image SEO, alt text optimization, visual content"
    });
    
    links.push({
      title: "Contact Pages",
      url: `https://www.google.com/search?q=site:${encodedDomain}+inurl:contact+OR+inurl:about`,
      tips: "Contact and about pages on the website - Verify NAP consistency and contact methods"
    });
    
    links.push({
      title: "Login/Admin Pages",
      url: `https://www.google.com/search?q=site:${encodedDomain}+inurl:login+OR+inurl:admin+OR+inurl:wp-admin`,
      tips: "Potential login or admin pages (security audit) - Check for exposed admin areas"
    });
    
    links.push({
      title: "Sitemap Files",
      url: `https://www.google.com/search?q=site:${encodedDomain}+inurl:sitemap`,
      tips: "XML sitemaps and site structure files - Verify proper sitemap submission and structure"
    });
    
    links.push({
      title: "Robots.txt File",
      url: `${parsedData.website.replace(/\/$/, '')}/robots.txt`,
      tips: "Robots.txt file for crawling directives - Check for proper crawl instructions and restrictions"
    });
    
    links.push({
      title: "Security Headers",
      url: `https://securityheaders.com/?q=${encodeURIComponent(parsedData.website)}`,
      tips: "Security headers analysis - Check HTTPS implementation and security best practices"
    });
    
    links.push({
      title: "SSL Certificate",
      url: `https://www.ssllabs.com/ssltest/analyze.html?d=${encodedDomain}`,
      tips: "SSL certificate security analysis - Verify certificate validity and security grade"
    });
    
    links.push({
      title: "DNS Lookup",
      url: `https://dnschecker.org/#A/${encodedDomain}`,
      tips: "DNS records and propagation check - Verify domain configuration and hosting setup"
    });
    
    links.push({
      title: "Website Uptime",
      url: `https://downforeveryoneorjustme.com/${encodedDomain}`,
      tips: "Check if website is currently accessible - Monitor uptime and availability issues"
    });
  }
  
  // Add business name related links if available
  if (encodedBusinessName) {
    links.push({
      title: "Brand Name Mentions",
      url: `https://www.google.com/search?q="${encodedBusinessName}"${domain ? `+-site:${encodedDomain}` : ''}`,
      tips: "Brand mentions excluding their own site - Monitor online reputation and brand awareness"
    });
    
    links.push({
      title: "Competitors Analysis",
      url: `https://www.google.com/search?q="${encodedBusinessName}"+competitors+OR+alternatives`,
      tips: "Find competitors and alternatives - Research competitive landscape and market positioning"
    });
    
    links.push({
      title: "News Mentions",
      url: `https://www.google.com/search?q="${encodedBusinessName}"${domain ? `+OR+"${encodedDomain}"` : ''}&tbm=nws`,
      tips: "News articles mentioning the business - Track media coverage and press mentions"
    });
    
    links.push({
      title: "Social Media Presence",
      url: `https://www.google.com/search?q="${encodedBusinessName}"+site:facebook.com+OR+site:twitter.com+OR+site:linkedin.com+OR+site:instagram.com`,
      tips: "Social media profiles for this business - Verify social presence and engagement levels"
    });
    
    links.push({
      title: "Directory Listings",
      url: `https://www.google.com/search?q="${encodedBusinessName}"+site:yelp.com+OR+site:yellowpages.com+OR+site:bbb.org`,
      tips: "Business directory listings - Check NAP consistency across major directories"
    });
  }
  
  // Add entity URL if available from KG
  if (parsedData.kg_url && parsedData.kg_url !== "Not available") {
    links.push({
      title: "Entity Website",
      url: parsedData.kg_url,
      tips: "Official website from Knowledge Graph - Verify website accuracy in knowledge panel"
    });
  }
  
  // Generate table rows with new format: [Title Phrase] | tips
  if (links.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="2" class="text-center text-muted py-4">
          <i class="fas fa-search me-2"></i>
          Extract and enrich data to see Knowledge Graph links
        </td>
      </tr>
    `;
  } else {
    tableBody.innerHTML = links.map(link => `
      <tr>
        <td style="width: 25%;">
          <a href="${link.url}" target="_blank" class="text-info text-decoration-none fw-semibold">
            ${link.title}
          </a>
        </td>
        <td class="text-muted">
          ${link.tips}
        </td>
      </tr>
    `).join('');
  }
}

function logStatus(message) {
  const log = document.getElementById("statusLog");
  if (!log) return;
  const timestamp = new Date().toLocaleTimeString();
  log.innerText = `[${timestamp}] ${message}`;
  console.log(message);
}

function updateApiStatus() {
  const statusText = document.getElementById("apiStatusText");
  const usageCount = document.getElementById("apiUsageCount");
  const statusLink = document.getElementById("apiStatusLink");
  
  fetch('/api/status')
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        statusText.textContent = "API Online";
        statusLink.className = statusLink.className.replace(/text-\w+/, 'text-success');
        
        // Don't reset the counter, use the session value
        if (typeof data.usage_today === 'number') {
          apiUsageToday = data.usage_today;
        }
        usageCount.textContent = apiUsageToday;
        
        // Updated tooltip - will be replaced with detailed stats on click
        const tooltip = `API Status: Online
Today's API Calls: ${apiUsageToday}
Click for detailed usage statistics
Last Check: ${new Date().toLocaleTimeString()}`;
        
        statusLink.setAttribute('data-bs-original-title', tooltip);
      } else {
        statusText.textContent = "API Error";
        statusLink.className = statusLink.className.replace(/text-\w+/, 'text-danger');
        usageCount.textContent = "!";
        statusLink.setAttribute('data-bs-original-title', `API Error: ${data.error}`);
      }
    })
    .catch(error => {
      statusText.textContent = "Offline";
      statusLink.className = statusLink.className.replace(/text-\w+/, 'text-warning');
      usageCount.textContent = "?";
      statusLink.setAttribute('data-bs-original-title', `Connection Error: ${error.message}`);
    });
}

function updateSessionUsage(count, apiType = 'unknown') {
  fetch('/api/increment-usage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      count: count,
      api_type: apiType
    })
  }).catch(error => {
    console.log("Failed to sync usage counter:", error);
  });
}

async function showDetailedApiUsage() {
  try {
    const response = await fetch('/api/usage-stats');
    const data = await response.json();
    
    if (data.success) {
      const stats = data.usage_stats;
      const pricing = data.pricing;
      
      const detailsHtml = `
        <div class="api-usage-details">
          <h6 class="text-primary mb-3">📊 Detailed API Usage</h6>
          
          <div class="row g-2 mb-3">
            <div class="col-6">
              <div class="bg-dark p-2 rounded">
                <small class="text-muted">Places API</small><br>
                <strong class="text-success">${stats.places_api.calls_today} calls</strong><br>
                <small class="text-warning">~$${stats.places_api.estimated_cost}</small>
              </div>
            </div>
            <div class="col-6">
              <div class="bg-dark p-2 rounded">
                <small class="text-muted">Knowledge Graph</small><br>
                <strong class="text-info">${stats.knowledge_graph.calls_today} calls</strong><br>
                <small class="text-warning">~$${stats.knowledge_graph.estimated_cost}</small>
              </div>
            </div>
          </div>
          
          <div class="bg-secondary p-2 rounded mb-2">
            <strong>Total: ${stats.total.calls_today} calls (~$${stats.total.estimated_cost})</strong>
          </div>
          
          <small class="text-muted">
            💡 ${pricing.free_tier}<br>
            📈 Session started: ${new Date(data.session_start || Date.now()).toLocaleString()}
          </small>
        </div>
      `;
      
      // Create modal or popover with usage details
      showUsageModal(detailsHtml);
      
    } else {
      logStatus("Failed to fetch detailed usage stats: " + data.error);
    }
  } catch (error) {
    logStatus("Error fetching usage stats: " + error.message);
  }
}

function showUsageModal(content) {
  // Create modal if it doesn't exist
  let modal = document.getElementById('usageModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.innerHTML = `
      <div class="modal fade" id="usageModal" tabindex="-1">
        <div class="modal-dialog modal-sm">
          <div class="modal-content bg-secondary text-light">
            <div class="modal-header border-secondary">
              <h5 class="modal-title">API Usage Statistics</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="usageModalBody">
            </div>
            <div class="modal-footer border-secondary">
              <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  document.getElementById('usageModalBody').innerHTML = content;
  const bootstrapModal = new bootstrap.Modal(document.getElementById('usageModal'));
  bootstrapModal.show();
}
