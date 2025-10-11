"""
Test script for PDF export functionality
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from memory_lane.pdf_export import generate_user_pdf, REPORTLAB_AVAILABLE
from datetime import datetime

def test_pdf_export():
    print("Testing PDF Export...")
    print(f"ReportLab available: {REPORTLAB_AVAILABLE}")
    
    if not REPORTLAB_AVAILABLE:
        print("ERROR: ReportLab is not available!")
        return False
    
    # Create sample data
    sample_items = [
        {
            "id": 1,
            "userId": 1,
            "url": "https://example.com/article1",
            "title": "Test Article 1",
            "source": "example.com",
            "contentType": "web",
            "content": "This is a test article about AI and machine learning.",
            "summary": "An interesting article about the latest developments in artificial intelligence.",
            "keywords": ["AI", "machine learning", "technology"],
            "emotion": "excited",
            "sentimentScore": 0.8,
            "thumbnail": None,
            "createdAt": datetime.now().isoformat(),
            "processed": True,
            "processingError": None
        },
        {
            "id": 2,
            "userId": 1,
            "url": "https://example.com/article2",
            "title": "Test Article 2",
            "source": "example.com",
            "contentType": "document",
            "content": "This is another test article about web development.",
            "summary": "A comprehensive guide to modern web development practices.",
            "keywords": ["web", "development", "programming"],
            "emotion": "thoughtful",
            "sentimentScore": 0.6,
            "thumbnail": None,
            "createdAt": datetime.now().isoformat(),
            "processed": True,
            "processingError": None
        }
    ]
    
    sample_insights = {
        "totalItems": 2,
        "byContentType": {
            "web": 1,
            "document": 1
        },
        "byEmotion": {
            "excited": 1,
            "thoughtful": 1
        },
        "topTags": [
            {"tag": "AI", "count": 1},
            {"tag": "machine learning", "count": 1},
            {"tag": "technology", "count": 1},
            {"tag": "web", "count": 1}
        ]
    }
    
    try:
        pdf_bytes = generate_user_pdf(
            user_email="test@example.com",
            items=sample_items,
            insights=sample_insights
        )
        
        # Save to file
        output_file = "test_export.pdf"
        with open(output_file, 'wb') as f:
            f.write(pdf_bytes)
        
        print(f"✓ PDF generated successfully: {output_file}")
        print(f"  File size: {len(pdf_bytes)} bytes")
        return True
        
    except Exception as e:
        print(f"✗ Error generating PDF: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = test_pdf_export()
    sys.exit(0 if success else 1)
