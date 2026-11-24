/* @bruin
name: marts.committee_votes
type: duckdb.sql
connection: duckdb-default
materialization:
  type: table
depends:
  - raw.interview_events
description: 'Hiring committee v2: initial vs revised interviewer votes, competency ratings, critical gaps, agreement, changes after deliberation, final committee recommendation and assessment coverage per session.'
columns:
  - name: session_id
    type: varchar
    checks:
      - name: not_null
      - name: unique
  - name: final_recommendation
    type: varchar
    checks:
      - name: not_null
      - name: accepted_values
        value: ['strong_hire', 'hire', 'no_hire', 'strong_no_hire']
  - name: agreement_initial
    type: boolean
  - name: n_changed_after_deliberation
    type: integer
    checks:
      - name: not_null
@bruin */

WITH ev AS (
    SELECT session_id, ts, agent, topic, score, text, TRY_CAST(text AS JSON) AS j
    FROM raw.interview_events
    WHERE type = 'decision' AND topic IN ('vote_initial', 'vote_revised', 'committee_final')
),
initial AS (
    SELECT session_id,
        max(j->>'recommendation') FILTER (WHERE agent = 'maya') AS maya_initial,
        max(j->>'recommendation') FILTER (WHERE agent = 'alex') AS alex_initial,
        max(CAST(j->'competencies' AS VARCHAR)) FILTER (WHERE agent = 'maya') AS maya_competencies,
        max(CAST(j->'competencies' AS VARCHAR)) FILTER (WHERE agent = 'alex') AS alex_competencies,
        string_agg(CAST(j->'critical_gaps' AS VARCHAR), ' | ') AS critical_gaps,
        bool_or(j->>'status' = 'insufficient_evidence') AS any_insufficient_evidence
    FROM ev WHERE topic = 'vote_initial' GROUP BY 1
),
revised AS (
    SELECT session_id,
        max(j->>'recommendation') FILTER (WHERE agent = 'maya') AS maya_revised,
        max(j->>'recommendation') FILTER (WHERE agent = 'alex') AS alex_revised,
        CAST(count(*) FILTER (WHERE (j->>'changed') = 'true') AS INTEGER) AS n_changed_after_deliberation
    FROM ev WHERE topic = 'vote_revised' GROUP BY 1
),
final AS (
    SELECT session_id, arg_max(j->>'recommendation', ts) AS final_recommendation,
        arg_max(CAST(j->'coverage'->>'answered_rounds' AS INTEGER), ts) AS answered_rounds,
        arg_max(CAST(j->'coverage'->>'asked_rounds' AS INTEGER), ts) AS asked_rounds,
        arg_max(CAST(j->'coverage'->>'competencies_rated' AS INTEGER), ts) AS competencies_rated,
        arg_max(CAST(j->'coverage'->>'competencies_total' AS INTEGER), ts) AS competencies_total,
        arg_max(j->>'status', ts) AS assessment_status
    FROM ev WHERE topic = 'committee_final' GROUP BY 1
)
SELECT f.session_id, i.maya_initial, i.alex_initial, r.maya_revised, r.alex_revised,
    i.maya_initial = i.alex_initial AS agreement_initial,
    r.maya_revised = r.alex_revised AS agreement_final,
    COALESCE(r.n_changed_after_deliberation, 0) AS n_changed_after_deliberation,
    i.maya_competencies, i.alex_competencies, i.critical_gaps, i.any_insufficient_evidence,
    f.final_recommendation, f.assessment_status,
    f.answered_rounds, f.asked_rounds,
    ROUND(f.competencies_rated * 1.0 / NULLIF(f.competencies_total, 0), 2) AS assessment_coverage
FROM final f
LEFT JOIN initial i USING (session_id)
LEFT JOIN revised r USING (session_id)
