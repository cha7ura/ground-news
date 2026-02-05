// English analysis prompt template for Sri Lankan news articles.
// Used for English articles and as fallback for GPT-4o-mini (which handles all languages well).

export function buildEnglishPrompt(title: string, content: string): string {
  return `Analyze this Sri Lankan news article comprehensively. Respond with ONLY a JSON object.

Title: ${title}

Content:
${content.slice(0, 4000)}

Respond with ONLY a JSON object (no markdown, no code fences, no explanations):
{
  "summary": "2-sentence summary of the article",
  "topics": ["topic1", "topic2"],
  "bias_score": 0.0,
  "sentiment": "neutral",
  "bias_indicators": [],
  "is_original_reporting": true,
  "article_type": "news",
  "crime_type": null,
  "locations": [],
  "law_enforcement": [],
  "police_station": null,
  "political_party": null,
  "election_info": null,
  "key_people": [{"name": "Full Name", "role": "Title/Role"}],
  "key_quotes": [{"text": "Direct quote", "speaker": "Name"}],
  "casualties": null,
  "monetary_amounts": [],
  "entities": [
    {"name": "Ranil Wickremesinghe", "type": "person"},
    {"name": "Central Bank of Sri Lanka", "type": "organization"},
    {"name": "Colombo", "type": "location"},
    {"name": "inflation", "type": "topic"}
  ]
}

Rules:
- bias_score: -1.0 (far left/opposition) to 1.0 (far right/government). 0.0 = neutral
- sentiment: "positive", "negative", "neutral", or "mixed"
- topics: 2-5 keywords from: politics, economy, business, cricket, sports, tourism, education, health, crime, environment, technology, international, entertainment
- article_type: "news" (factual reporting), "opinion" (editorial/op-ed), "analysis" (expert commentary), "interview" (Q&A)
- is_original_reporting: true if original journalism, false if wire service or aggregated
- crime_type: one of drugs, shooting, murder, robbery, assault, kidnapping, fraud, corruption, smuggling, sexual-assault, arson, human-trafficking. null if not crime-related
- locations: specific Sri Lankan place names (cities, towns, districts)
- law_enforcement: organizations like Police, Sri Lanka Army, CID, STF, Navy, Air Force
- police_station: specific station name (e.g. "Colombo Fort Police") or null
- political_party: party name (SLPP, SJB, UNP, JVP/NPP, SLFP, NPP) or null
- election_info: if election-related, {"type": "presidential|parliamentary|provincial|local", "constituency": "area", "result": "winner|loser|null", "votes": "count or %"}. null otherwise
- key_people: up to 5 most prominent individuals. Use FULL canonical names (e.g. "Anura Kumara Dissanayake" not "AKD")
- key_quotes: up to 3 significant direct quotes from the article, with speaker name
- casualties: if deaths/injuries mentioned, {"deaths": N, "injuries": N, "description": "brief context"}. null otherwise
- monetary_amounts: financial figures, e.g. [{"amount": 500000, "currency": "LKR", "context": "seized cash"}]
- entities: ALL named entities (max 15). Use canonical full names. Types: person, organization, location, topic`;
}
