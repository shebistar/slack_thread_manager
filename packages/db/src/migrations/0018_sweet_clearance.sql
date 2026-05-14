UPDATE "classified_topics" AS ct
SET "search_vector" = to_tsvector(
  'english',
  concat_ws(
    ' ',
    sq."anonymized_content"->'technicalSummary'->>'headline',
    sq."anonymized_content"->'technicalSummary'->>'body',
    (
      SELECT string_agg(value, ' ')
      FROM jsonb_array_elements_text(coalesce(sq."anonymized_content"->'technicalSummary'->'key_decisions', '[]'::jsonb))
    ),
    (
      SELECT string_agg(value, ' ')
      FROM jsonb_array_elements_text(coalesce(sq."anonymized_content"->'technicalSummary'->'action_items', '[]'::jsonb))
    ),
    sq."anonymized_content"->'plainSummary'->>'headline',
    sq."anonymized_content"->'plainSummary'->>'body',
    (
      SELECT string_agg(value, ' ')
      FROM jsonb_array_elements_text(coalesce(sq."anonymized_content"->'plainSummary'->'key_decisions', '[]'::jsonb))
    ),
    (
      SELECT string_agg(value, ' ')
      FROM jsonb_array_elements_text(coalesce(sq."anonymized_content"->'plainSummary'->'action_items', '[]'::jsonb))
    )
  )
)
FROM "staging_queue" AS sq
JOIN "slack_threads" AS st
  ON st."id" = sq."thread_id"
WHERE ct."thread_id" = sq."thread_id"
  AND sq."status" = 'approved'
  AND st."pipeline_state" = 'approved'
  AND ct."search_vector" IS NULL;
