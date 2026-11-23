# Telem API call evidence

Recorded at: 2026-11-23 12:17:25 PST (America/Los_Angeles)

## Docs used (not guessed)

Telem is the Multiplayer AI Hackathon sponsor for live-web search and clean page fetch
(https://telem.ai/, described on the Eventbrite page and https://crewbasecollective.com/aim-hack-visual
as “search the live web with Telem AI”). Official API docs:

- https://docs.telem.ai/
- https://docs.telem.ai/api/ — base URL `https://router.telem.ai`
- https://docs.telem.ai/authentication/ — `Authorization: Bearer $TELEM_API_KEY`
- https://docs.telem.ai/quickstart/
- https://docs.telem.ai/api/operations/create_search_v1_search_post/

Telem has no dedicated “job description” or “company interview context” endpoint.
The documented way to retrieve that context is **search**:

`POST https://router.telem.ai/v1/search`

with a company + role query. Results include `title`, `url`, and `summary` (used as the snippet).
`POST /v1/fetch` can later read a specific page by URL; it was not required for this first call.

## Exact curl (key not inlined)

```bash
curl -sS -X POST https://router.telem.ai/v1/search \
  -H "Authorization: Bearer $TELEM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": {"query": "Stripe Product Data Scientist job description interview process role requirements"},
    "search": {"providers": {"include": ["exa", "brave"]}, "num_results": 5, "tier": "default"}
  }'
```

The `providers.include` list follows the official quickstart (`exa` + `brave`).

## Result

- HTTP status: **200**
- Telem `status`: `succeeded`
- Providers: exa (5 results), brave (5 results)
- Raw results: 10
- Unique sources (by URL): 8
- Redacted response: `telem_call_20261123_121725.json`

Example sources:

1. Stripe Careers | Data Scientist — https://stripe.com/careers/listing/data-scientist/5601879
2. Stripe Data Scientist Interview: Process & Questions — https://www.datainterview.com/blog/stripe-data-scientist-interview
