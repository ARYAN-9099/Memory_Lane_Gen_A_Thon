#!/usr/bin/env python
"""
Create a beautiful PDF of user summaries stored in a SQLite database.

Usage examples:
    python summarize-pdf.py --db memory_lane.db --user 1 --out summaries_user1.pdf

Features:
- Reads rows from table `items` with columns: id, user_id, created_at, emotion, summary (matches existing project conventions)
- Optional --from / --to filtering on created_at (ISO or substring matched)
- Optional --limit to limit number of rows
- Produces a simple styled PDF using ReportLab
"""
import sqlite3
import argparse
import os
import sys
from datetime import datetime

try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.lib.units import inch
    reportlab = True
except Exception:
    # mark unavailable; code checks this flag before using reportlab-specific code
    reportlab = False


# Change these two variables to set the default database path and user id used when
# running the script without command-line arguments.
DEFAULT_DB_PATH = 'memory_lane.db'
DEFAULT_USER_ID = 1


def parse_args():
    p = argparse.ArgumentParser(description='Export user summaries to a styled PDF')
    p.add_argument('--db', default=DEFAULT_DB_PATH, help='Path to sqlite DB file')
    p.add_argument('--user', '--user-id', dest='user', type=int, default=DEFAULT_USER_ID, help=f'User id to export (default: {DEFAULT_USER_ID})')
    p.add_argument('--out', default=None, help='Output PDF path (defaults to summaries_user_{id}.pdf)')
    p.add_argument('--from', dest='from_time', default=None, help='Start time (inclusive) to filter created_at')
    p.add_argument('--to', dest='to_time', default=None, help='End time (inclusive) to filter created_at')
    p.add_argument('--limit', type=int, default=None, help='Limit number of rows')
    return p.parse_args()


def open_db(db_path):
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"DB not found: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def load_summaries(conn, user_id, from_time=None, to_time=None, limit=None):
    # Build query
    q = "SELECT id, created_at, emotion, summary FROM items WHERE user_id = ?"
    params = [user_id]
    if from_time:
        q += " AND created_at >= ?"
        params.append(from_time)
    if to_time:
        q += " AND created_at <= ?"
        params.append(to_time)
    q += " ORDER BY created_at"
    if limit:
        q += " LIMIT ?"
        params.append(limit)
    cur = conn.execute(q, tuple(params))
    rows = cur.fetchall()
    return rows


def format_time(ts):
    if not ts:
        return ''
    # accept already-formatted timestamps or epoch
    try:
        # if numeric epoch
        if str(ts).isdigit():
            return datetime.fromtimestamp(int(ts)).isoformat()
    except Exception:
        pass
    # try to parse common formats, fallback to raw
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(ts, fmt).isoformat()
        except Exception:
            continue
    return str(ts)


def build_pdf(out_path, user_id, rows, page_size=A4):
    # reportlab is a boolean flag set at import time
    if not reportlab:
        raise RuntimeError('reportlab is required to build PDF. Install with: pip install reportlab')

    doc = SimpleDocTemplate(out_path, pagesize=page_size,
                            rightMargin=36, leftMargin=36,
                            topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    # Custom styles
    title_style = ParagraphStyle('Title', parent=styles['Title'], alignment=TA_CENTER, fontSize=20, spaceAfter=12)
    h2 = ParagraphStyle('Heading2', parent=styles['Heading2'], alignment=TA_LEFT, fontSize=14, spaceAfter=8)
    meta_style = ParagraphStyle('Meta', parent=styles['Normal'], fontSize=9, textColor=colors.grey)
    summary_style = ParagraphStyle('Summary', parent=styles['BodyText'], fontSize=11, leading=14)

    flow = []
    flow.append(Paragraph(f"User {user_id} — Event Summaries", title_style))
    flow.append(Paragraph(f"Exported: {datetime.now().isoformat()}", meta_style))
    flow.append(Spacer(1, 12))

    if not rows:
        flow.append(Paragraph('No summaries found for this user / filters', styles['Normal']))
        doc.build(flow)
        return

    # Emotion summary table
    emotions = {}
    for r in rows:
        e = (r['emotion'] or 'unknown').lower()
        emotions[e] = emotions.get(e, 0) + 1

    # Emotions table
    data = [[Paragraph('<b>Emotion</b>', meta_style), Paragraph('<b>Count</b>', meta_style)]]
    for k, v in sorted(emotions.items(), key=lambda x: -x[1]):
        data.append([k, str(v)])
    t = Table(data, colWidths=[2 * inch, 1 * inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.whitesmoke),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    flow.append(t)
    flow.append(Spacer(1, 12))

    # Now add each summary as a card
    for idx, r in enumerate(rows, 1):
        ts = format_time(r['created_at'])
        emotion = r['emotion'] or 'unknown'
        summary = (r['summary'] or '').strip().replace('\n', '<br/>')

        flow.append(Paragraph(f"{idx}. {ts}", meta_style))
        flow.append(Paragraph(f"Emotion: <b>{emotion}</b>", meta_style))
        flow.append(Paragraph(summary or '<i>(no text)</i>', summary_style))
        flow.append(Spacer(1, 12))
        # page break if long
        if idx % 20 == 0:
            flow.append(PageBreak())

    doc.build(flow)


def main():
    args = parse_args()

    if not args.out:
        args.out = f"summaries_user_{args.user}.pdf"

    try:
        conn = open_db(args.db)
    except FileNotFoundError as e:
        print(e)
        sys.exit(2)

    rows = load_summaries(conn, args.user, from_time=args.from_time, to_time=args.to_time, limit=args.limit)
    print(f"Found {len(rows)} summaries for user {args.user}")

    try:
        build_pdf(args.out, args.user, rows)
    except Exception as e:
        print(f"Failed to build PDF: {e}")
        sys.exit(1)

    print(f"Wrote: {args.out}")


if __name__ == '__main__':
    main()
