"""Read-only board summary queries.

The board snapshot needs one latest run and a few counts per card. Keep full
history in card_detail(); loading it every polling cycle scales with all past
runs and comments, even when the browser receives only a revision token.
"""


def summarize_cards(con, cards, issue_for, run_summary):
    latest = {row["card_id"]: dict(row) for row in con.execute("""
        SELECT r.id,r.card_id,r.status,r.started_at,r.ended_at,r.retry_count,
               r.retry_wait,r.activity,r.model,r.thinking,r.thread_id,r.executor,
               r.comment_through_id,r.error,substr(r.output,1,300) AS output
        FROM runs r
        JOIN (SELECT card_id,max(id) AS id FROM runs GROUP BY card_id) last
          ON last.id=r.id
    """)}
    run_counts = {row["card_id"]: row["n"] for row in con.execute(
        "SELECT card_id,count(*) AS n FROM runs GROUP BY card_id")}
    comment_counts = {row["card_id"]: row["n"] for row in con.execute(
        "SELECT card_id,count(*) AS n FROM comments GROUP BY card_id")}
    pending_counts = {row["card_id"]: row["n"] for row in con.execute("""
        SELECT c.card_id,count(*) AS n
        FROM comments c
        LEFT JOIN (
          SELECT r.card_id,r.comment_through_id,r.started_at
          FROM runs r
          JOIN (SELECT card_id,max(id) AS id FROM runs WHERE status='completed'
                GROUP BY card_id) last ON last.id=r.id
        ) completed ON completed.card_id=c.card_id
        WHERE completed.card_id IS NULL
           OR (completed.comment_through_id IS NOT NULL AND c.id>completed.comment_through_id)
           OR (completed.comment_through_id IS NULL AND c.created_at>=completed.started_at)
        GROUP BY c.card_id
    """)}
    for card in cards:
        card_id = card["id"]
        run = latest.get(card_id)
        card["issue"] = issue_for(card, run)
        card["pendingFeedbackCount"] = pending_counts.get(card_id, 0) if card["status"] == "review" else 0
        card["commentCount"] = comment_counts.get(card_id, 0)
        card["runCount"] = run_counts.get(card_id, 0)
        card["latestRun"] = run_summary(run)
    return cards
