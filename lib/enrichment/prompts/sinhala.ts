// Sinhala analysis prompt template for Sri Lankan news articles.
// Instructions are in Sinhala so smaller/free LLMs can better understand
// Sinhala content. Field names remain in English for JSON compatibility.

export function buildSinhalaPrompt(title: string, content: string): string {
  return `මෙම ශ්‍රී ලංකා පුවත් ලිපිය විශ්ලේෂණය කරන්න. JSON ආකෘතියෙන් පමණක් පිළිතුරු දෙන්න.

ශීර්ෂය: ${title}

අන්තර්ගතය:
${content.slice(0, 4000)}

JSON වස්තුවක් පමණක් ලබා දෙන්න (markdown නැත, code fences නැත):
{
  "summary": "ලිපියේ වාක්‍ය 2ක සාරාංශයක්",
  "topics": ["politics", "economy"],
  "bias_score": 0.0,
  "sentiment": "neutral",
  "bias_indicators": [],
  "is_original_reporting": true,
  "article_type": "news",
  "crime_type": null,
  "locations": ["කොළඹ", "ගම්පහ"],
  "law_enforcement": [],
  "police_station": null,
  "political_party": null,
  "election_info": null,
  "key_people": [{"name": "සම්පූර්ණ නම", "role": "තනතුර"}],
  "key_quotes": [{"text": "සෘජු උපුටා දැක්වීම", "speaker": "නම"}],
  "casualties": null,
  "monetary_amounts": [],
  "entities": [
    {"name": "රනිල් වික්‍රමසිංහ", "type": "person"},
    {"name": "ශ්‍රී ලංකා මහ බැංකුව", "type": "organization"},
    {"name": "කොළඹ", "type": "location"},
    {"name": "උද්ධමනය", "type": "topic"}
  ]
}

නීති:
- bias_score: -1.0 (විපක්ෂ/වාමාංශික) සිට 1.0 (රජය/දක්ෂිණාංශික). 0.0 = මධ්‍යස්ථ
- sentiment: "positive" (ධනාත්මක), "negative" (සෘණාත්මක), "neutral" (මධ්‍යස්ථ), "mixed" (මිශ්‍ර)
- topics: මාතෘකා 2-5ක්: politics, economy, business, cricket, sports, tourism, education, health, crime, environment, technology, international, entertainment
- article_type: "news" (පුවත්), "opinion" (මතය/කතුවැකිය), "analysis" (විශ්ලේෂණය), "interview" (සම්මුඛ සාකච්ඡාව)
- is_original_reporting: මුල් පුවත්කරණයක් නම් true, වයර් සේවාවක් හෝ එකතු කළ දෙයක් නම් false
- crime_type: අපරාධ වර්ගය - drugs (මත්ද්‍රව්‍ය), shooting (වෙඩි තැබීම), murder (ඝාතනය), robbery (මංකොල්ලය), assault (පහරදීම), kidnapping (පැහැරගැනීම), fraud (වංචාව), corruption (දූෂණය), smuggling (කොල්ලකෑම), sexual-assault, arson (ගිනිතැබීම), human-trafficking (මිනිස් ජාවාරම). අපරාධ නොවේ නම් null
- locations: සඳහන් ශ්‍රී ලංකා ස්ථාන (නගර, දිස්ත්‍රික්)
- law_enforcement: සම්බන්ධ ආරක්ෂක බලකා (පොලිසිය, හමුදාව, CID, STF)
- police_station: විශේෂිත පොලිස් ස්ථානය හෝ null
- political_party: දේශපාලන පක්ෂය (SLPP, SJB, UNP, JVP/NPP, SLFP, NPP) හෝ null
- election_info: මැතිවරණ සම්බන්ධ නම් {"type": "presidential|parliamentary|provincial|local", "constituency": "ප්‍රදේශය", "result": "winner|loser|null", "votes": "ඡන්ද ගණන"}. එසේ නැත්නම් null
- key_people: ප්‍රධාන පුද්ගලයන් 5 දක්වා. සම්පූර්ණ නම් භාවිතා කරන්න
- key_quotes: වැදගත් සෘජු උපුටා දැක්වීම් 3 දක්වා, කථිකයාගේ නම සමඟ
- casualties: මරණ/තුවාල සඳහන් වේ නම් {"deaths": N, "injuries": N, "description": "කෙටි විස්තරය"}. එසේ නැත්නම් null
- monetary_amounts: මුදල් ප්‍රමාණ [{"amount": 500000, "currency": "LKR", "context": "අත්අඩංගුවට ගත් මුදල්"}]
- entities: සියලු නම් කළ වස්තු (උපරිම 15). person (පුද්ගල), organization (සංවිධාන), location (ස්ථාන), topic (මාතෘකා) වර්ග`;
}
