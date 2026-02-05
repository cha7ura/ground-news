# Ada Derana — Source Write-Up

## Source Overview

| Field | English | Sinhala |
| --- | --- | --- |
| **Name** | Ada Derana | අද දෙරණ |
| **Slug** | `ada-derana-en` | `ada-derana-si` |
| **URL** | https://www.adaderana.lk | https://sinhala.adaderana.lk |
| **RSS** | https://www.adaderana.lk/rss.php | https://sinhala.adaderana.lk/rss.php (**BROKEN**) |
| **Bias Score** | 0.1 (center, slightly government-leaning) | 0.1 |
| **Factuality** | 65/100 | 65/100 |
| **Language** | English | Sinhala |
| **Original Reporter** | Yes | Yes |
| **Archive Depth** | 2006–present | 2006–present |

Ada Derana is one of Sri Lanka's most popular news portals, operated by Derana TV (TV Derana, part of the Telshan Network). It publishes high-volume breaking news coverage in both English and Sinhala.

---

## RSS Feed Analysis

### English (`https://www.adaderana.lk/rss.php`)

**Status: Working**

| Field | Available | Example |
| --- | --- | --- |
| `<title>` | Yes | `India shares spirit of celebration...` |
| `<link>` | Yes | `http://www.adaderana.lk/news.php?nid=118022` |
| `<guid>` | Yes | Same as link |
| `<pubDate>` | Yes | `Wed, 04 Feb 2026 14:39:25 +0530` |
| `<description>` | Yes | CDATA with embedded `<img>` + teaser text ending in "MORE.." |
| `<author>` / `<dc:creator>` | **No** | — |
| `<category>` | **No** | — |
| `<content:encoded>` | **No** | — |
| `<media:*>` | **No** | — |

- Feed returns 20 items
- Encoding: UTF-8
- Image URLs embedded in `<description>` CDATA: `<img src='https://adaderanaenglish.s3.amazonaws.com/...' />`
- Description is a teaser only (first ~100 characters + "MORE..")

### Sinhala (`https://sinhala.adaderana.lk/rss.php`)

**Status: BROKEN** — Returns PHP fatal error:
```
Fatal error: Uncaught Error: Call to a member function query() on null
in /var/www/derana/html/rss.php:15
```

This is a server-side database connection failure. The Sinhala RSS feed has been non-functional as of February 2026. The pipeline falls back to listing-page scraping for this source.

---

## Article Page Analysis

### Metadata Availability

| Meta Tag | English | Sinhala |
| --- | --- | --- |
| `og:title` | **No** | **No** |
| `og:description` | **No** | **No** |
| `og:image` | **No** | **No** |
| `article:published_time` | **No** | **No** |
| `article:author` | **No** | **No** |
| JSON-LD / Schema.org | **No** | **No** |
| `<meta name="author">` | **No** | **No** |
| `<meta name="description">` | **No** | **No** |

Ada Derana has **zero SEO meta tags** on article pages. This is unusual for a major news site. Firecrawl's metadata extraction returns empty for all standard fields.

### What IS Available on the Page

| Data | Extraction Method | Format |
| --- | --- | --- |
| **Title** | `<h1>` or Firecrawl title | Plain text |
| **Date** | Plain text in page body | `February 4, 2026   02:39 pm` (English) |
| **Content** | Firecrawl markdown | Full article paragraphs |
| **Image** | RSS `<description>` or page `<img>` | S3 URL |
| **Author** | **Not available anywhere** | Ada Derana does not attribute individual reporters |

### URL Patterns

| Type | English | Sinhala |
| --- | --- | --- |
| **RSS link** | `http://www.adaderana.lk/news.php?nid=118022` | N/A (RSS broken) |
| **Canonical** | `https://www.adaderana.lk/news/118022/slug-here` | `https://sinhala.adaderana.lk/news/208756` |
| **Hot News listing** | `https://www.adaderana.lk/hot-news/?pageno=1` | `https://sinhala.adaderana.lk/hot-news/` |
| **Archive** | `https://www.adaderana.lk/news_archive.php` | `https://sinhala.adaderana.lk/news_archive.php` |

Note: The RSS link format (`news.php?nid=`) differs from the canonical format (`/news/ID/slug`). Both resolve to the same article, but deduplication must account for both variants.

---

## Pipeline Field Extraction

### What the pipeline captures for Ada Derana:

| DB Column | Source | Quality |
| --- | --- | --- |
| `url` | RSS `<link>` or listing page scrape | Good — unique per article |
| `title` | RSS `<title>` or Firecrawl page title | Good |
| `content` | Firecrawl markdown | Good — full article text |
| `excerpt` | First paragraph from content (preferred) or RSS description teaser | Good after fix (was poor — RSS teaser had "MORE..") |
| `image_url` | RSS `<description>` embedded `<img src>` | Good for English, null for Sinhala |
| `published_at` | RSS `pubDate` (English) or page text extraction (both) | Good after fix (was null when Firecrawl metadata empty) |
| `author` | **Always null** | N/A — Ada Derana doesn't attribute reporters |
| `language` | Source config (`en` / `si`) | Good |

### Pipeline fixes applied:

1. **Date extraction from page text**: Added `extractDateFromText()` in `pipeline.ts` that parses "Month DD, YYYY HH:MM am/pm" from the scraped markdown. This catches dates when Firecrawl metadata is empty (Ada Derana's case).

2. **Listing-page fallback for broken RSS**: When RSS returns an error or empty feed (Ada Derana Sinhala), the pipeline now scrapes the source's hot-news listing page to discover article URLs.

3. **Excerpt from content**: Instead of using the RSS description teaser ("...MORE.."), the pipeline now extracts the first meaningful paragraph from the scraped markdown.

---

## Backfill Strategy

### English (`ada-derana-en`)

- **Primary**: RSS feed provides latest 20 articles
- **Backfill**: Paginated hot-news pages (`?pageno=1` to `?pageno=40+`)
- **Deep backfill**: Article IDs are sequential (`nid=118022` descending). The archive page (`news_archive.php`) supports date/category filtering.
- **Estimated volume**: ~20 articles/day × 365 days = ~7,300 articles/year

### Sinhala (`ada-derana-si`)

- **Primary**: Listing-page scrape (RSS is broken)
- **Backfill**: Same pagination pattern as English
- **URL pattern**: `/news/NNNNNN` with sequential IDs
- **Archive**: `news_archive.php` with date filtering (form-based, requires POST)

### Running the backfill:

```bash
# Backfill English (5 listing pages, up to 200 articles)
npx tsx scripts/backfill-adaderana.ts --source ada-derana-en --pages 5

# Backfill Sinhala (5 listing pages, up to 200 articles)
npx tsx scripts/backfill-adaderana.ts --source ada-derana-si --pages 5

# Backfill both with more pages
npx tsx scripts/backfill-adaderana.ts --pages 20 --limit 500

# Then enrich the backfilled articles
npx tsx scripts/pipeline.ts --enrich --limit 50
```

---

## Known Limitations

1. **No author data**: Ada Derana does not credit individual journalists. The `author` field will always be null for this source.

2. **No og: tags**: Firecrawl metadata extraction yields nothing. All metadata must come from RSS or page content parsing.

3. **Sinhala RSS broken**: Server-side error (`query() on null`). May be fixed by Ada Derana in future, but until then we rely on listing-page scraping.

4. **Duplicate URL formats**: RSS returns `news.php?nid=X` but the canonical URL is `/news/X/slug`. The pipeline stores whichever URL it encounters first, but backfill scripts should normalize.

5. **Image URLs for Sinhala**: When ingested via listing-page scrape (not RSS), image URLs are not extracted. The enrichment pipeline doesn't backfill images.

6. **Archive form is POST-based**: The `news_archive.php` date/category filter uses form POST submission, making it harder to crawl programmatically than simple pagination. The backfill script uses hot-news pagination instead.
