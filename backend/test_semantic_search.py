"""
Test script to demonstrate semantic tag search functionality.
"""
from pathlib import Path
from memory_lane.database import Database, SEMANTIC_SEARCH_AVAILABLE

def test_semantic_search():
    """Test semantic search with example queries."""
    
    print("=" * 60)
    print("  SEMANTIC TAG SEARCH TEST")
    print("=" * 60)
    
    if not SEMANTIC_SEARCH_AVAILABLE:
        print("\n❌ Semantic search is NOT available.")
        print("   Install: pip install sentence-transformers numpy")
        return
    
    print("\n✅ Semantic search is available!")
    
    # Connect to database
    db_path = Path(__file__).parent.parent / "memory_lane.db"
    if not db_path.exists():
        print(f"\n❌ Database not found at: {db_path}")
        return
    
    db = Database(db_path)
    
    # Get a user ID (using demo user)
    import sqlite3
    conn = sqlite3.connect(db_path)
    user = conn.execute("SELECT id FROM users LIMIT 1").fetchone()
    conn.close()
    
    if not user:
        print("\n❌ No users found in database")
        return
    
    user_id = user[0]
    print(f"\n📊 Testing with user ID: {user_id}")
    
    # Test queries
    test_queries = [
        "politics",      # Should match: government, election, congress, etc.
        "technology",    # Should match: tech, computer, software, etc.
        "sports",        # Should match: game, football, basketball, etc.
        "science",       # Should match: research, study, experiment, etc.
        "news",          # Should match: article, breaking, headline, etc.
    ]
    
    print("\n" + "=" * 60)
    print("  SEMANTIC TAG MATCHING EXAMPLES")
    print("=" * 60)
    
    for query in test_queries:
        print(f"\n🔍 Query: '{query}'")
        similar_tags = db._find_similar_tags(query, user_id, threshold=0.5)
        
        if similar_tags:
            print(f"   ✅ Found {len(similar_tags)} semantically similar tags:")
            for tag in sorted(similar_tags)[:10]:  # Show top 10
                print(f"      • {tag}")
        else:
            print("   ℹ️  No similar tags found")
    
    # Test actual search
    print("\n" + "=" * 60)
    print("  ACTUAL SEARCH TEST")
    print("=" * 60)
    
    test_search = "news"
    print(f"\n🔍 Searching for: '{test_search}'")
    items, semantic_used = db.search_items(user_id=user_id, query=test_search, limit=10)
    
    print(f"\n   Results: {len(items)} items found")
    print(f"   Semantic search used: {'Yes ✅' if semantic_used else 'No'}")
    
    if items:
        print("\n   Sample results:")
        for i, item in enumerate(items[:5], 1):
            tags = ", ".join(item.keywords[:3]) if item.keywords else "No tags"
            print(f"   {i}. {item.title[:60]}...")
            print(f"      Tags: {tags}")
    
    print("\n" + "=" * 60)
    print("  TEST COMPLETE")
    print("=" * 60)

if __name__ == "__main__":
    test_semantic_search()
