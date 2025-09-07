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
logging.basicConfig(level=logging.INFO)
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
            logger.info(f"Searching Knowledge Graph for: {query}")
            response = self.session.get(self.base_url, params=params, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"Found {len(data.get('itemListElement', []))} entities")
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
    
    def find_business_entity(self, business_name: str, location: str = None) -> Dict[str, Any]:
        """
        Search for a specific business entity with enhanced matching
        
        Args:
            business_name: Name of the business
            location: Optional location to help with disambiguation
            
        Returns:
            Dictionary with the best matching entity or error information
        """
        # Create search query
        query = business_name
        if location:
            query += f" {location}"
        
        # Search with business-specific types
        result = self.search_entity(
            query=query,
            types=['LocalBusiness', 'Organization', 'Place'],
            limit=10
        )
        
        if not result['success']:
            return result
        
        entities = result['data'].get('itemListElement', [])
        if not entities:
            return {
                'success': True,
                'entity': None,
                'message': 'No entities found in Knowledge Graph',
                'kg_id': 'Not found'
            }
        
        # Find best match using name similarity and result score
        best_match = self._find_best_match(entities, business_name)
        
        if best_match:
            entity_data = self._extract_entity_data(best_match)
            return {
                'success': True,
                'entity': entity_data,
                'message': f"Found entity: {entity_data.get('name', 'Unknown')}",
                'kg_id': entity_data.get('kg_id', 'Not available')
            }
        else:
            return {
                'success': True,
                'entity': None,
                'message': 'No good matches found',
                'kg_id': 'Not found'
            }
    
    def _find_best_match(self, entities: List[Dict], target_name: str) -> Optional[Dict]:
        """Find the best matching entity from search results"""
        if not entities:
            return None
        
        best_match = None
        best_score = 0
        
        target_lower = target_name.lower()
        
        for item in entities:
            result = item.get('result', {})
            name = result.get('name', '').lower()
            score = item.get('resultScore', 0)
            
            # Boost score for exact or close name matches
            name_similarity = 0
            if target_lower in name or name in target_lower:
                name_similarity = 0.8
            elif any(word in name for word in target_lower.split()):
                name_similarity = 0.4
            
            # Combined score: result score + name similarity boost
            combined_score = score + (name_similarity * 1000)
            
            if combined_score > best_score:
                best_score = combined_score
                best_match = result
        
        return best_match
    
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
