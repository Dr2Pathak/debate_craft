import requests
import os
import time
import json
import re
from dotenv import load_dotenv
from collections import defaultdict, Counter
from datetime import datetime

load_dotenv()

api_key = os.getenv('CORE_API_KEY')
headers = {"Authorization": f"Bearer {api_key}"}

# Focused academic fields for debate topics
academic_fields = {
    "history": {
        "keywords": ["world war", "civil war", "revolution", "ancient history", "medieval history", "renaissance"],
        "title_keywords": ["history", "historical", "war", "revolution", "ancient", "medieval"],
        "fulltext_keywords": ["historical", "war", "revolution", "ancient", "medieval", "renaissance"]
    },
    "english": {
        "keywords": ["literature", "poetry", "novels", "drama", "literary analysis", "criticism"],
        "title_keywords": ["literature", "poetry", "novel", "drama", "literary", "criticism"],
        "fulltext_keywords": ["literature", "poetry", "novel", "drama", "literary", "criticism"]
    },
    "politics": {
        "keywords": ["presidents", "government", "law", "policy", "democracy", "elections"],
        "title_keywords": ["political", "government", "policy", "democracy", "election", "law"],
        "fulltext_keywords": ["political", "government", "policy", "democracy", "election", "law"]
    },
    "business": {
        "keywords": ["management", "finance", "marketing", "entrepreneurship", "strategy", "economics"],
        "title_keywords": ["business", "management", "finance", "marketing", "strategy", "corporate"],
        "fulltext_keywords": ["business", "management", "finance", "marketing", "strategy", "corporate"]
    },
    "science": {
        "keywords": ["research", "experiment", "discovery", "theory", "hypothesis", "analysis"],
        "title_keywords": ["scientific", "research", "experiment", "theory", "analysis", "study"],
        "fulltext_keywords": ["scientific", "research", "experiment", "theory", "analysis", "study"]
    }
}

def detect_field_from_content(paper, academic_fields):
    """Intelligently detect field from paper content with proper existence checks"""
    title = paper.get('title', '').lower()
    
    # Check if abstract exists and get it
    abstract = ''
    if paper.get('abstract') is not None:
        abstract = paper.get('abstract', '').lower()
    
    # Check if fulltext exists and get it
    fulltext = ''
    if paper.get('fullText') is not None:
        fulltext = paper.get('fullText', '').lower()
    
    # Handle fieldOfStudy safely
    field_of_study = paper.get('fieldOfStudy')
    if field_of_study is None:
        field_of_study = ''
    else:
        field_of_study = str(field_of_study).lower()
    
    field_scores = defaultdict(int)
    
    # Score based on fieldOfStudy
    if field_of_study:
        for field_name, field_config in academic_fields.items():
            if any(keyword in field_of_study for keyword in field_config["keywords"]):
                field_scores[field_name] += 5
    
    # Score based on title keywords
    for field_name, field_config in academic_fields.items():
        for keyword in field_config["title_keywords"]:
            if keyword in title:
                field_scores[field_name] += 3
    
    # Score based on abstract keywords (only if abstract exists)
    if abstract:
        for field_name, field_config in academic_fields.items():
            for keyword in field_config["keywords"]:
                if keyword in abstract:
                    field_scores[field_name] += 2
    
    # Score based on fulltext keywords (only if fulltext exists)
    if fulltext:
        for field_name, field_config in academic_fields.items():
            for keyword in field_config["fulltext_keywords"]:
                if keyword in fulltext:
                    field_scores[field_name] += 1
    
    # Return the field with highest score, or None if no clear match
    if field_scores:
        best_field = max(field_scores.items(), key=lambda x: x[1])
        if best_field[1] >= 2:
            return best_field[0]
    
    return None

def create_paper_id(paper):
    """Create a unique identifier for a paper to detect duplicates"""
    # Primary: Use CORE ID if available
    if paper.get('id'):
        return f"core_{paper['id']}"
    
    # Secondary: Use DOI if available
    if paper.get('doi'):
        return f"doi_{paper['doi']}"
    
    # Tertiary: Create hash from title and first author
    title = paper.get('title', '').lower().strip()
    first_author = ""
    if paper.get('authors') and len(paper['authors']) > 0:
        first_author = paper['authors'][0].get('name', '').lower().strip()
    
    # Create a simple hash
    import hashlib
    content = f"{title}|{first_author}"
    return f"hash_{hashlib.md5(content.encode()).hexdigest()[:16]}"

def collect_sources_for_field(field_name, field_config, target_count=500):
    """Collect sources with equal distribution across individual keywords"""
    print(f"\n🔍 Collecting sources for: {field_name}")
    
    # Get individual keywords (not search strategies)
    keywords = field_config["keywords"]
    papers_per_keyword = target_count // len(keywords)
    print(f"   Keywords: {keywords}")
    print(f"   Target: {papers_per_keyword} papers per keyword")
    
    collected = []
    seen_paper_ids = set()
    total_checked = 0
    duplicates_found = 0
    
    # Collect papers for each individual keyword
    for i, keyword in enumerate(keywords):
        print(f"   Keyword {i+1}/{len(keywords)}: '{keyword}' (target: {papers_per_keyword})")
        
        keyword_collected = 0
        offset = 0
        batch_size = 50
        
        while keyword_collected < papers_per_keyword and offset < 1000:
            max_retries = 3
            retry_count = 0
            
            while retry_count < max_retries:
                response = requests.post("https://api.core.ac.uk/v3/search/works", 
                                       headers=headers, 
                                       json={
                                           "q": keyword,  # Use the keyword directly
                                           "limit": batch_size,
                                           "offset": offset,
                                           "scroll": False
                                       })
                
                if response.status_code == 200:
                    data = response.json()
                    results = data.get('results', [])
                    
                    if not results:
                        break
                    
                    total_checked += len(results)
                    batch_new = 0
                    batch_duplicates = 0
                    
                    for paper in results:
                        if keyword_collected >= papers_per_keyword:
                            break
                        
                        paper_id = create_paper_id(paper)
                        
                        if paper_id in seen_paper_ids:
                            batch_duplicates += 1
                            continue
                        
                        detected_field = detect_field_from_content(paper, academic_fields)
                        paper_field = str(paper.get('fieldOfStudy') or '').lower()                        
                        if (field_name in paper_field or 
                            detected_field == field_name or
                            any(kw in paper_field for kw in keywords)):
                            
                            seen_paper_ids.add(paper_id)
                            paper_data = {
                                'id': paper.get('id'),
                                'paper_id': paper_id,
                                'title': paper.get('title', ''),
                                'abstract': paper.get('abstract', ''),
                                'hasAbstract': paper.get('abstract') is not None,
                                'authors': [author.get('name', '') for author in paper.get('authors', [])],
                                'yearPublished': paper.get('yearPublished'),
                                'citationCount': paper.get('citationCount', 0),
                                'doi': paper.get('doi', ''),
                                'publisher': paper.get('publisher', ''),
                                'documentType': paper.get('documentType', ''),
                                'fieldOfStudy': paper.get('fieldOfStudy', ''),
                                'detectedField': detected_field,
                                'downloadUrl': paper.get('downloadUrl', ''),
                                'fullText': paper.get('fullText', ''),
                                'hasFullText': paper.get('fullText') is not None,
                                'searchStrategy': f"Direct keyword: {keyword}",
                                'keywordUsed': keyword,  # Track the specific keyword
                                'collectedAt': datetime.now().isoformat()
                            }
                            collected.append(paper_data)
                            keyword_collected += 1
                            batch_new += 1
                    
                    duplicates_found += batch_duplicates
                    print(f"     Found {batch_new} new papers, {batch_duplicates} duplicates (keyword total: {keyword_collected}, overall: {len(collected)})")
                    break
                    
                elif response.status_code == 500:
                    retry_count += 1
                    print(f"      Server error 500 (attempt {retry_count}/{max_retries}), retrying in 5 seconds...")
                    time.sleep(5)
                    continue
                    
                elif response.status_code == 429:
                    print(f"      Rate limit hit, waiting 60 seconds...")
                    time.sleep(60)
                    continue
                else:
                    print(f"      Error {response.status_code}: {response.text[:200]}")
                    break
                
                if retry_count >= max_retries:
                    print(f"      Failed after {max_retries} retries, moving to next keyword")
                    break
            
            offset += batch_size
            time.sleep(2)
        
        print(f"    Keyword '{keyword}' complete: {keyword_collected} papers")
    
    print(f"    Collected {len(collected)} unique papers for {field_name}")
    print(f"    Duplicates prevented: {duplicates_found}")
    
    # Print keyword distribution summary
    keyword_counts = {}
    for paper in collected:
        keyword = paper.get('keywordUsed', 'unknown')
        keyword_counts[keyword] = keyword_counts.get(keyword, 0) + 1
    
    print(f"    Keyword distribution:")
    for keyword, count in sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"     {keyword}: {count} papers")
    
    return collected

def analyze_keyword_distribution(collected_sources):
    """Analyze how well distributed the keywords are"""
    for field_name, papers in collected_sources.items():
        print(f"\n {field_name.upper()} - Keyword Distribution:")
        
        keyword_counts = {}
        for paper in papers:
            keyword = paper.get('keywordUsed', 'unknown')
            keyword_counts[keyword] = keyword_counts.get(keyword, 0) + 1
        
        for keyword, count in sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"   {keyword}: {count} papers")
        
        # Check if distribution is too skewed
        max_count = max(keyword_counts.values()) if keyword_counts else 0
        min_count = min(keyword_counts.values()) if keyword_counts else 0
        
        if max_count > min_count * 3:  # If max is 3x larger than min
            print(f"    Warning: Distribution is skewed (max: {max_count}, min: {min_count})")
        else:
            print(f"    Good distribution (max: {max_count}, min: {min_count})")

def save_sources_to_file(sources, filename="debate_sources.json"):
    """Save collected sources to JSON file"""
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(sources, f, indent=2, ensure_ascii=False)
    
    print(f" Saved {sum(len(papers) for papers in sources.values())} sources to {filename}")

def main():
    """Main collection process"""
    print(" Starting debate source collection...")
    print(" Target disciplines: history, english, politics, business, science")
    print(" Target: 500 papers per discipline")
    print(" Equal distribution: ~83 papers per keyword")
    
    collected_sources = {}
    
    # Collect sources for each field
    for field_name, field_config in academic_fields.items():
        new_sources = collect_sources_for_field(field_name, field_config, target_count=500)
        collected_sources[field_name] = new_sources
        
        # Save after each field
        save_sources_to_file(collected_sources)
    
    # Final save and summary
    save_sources_to_file(collected_sources)
    
    print(f"\n🎉 Collection complete!")
    print(f"📊 Summary:")
    for field, papers in collected_sources.items():
        print(f"   {field}: {len(papers)} papers")
    
    # Analyze keyword distribution
    analyze_keyword_distribution(collected_sources)
    
    # Create comprehensive summary
    summary = {
        "collection_date": datetime.now().isoformat(),
        "total_sources": sum(len(papers) for papers in collected_sources.values()),
        "field_breakdown": {field: len(papers) for field, papers in collected_sources.items()},
        "target_disciplines": ["history", "english", "politics", "business", "science"],
        "keywords_per_discipline": {field: len(config["keywords"]) for field, config in academic_fields.items()},
        "papers_per_keyword": 500 // 6,  # 83 papers per keyword
        "search_strategy": "direct_keyword_search",
        "field_detection_methods": ["fieldOfStudy", "title_keywords", "abstract_keywords", "fulltext_keywords"],
        "duplicate_prevention": "enabled",
        "equal_keyword_distribution": "enabled"
    }
    
    with open("debate_collection_summary.json", 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f" Summary saved to debate_collection_summary.json")

if __name__ == "__main__":
    main()