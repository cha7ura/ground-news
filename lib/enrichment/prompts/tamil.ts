// Tamil analysis prompt template for Sri Lankan news articles.
// Instructions are in Tamil so smaller/free LLMs can better understand
// Tamil content. Field names remain in English for JSON compatibility.

export function buildTamilPrompt(title: string, content: string): string {
  return `இந்த இலங்கை செய்தி கட்டுரையை முழுமையாக பகுப்பாய்வு செய்யவும். JSON வடிவத்தில் மட்டும் பதிலளிக்கவும்.

தலைப்பு: ${title}

உள்ளடக்கம்:
${content.slice(0, 4000)}

JSON பொருளை மட்டும் வழங்கவும் (markdown இல்லை, code fences இல்லை):
{
  "summary": "கட்டுரையின் 2 வாக்கிய சுருக்கம்",
  "topics": ["politics", "economy"],
  "bias_score": 0.0,
  "sentiment": "neutral",
  "bias_indicators": [],
  "is_original_reporting": true,
  "article_type": "news",
  "crime_type": null,
  "locations": ["கொழும்பு", "கம்பஹா"],
  "law_enforcement": [],
  "police_station": null,
  "political_party": null,
  "election_info": null,
  "key_people": [{"name": "முழு பெயர்", "role": "பதவி"}],
  "key_quotes": [{"text": "நேரடி மேற்கோள்", "speaker": "பெயர்"}],
  "casualties": null,
  "monetary_amounts": [],
  "entities": [
    {"name": "ரணில் விக்கிரமசிங்க", "type": "person"},
    {"name": "இலங்கை மத்திய வங்கி", "type": "organization"},
    {"name": "கொழும்பு", "type": "location"},
    {"name": "பணவீக்கம்", "type": "topic"}
  ]
}

விதிகள்:
- bias_score: -1.0 (எதிர்க்கட்சி) முதல் 1.0 (அரசாங்கம்). 0.0 = நடுநிலை
- sentiment: "positive", "negative", "neutral", "mixed"
- topics: 2-5 தலைப்புகள்: politics, economy, business, cricket, sports, tourism, education, health, crime, environment, technology, international, entertainment
- article_type: "news" (செய்தி), "opinion" (கருத்து), "analysis" (பகுப்பாய்வு), "interview" (நேர்காணல்)
- is_original_reporting: அசல் பத்திரிகை true, ஒருங்கிணைந்தது false
- crime_type: குற்ற வகை - drugs, shooting, murder, robbery, assault, kidnapping, fraud, corruption, smuggling, sexual-assault, arson, human-trafficking. குற்றம் இல்லை எனில் null
- locations: குறிப்பிட்ட இலங்கை இடங்கள் (நகரங்கள், மாவட்டங்கள்)
- law_enforcement: தொடர்புடைய பாதுகாப்பு படையினர் (Police, Army, CID, STF)
- police_station: குறிப்பிட்ட காவல் நிலையம் அல்லது null
- political_party: அரசியல் கட்சி (SLPP, SJB, UNP, JVP/NPP, SLFP, NPP) அல்லது null
- election_info: தேர்தல் தொடர்பானது எனில் {"type": "presidential|parliamentary|provincial|local", "constituency": "பகுதி", "result": "winner|loser|null", "votes": "எண்ணிக்கை"}. இல்லையெனில் null
- key_people: முக்கிய நபர்கள் 5 வரை. முழு பெயர்களை பயன்படுத்தவும்
- key_quotes: 3 முக்கிய நேரடி மேற்கோள்கள், பேச்சாளர் பெயருடன்
- casualties: இறப்புகள்/காயங்கள் குறிப்பிடப்பட்டால் {"deaths": N, "injuries": N, "description": "சுருக்கம்"}. இல்லையெனில் null
- monetary_amounts: நிதி எண்கள் [{"amount": 500000, "currency": "LKR", "context": "கைப்பற்றிய பணம்"}]
- entities: அனைத்து பெயரிடப்பட்ட நிறுவனங்கள் (அதிகபட்சம் 15). person, organization, location, topic வகைகள்`;
}
