"""
PDF Export functionality for Memory Lane user data.

Creates a beautifully formatted PDF containing all user summaries and insights.
"""
from __future__ import annotations

import io
from datetime import datetime
from typing import Any

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.lib.units import inch
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False


def format_time(ts: str | datetime | None) -> str:
    """Format a timestamp to a readable string."""
    if not ts:
        return ''
    if isinstance(ts, datetime):
        return ts.strftime('%Y-%m-%d %H:%M:%S')
    # Try to parse ISO format
    try:
        dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return str(ts)


def generate_user_pdf(
    user_email: str,
    items: list[dict[str, Any]],
    insights: dict[str, Any],
) -> bytes:
    """
    Generate a PDF containing all user data.
    
    Args:
        user_email: Email of the user
        items: List of item dictionaries
        insights: Insights dictionary with stats
        
    Returns:
        PDF file content as bytes
        
    Raises:
        RuntimeError: If reportlab is not installed
    """
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError(
            'reportlab is required to generate PDF. '
            'Install with: pip install reportlab'
        )
    
    # Create PDF in memory
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Title'],
        alignment=TA_CENTER,
        fontSize=20,
        spaceAfter=12
    )
    h2_style = ParagraphStyle(
        'Heading2',
        parent=styles['Heading2'],
        alignment=TA_LEFT,
        fontSize=14,
        spaceAfter=8
    )
    meta_style = ParagraphStyle(
        'Meta',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.grey
    )
    summary_style = ParagraphStyle(
        'Summary',
        parent=styles['BodyText'],
        fontSize=11,
        leading=14
    )
    
    # Build document
    flow = []
    
    # Title and metadata
    flow.append(Paragraph(f"Memory Lane Export", title_style))
    flow.append(Paragraph(f"User: {user_email}", meta_style))
    flow.append(Paragraph(f"Exported: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", meta_style))
    flow.append(Spacer(1, 20))
    
    # Insights section
    flow.append(Paragraph("Your Memory Lane Insights", h2_style))
    flow.append(Spacer(1, 8))
    
    # Total items
    total_items = insights.get('totalItems', 0)
    flow.append(Paragraph(f"<b>Total Memories:</b> {total_items}", styles['Normal']))
    flow.append(Spacer(1, 8))
    
    # Content type breakdown
    by_content_type = insights.get('byContentType', {})
    if by_content_type:
        data = [[Paragraph('<b>Content Type</b>', meta_style), Paragraph('<b>Count</b>', meta_style)]]
        for content_type, count in sorted(by_content_type.items(), key=lambda x: -x[1]):
            data.append([content_type.title(), str(count)])
        
        t = Table(data, colWidths=[2 * inch, 1 * inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 0.25, colors.lightgrey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ]))
        flow.append(t)
        flow.append(Spacer(1, 12))
    
    # Emotion breakdown
    by_emotion = insights.get('byEmotion', {})
    if by_emotion:
        data = [[Paragraph('<b>Emotion</b>', meta_style), Paragraph('<b>Count</b>', meta_style)]]
        for emotion, count in sorted(by_emotion.items(), key=lambda x: -x[1]):
            data.append([emotion.title(), str(count)])
        
        t = Table(data, colWidths=[2 * inch, 1 * inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 0.25, colors.lightgrey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ]))
        flow.append(t)
        flow.append(Spacer(1, 12))
    
    # Top tags
    top_tags = insights.get('topTags', [])
    if top_tags:
        flow.append(Paragraph("<b>Top Tags:</b>", styles['Normal']))
        tags_text = ', '.join([f"{tag['tag']} ({tag['count']})" for tag in top_tags[:10]])
        flow.append(Paragraph(tags_text, styles['Normal']))
        flow.append(Spacer(1, 12))
    
    flow.append(PageBreak())
    
    # All memories section
    if items:
        flow.append(Paragraph(f"Your Memories ({len(items)} total)", h2_style))
        flow.append(Spacer(1, 12))
        
        for idx, item in enumerate(items, 1):
            # Item header
            created_at = format_time(item.get('createdAt'))
            title = item.get('title', 'Untitled')
            
            # Escape special characters for ReportLab
            title_escaped = title.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            
            flow.append(Paragraph(f"<b>{idx}. {title_escaped}</b>", styles['Heading3']))
            flow.append(Paragraph(f"Date: {created_at}", meta_style))
            
            # Metadata
            source = item.get('source', 'unknown')
            content_type = item.get('contentType', 'unknown')
            emotion = item.get('emotion', 'unknown')
            sentiment = item.get('sentimentScore', 0.0)
            
            flow.append(Paragraph(
                f"Source: {source} | Type: {content_type} | Emotion: <b>{emotion}</b> | Sentiment: {sentiment:.2f}",
                meta_style
            ))
            
            # URL if available
            url = item.get('url', '')
            if url:
                url_escaped = url.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                flow.append(Paragraph(f"URL: {url_escaped}", meta_style))
            
            flow.append(Spacer(1, 4))
            
            # Summary
            summary = item.get('summary', '').strip()
            if summary:
                summary_escaped = (
                    summary
                    .replace('&', '&amp;')
                    .replace('<', '&lt;')
                    .replace('>', '&gt;')
                    .replace('\n', '<br/>')
                )
                flow.append(Paragraph(f"<b>Summary:</b> {summary_escaped}", summary_style))
            else:
                flow.append(Paragraph("<i>(no summary)</i>", summary_style))
            
            # Keywords
            keywords = item.get('keywords', [])
            if keywords:
                keywords_text = ', '.join(keywords)
                flow.append(Paragraph(f"<b>Tags:</b> {keywords_text}", meta_style))
            
            flow.append(Spacer(1, 16))
            
            # Page break every 5 items
            if idx % 5 == 0 and idx < len(items):
                flow.append(PageBreak())
    else:
        flow.append(Paragraph("No memories found.", styles['Normal']))
    
    # Build the PDF
    doc.build(flow)
    
    # Get PDF content
    pdf_content = buffer.getvalue()
    buffer.close()
    
    return pdf_content
