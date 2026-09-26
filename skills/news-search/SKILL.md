---
name: news-search
description: "Search, read and compare recent news with the typesearch MCP tools (search_news, get_contents, find_similar). Use it when the user asks what happened, what the press reported, the latest on a company, person, market, country or topic, news from a date or a period, coverage from a country or in a language, or how different outlets covered a story; also to check claims against recent reporting."
---

# News search with typesearch

typesearch is a news index for agents: outlets worldwide, each article judged by a calibrated relevance model.
You have three read-only tools. Every result has a link: **cite the link of every fact you take from it.**
Results are headlines, standfirsts and short verbatim excerpts, never full articles.

## Which tool

| The user wants | Tool |
| --- | --- |
| News on a topic, "what happened", "latest on…" | `search_news` |
| What a specific article says (a link they gave you, or one from a search) | `get_contents` with `urls`, and `query` to get the passage about it |
| How other outlets covered a story, or who reported it first | `find_similar` with the article `url` |

## search_news, well

1. **Write the query as a topic, not a sentence.** "Chile lithium royalties", not "what is happening with
   lithium in Chile lately?". Any language works; use the one the coverage is likely in (a local story in
   Spanish is better searched in Spanish). Names, tickers and acronyms are fine.
2. **Set the time window from the question.** Compute exact dates from today's date before searching.
   - "today", "this week", "latest": `days: 1` to `7` (7 is the default).
   - A named period ("in March", "during the election"): `published_after` and `published_before`
     (`2026-03-01`, `2026-03-31`). A bare date includes that whole day.
   - Background or history: a larger `days` (up to 365).
3. **Narrow by place and language only when the question does.** `countries` takes ISO 3166-1 alpha-2
   codes (`["AR"]`, `["US", "GB"]`), `languages` ISO 639-1 (`["es"]`). The country is the outlet's, not the
   story's: "news about Argentina" is a query, "Argentine press on the IMF deal" is `countries: ["AR"]`.
4. **Domains:** `include_domains` when the user names outlets, `exclude_domains` to drop one.

### Modes: pick the cheapest that answers

| Mode | What it does | When |
| --- | --- | --- |
| `fast` (default) | Judges headlines and standfirsts. About a second. | Almost always: current events, quick checks, loops over many topics. |
| `ultra` | Headlines only. The cheapest, just as quick. | Many searches where the headline says it all (alerts, classification). |
| `normal` | Also opens and reads the best matches, and returns excerpts. Costs more, a few seconds. | When a wrong result is expensive, or you need the passage, not just the headline. |
| `deep` | Judges more headlines, also searches the topic in other words, reads more, with excerpts. Costs more, 10–15 seconds. | Research, reports, "find everything", or when `fast` came back thin. |

Start with `fast`. Escalate to `normal` or `deep` only when the answer needs it, and say so to the user when
you do. Each tool description states its current price.

### Reading the results

- `score` is the calibrated probability that the article is about the query: 0.9 is clearly on topic; between 0.35
  and 0.65 the model is undecided — treat those as leads, not facts.
- "No results", with the closest articles listed, means nothing matched: widen `days`, drop filters,
  rephrase with other words, or try `deep`. Don't present near misses as answers.
- "Incomplete" means the time budget ran out: the same search a minute later may bring more.
- "found beyond the index" marks articles read at the original site for this search: cite them the same way.
- Notes such as `country_not_indexed` or `domain_not_indexed` explain an empty filter: tell the user.

## Answering

- Lead with what happened, then the evidence: outlet, date and link for each fact.
- Prefer several outlets for contested or important claims; `find_similar` finds them.
- Quote only the excerpts the tools returned, verbatim and short. Never invent or reconstruct article text.
- Give dates in the user's terms ("yesterday, 25 September") and say when the coverage is thin.

## Errors

- `missing_api_key` / `invalid_api_key`: the typesearch key is not set or not valid — tell the user how to
  set it (the plugin or extension asks for it; keys at https://app.typesearch.ai/api-keys).
- `insufficient_credits` or `spend_limit_reached`: the account needs credit — tell the user, don't retry.
- `rate_limited`: wait the seconds it says, then retry once.
