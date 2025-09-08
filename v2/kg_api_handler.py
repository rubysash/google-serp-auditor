# FILE: kg_api_handler.py
# Knowledge Graph API Handler for Google Maps Intelligence Tool
# Handles Knowledge Graph Search API calls to fetch entity data including KG IDs

"""
Knowledge Graph API Handler for Google Maps Intelligence Tool
Handles Knowledge Graph Search API calls to fetch entity data including KG IDs
"""

import requests
import json
import os
import time
from typing import Dict, List, Optional, Any
from urllib.parse import urlencode
import logging

# Set up logging
DEBUG_MODE = os.environ.get("DEBUG", "False").lower() == "true"

# Update the logger configuration
if DEBUG_MODE:
    logging.basicConfig(level=logging.DEBUG)
else:
    logging.basicConfig(level=logging.WARNING)  # Only warnings and errors in production
logger = logging.getLogger(__name__)


class KnowledgeGraphAPI:
    """Handler for Google Knowledge Graph Search API"""
    
    def __init__(self, api_key: str = None):
        """
        Initialize the Knowledge Graph API handler
        
        Args:
            api_key: Google API key with Knowledge Graph Search API enabled
        """
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY")
        self.base_url = "https://kgsearch.googleapis.com/v1/entities:search"
        self.session = requests.Session()
        
        if not self.api_key:
            raise ValueError("API key is required. Set GOOGLE_API_KEY environment variable or pass api_key parameter.")
    
    def search_entity(self, 
                     query: str, 
                     types: List[str] = None, 
                     limit: int = 10,
                     languages: List[str] = None) -> Dict[str, Any]:
        """
        Search for entities in the Knowledge Graph
        
        Args:
            query: Search query (business name, person name, etc.)
            types: List of schema.org types to filter by (e.g., ['LocalBusiness', 'Organization'])
            limit: Maximum number of results to return (default: 10)
            languages: List of language codes (e.g., ['en', 'es'])
            
        Returns:
            Dictionary containing the API response with entity data
        """
        params = {
            'query': query,
            'limit': min(limit, 500),  # API maximum is 500
            'indent': True,
            'key': self.api_key
        }
        
        if types:
            params['types'] = types
            
        if languages:
            params['languages'] = languages
        
        try:
            if DEBUG_MODE:
                logger.debug(f"Searching Knowledge Graph for: {query}")
            response = self.session.get(self.base_url, params=params, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                if DEBUG_MODE:
                    logger.debug(f"Found {len(data.get('itemListElement', []))} entities")
                return {
                    'success': True,
                    'data': data,
                    'query': query,
                    'total_results': len(data.get('itemListElement', []))
                }
            elif response.status_code == 403:
                logger.error("Knowledge Graph API access denied - check API key and permissions")
                return {
                    'success': False,
                    'error': 'API_ACCESS_DENIED',
                    'message': 'Access denied. Check API key and enable Knowledge Graph Search API.',
                    'status_code': 403
                }
            elif response.status_code == 429:
                logger.error("Knowledge Graph API quota exceeded")
                return {
                    'success': False,
                    'error': 'QUOTA_EXCEEDED',
                    'message': 'API quota exceeded. Try again later.',
                    'status_code': 429
                }
            else:
                logger.error(f"Knowledge Graph API error: {response.status_code}")
                return {
                    'success': False,
                    'error': 'API_ERROR',
                    'message': f'API returned status {response.status_code}: {response.text}',
                    'status_code': response.status_code
                }
                
        except requests.exceptions.Timeout:
            logger.error("Knowledge Graph API request timeout")
            return {
                'success': False,
                'error': 'TIMEOUT',
                'message': 'Request timeout after 30 seconds'
            }
        except requests.exceptions.RequestException as e:
            logger.error(f"Knowledge Graph API request failed: {e}")
            return {
                'success': False,
                'error': 'NETWORK_ERROR',
                'message': f'Network error: {str(e)}'
            }
 
    def _extract_entity_data(self, entity: Dict) -> Dict[str, Any]:
        """Extract relevant data from a Knowledge Graph entity"""
        return {
            'kg_id': entity.get('@id', 'Not available'),
            'name': entity.get('name', 'Not available'),
            'description': entity.get('description', 'Not available'),
            'types': entity.get('@type', []),
            'url': entity.get('url', 'Not available'),
            'image_url': entity.get('image', {}).get('contentUrl', 'Not available') if entity.get('image') else 'Not available',
            'detailed_description': entity.get('detailedDescription', {}).get('articleBody', 'Not available') if entity.get('detailedDescription') else 'Not available',
            'detailed_description_url': entity.get('detailedDescription', {}).get('url', 'Not available') if entity.get('detailedDescription') else 'Not available'
        }

    def _clean_business_name(self, name: str) -> str:
        """Remove common business suffixes and clean name for better matching"""
        import re
        
        # Common business suffixes to remove
        suffixes = [
            r'\b(LLC|Inc|Corp|Corporation|Company|Co|Ltd|Limited|LP|LLP)\b',
            r'\b(Restaurant|Cafe|Coffee|Shop|Store|Market|Center|Centre)\b',
            r'\b(Services|Service|Group|Associates|Solutions)\b'
        ]
        
        cleaned = name
        for suffix in suffixes:
            cleaned = re.sub(suffix, '', cleaned, flags=re.IGNORECASE)
        
        # Clean up extra spaces and punctuation
        cleaned = re.sub(r'[^\w\s]', ' ', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        
        return cleaned

    def _find_best_match(self, entities: List[Dict], target_name: str, location: str = None) -> Optional[Dict]:
        """Enhanced matching algorithm with multiple scoring factors"""
        if not entities:
            return None
        
        best_match = None
        best_score = 0
        
        target_lower = target_name.lower()
        location_lower = location.lower() if location else ""
        
        for item in entities:
            result = item.get('result', {})
            name = result.get('name', '').lower()
            description = result.get('description', '').lower()
            result_score = item.get('resultScore', 0)
            
            # Name similarity scoring
            name_score = 0
            if target_lower == name:
                name_score = 1.0  # Exact match
            elif target_lower in name or name in target_lower:
                name_score = 0.8  # Partial match
            else:
                # Word overlap scoring
                target_words = set(target_lower.split())
                name_words = set(name.split())
                if target_words and name_words:
                    overlap = len(target_words.intersection(name_words))
                    name_score = overlap / max(len(target_words), len(name_words))
            
            # Location scoring (if provided)
            location_score = 0
            if location_lower:
                if location_lower in description or any(loc_word in description for loc_word in location_lower.split()):
                    location_score = 0.3
            
            # Entity type scoring (prefer business-related types)
            type_score = 0
            entity_types = result.get('@type', [])
            if isinstance(entity_types, list):
                business_types = ['LocalBusiness', 'Organization', 'Place', 'Corporation']
                if any(btype in entity_types for btype in business_types):
                    type_score = 0.2
            
            # Combined scoring
            # Normalize result_score (typically 0-1000)
            normalized_result_score = min(result_score / 1000, 1.0)
            
            combined_score = (
                name_score * 0.5 +
                normalized_result_score * 0.3 +
                location_score +
                type_score
            )
            
            if combined_score > best_score:
                best_score = combined_score
                best_match = {
                    'entity': result,
                    'score': combined_score,
                    'name_score': name_score,
                    'result_score': result_score
                }
        
        # Only return matches with reasonable confidence
        if best_match and best_match['score'] >= 0.3:
            return best_match
        
        return None

    def find_business_entity(self, business_name: str, location: str = None, kgmid: str = None) -> Dict[str, Any]:
        """
        Search for a specific business entity with enhanced matching
        
        Args:
            business_name: Name of the business
            location: Optional location to help with disambiguation
            kgmid: Optional Knowledge Graph MID extracted from URL
            
        Returns:
            Dictionary with the best matching entity or error information
        """
        # If we have a KG ID from the URL, try to fetch it directly
        if kgmid:
            if DEBUG_MODE:
                logger.debug(f"Attempting direct lookup with KG ID: {kgmid}")
            direct_result = self.get_entity_by_id(kgmid)
            if direct_result and direct_result.get('success'):
                return direct_result
        
        # Try multiple search strategies with business-specific focus
        search_queries = []
        
        # Strategy 1: Business name + location with quotes for exact matching
        if location:
            search_queries.append(f'"{business_name}" {location}')
        
        # Strategy 2: Business name only with quotes
        search_queries.append(f'"{business_name}"')
        
        # Strategy 3: Business name without quotes
        search_queries.append(business_name)
        
        # Strategy 4: Clean business name (remove common suffixes)
        clean_name = self._clean_business_name(business_name)
        if clean_name != business_name and location:
            search_queries.append(f'"{clean_name}" {location}')
        
        # Prioritize business types over person types
        entity_types = [
            ['LocalBusiness'],  # Most specific
            ['Organization', 'Corporation'],
            ['Place'],
            ['LocalBusiness', 'Organization', 'Place'],
            None  # No type restriction as last resort
        ]
        
        best_result = None
        best_score = 0
        
        for query in search_queries:
            for types in entity_types:
                result = self.search_entity(
                    query=query,
                    types=types,
                    limit=20
                )
                
                if not result['success']:
                    continue
                
                entities = result['data'].get('itemListElement', [])
                if not entities:
                    continue
                
                # Filter out person entities when searching for businesses
                business_entities = []
                for item in entities:
                    entity_types = item.get('result', {}).get('@type', [])
                    # Skip if it's primarily a Person entity
                    if 'Person' not in entity_types:
                        business_entities.append(item)
                
                if not business_entities:
                    continue
                
                # Find best match from filtered results
                match = self._find_best_match(business_entities, business_name, location)
                if match and match['score'] > best_score:
                    best_score = match['score']
                    best_result = match['entity']
                    # If we find a high-confidence match, stop searching
                    if match['score'] > 0.8:
                        break
            
            if best_score > 0.8:
                break
        
        if best_result:
            entity_data = self._extract_entity_data(best_result)
            return {
                'success': True,
                'entity': entity_data,
                'message': f"Found entity: {entity_data.get('name', 'Unknown')} (score: {best_score:.2f})",
                'kg_id': entity_data.get('kg_id', 'Not available')
            }
        else:
            return {
                'success': True,
                'entity': None,
                'message': f'No business entity found for "{business_name}" - may be a local business without Knowledge Graph presence',
                'kg_id': 'Not found'
            }

    def get_entity_by_id(self, kgmid: str) -> Dict[str, Any]:
        """
        Fetch entity directly by Knowledge Graph MID
        
        Args:
            kgmid: Knowledge Graph MID (e.g., '/g/11bzt6slj6')
            
        Returns:
            Dictionary with entity data or error information
        """
        params = {
            'ids': kgmid,
            'indent': True,
            'key': self.api_key
        }
        
        try:
            if DEBUG_MODE:
                logger.debug(f"Fetching entity by ID: {kgmid}")
            response = self.session.get(self.base_url, params=params, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                entities = data.get('itemListElement', [])
                
                if entities:
                    entity = entities[0].get('result', {})
                    entity_data = self._extract_entity_data(entity)
                    return {
                        'success': True,
                        'entity': entity_data,
                        'message': f"Found entity by ID: {entity_data.get('name', 'Unknown')}",
                        'kg_id': entity_data.get('kg_id', kgmid)
                    }
                else:
                    logger.error(f"No entity found for KG ID: {kgmid}")
                    return {
                        'success': False,
                        'error': 'NOT_FOUND',
                        'message': f'No entity found for KG ID: {kgmid}'
                    }
            else:
                logger.error(f"Failed to fetch entity by ID: {response.status_code}")
                return {
                    'success': False,
                    'error': 'API_ERROR',
                    'message': f'Failed to fetch entity: {response.status_code}'
                }
                
        except Exception as e:
            logger.error(f"Error fetching entity by ID: {e}")
            return {
                'success': False,
                'error': 'FETCH_ERROR',
                'message': str(e)
            }

    def debug_search_results(self, business_name: str, location: str = None) -> Dict[str, Any]:
        """Debug method to see all search results for troubleshooting"""
        query = business_name
        if location:
            query += f" {location}"
        
        result = self.search_entity(
            query=query,
            types=['LocalBusiness', 'Organization', 'Place'],
            limit=20
        )
        
        if result['success']:
            entities = result['data'].get('itemListElement', [])
            debug_info = []
            
            for i, item in enumerate(entities):
                entity = item.get('result', {})
                debug_info.append({
                    'rank': i + 1,
                    'name': entity.get('name', 'Unknown'),
                    'description': entity.get('description', 'No description'),
                    'kg_id': entity.get('@id', 'No ID'),
                    'types': entity.get('@type', []),
                    'result_score': item.get('resultScore', 0),
                    'url': entity.get('url', 'No URL')
                })
            
            return {
                'success': True,
                'query': query,
                'total_results': len(entities),
                'entities': debug_info
            }
        
        return result

    def debug_kgid_lookup(self, kgmid: str) -> Dict[str, Any]:
        """Debug KG ID lookup with detailed logging"""
        if DEBUG_MODE:
            logger.debug(f"🔍 DEBUG: Attempting to fetch KG ID: {kgmid}")
        
        # Try the direct lookup first
        params = {
            'ids': kgmid,
            'indent': True,
            'key': self.api_key
        }
        
        try:
            response = self.session.get(self.base_url, params=params, timeout=30)
            if DEBUG_MODE:
                logger.debug(f"📡 Direct lookup response status: {response.status_code}")
                logger.debug(f"📡 Response content: {response.text[:500]}...")
            
            if response.status_code == 200:
                data = response.json()
                if DEBUG_MODE:
                    logger.debug(f"📊 Response data keys: {list(data.keys())}")
                entities = data.get('itemListElement', [])
                if DEBUG_MODE:
                    logger.debug(f"📊 Found {len(entities)} entities")
                
                if entities:
                    entity = entities[0].get('result', {})
                    if DEBUG_MODE:
                        logger.debug(f"✅ Entity found: {entity.get('name', 'Unknown')}")
                    return {'success': True, 'entity': entity}
                else:
                    logger.warning(f"⚠️ No entities in response for KG ID: {kgmid}")
            else:
                logger.error(f"❌ HTTP {response.status_code}: {response.text}")
                
        except Exception as e:
            logger.error(f"💥 Exception during KG ID lookup: {e}")
        
        return {'success': False, 'error': 'Debug lookup failed'}

    def debug_direct_lookup(self, kgmid: str) -> Dict[str, Any]:
        """Debug the direct KG ID lookup"""
        if DEBUG_MODE:
            logger.debug(f"🔍 DEBUG: Direct lookup for KG ID: {kgmid}")
        
        params = {
            'ids': kgmid,
            'indent': True,
            'key': self.api_key
        }
        
        try:
            if DEBUG_MODE:
                logger.debug(f"📡 Request URL: {self.base_url}")
                logger.debug(f"📡 Request params: {params}")
            
            response = self.session.get(self.base_url, params=params, timeout=30)
            if DEBUG_MODE:
                logger.debug(f"📡 Response status: {response.status_code}")
                logger.debug(f"📡 Response headers: {dict(response.headers)}")
                logger.debug(f"📡 Response content: {response.text}")
            
            if response.status_code == 200:
                data = response.json()
                return {
                    'success': True,
                    'raw_response': data,
                    'entities_found': len(data.get('itemListElement', []))
                }
            else:
                return {
                    'success': False,
                    'error': f"HTTP {response.status_code}",
                    'response_text': response.text
                }
                
        except Exception as e:
            logger.error(f"💥 Exception: {e}")
            return {'success': False, 'error': str(e)}

def test_knowledge_graph_api():
    """Test function to verify the Knowledge Graph API is working"""
    try:
        # Test with a well-known entity
        kg = KnowledgeGraphAPI()
        result = kg.find_business_entity("Starbucks", "Seattle")
        
        print("Knowledge Graph API Test Results:")
        print(f"Success: {result['success']}")
        print(f"Message: {result['message']}")
        
        if result['success'] and result['entity']:
            entity = result['entity']
            print(f"Entity Name: {entity['name']}")
            print(f"KG ID: {entity['kg_id']}")
            print(f"Description: {entity['description']}")
            print(f"Types: {', '.join(entity['types']) if isinstance(entity['types'], list) else entity['types']}")
        
        return result
        
    except Exception as e:
        print(f"Test failed: {e}")
        return {'success': False, 'error': str(e)}


if __name__ == "__main__":
    # Run test if executed directly
    test_knowledge_graph_api()