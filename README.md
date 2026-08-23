# Sri Lanka News Aggregator

A Ground News-inspired news aggregation platform specifically designed for Sri Lankan news sources, with advanced language bias detection capabilities.

## Features

- **News Aggregation**: Collects news articles from multiple Sri Lankan news sources via RSS feeds
- **Language Detection**: Automatically detects the language of articles (English, Sinhala, Tamil) using OpenRouter LLM
- **Language Bias Detection**: Identifies when news sources report certain stories only in specific languages, potentially excluding speakers of other languages
- **Source Management**: Admin interface to add and manage news sources one by one
- **Filtering & Search**: Filter articles by source, language, category, and search by keywords
- **Bias Indicators**: Visual indicators for articles with detected language bias

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (serverless functions)
- **Database**: Supabase (PostgreSQL)
- **LLM**: OpenRouter API for language detection and bias analysis
- **RSS Parsing**: rss-parser library

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ installed
- A Supabase account and project
- An OpenRouter API key (get one at [openrouter.ai](https://openrouter.ai))

### 2. Clone and Install

```bash
cd gound-news
npm install
```

### 3. Environment Variables

Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_supabase_publishable_key
# Alternative: NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key (also supported)

# OpenRouter Configuration
OPENROUTER_API_KEY=your_openrouter_api_key

# App Configuration (optional)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Database Setup

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the SQL script from `supabase/schema.sql` to create all necessary tables and indexes

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Adding News Sources

1. Navigate to `/admin/sources`
2. Click "Add New Source"
3. Fill in the source details:
   - **Name**: The name of the news source
   - **RSS Feed URL**: The RSS feed URL for the source
   - **Website URL**: The main website URL
   - **Supported Languages**: Select which languages this source supports (English, Sinhala, Tamil)
   - **Category**: Optional category for the source

### Fetching News

News can be fetched manually or automatically:

- **Manual**: Make a POST request to `/api/fetch-news` (or GET for cron jobs)
- **Automatic**: Set up a cron job (e.g., using Vercel Cron) to call `/api/fetch-news` every 15-30 minutes

### Viewing Articles

- Browse articles on the home page (`/`)
- Filter by source, language, category, or search keywords
- Click on any article to view full details
- Articles with detected language bias will show a "Bias" badge

## Project Structure

```
/
├── app/
│   ├── page.tsx                    # Home page with news feed
│   ├── article/[id]/page.tsx       # Article detail page
│   ├── admin/sources/page.tsx      # Source management page
│   └── api/                        # API routes
│       ├── articles/               # Article endpoints
│       ├── sources/                # Source management endpoints
│       ├── bias/                   # Bias analysis endpoint
│       └── fetch-news/             # News fetching endpoint
├── components/
│   ├── ArticleCard.tsx            # Article card component
│   ├── ArticleList.tsx             # Article list component
│   ├── Header.tsx                  # Navigation header
│   ├── LanguageBiasBadge.tsx      # Bias indicator component
│   └── SourceForm.tsx             # Source form component
├── lib/
│   ├── supabase.ts                # Supabase client configuration
│   ├── openrouter.ts              # OpenRouter LLM integration
│   ├── rssParser.ts               # RSS feed parsing
│   └── newsFetcher.ts             # News fetching service
└── supabase/
    └── schema.sql                  # Database schema
```

## API Endpoints

### Articles
- `GET /api/articles` - List articles with pagination and filtering
- `GET /api/articles/[id]` - Get single article with bias info

### Sources
- `GET /api/sources` - List all sources
- `POST /api/sources` - Create a new source
- `PUT /api/sources/[id]` - Update a source
- `DELETE /api/sources/[id]` - Delete a source

### Bias Analysis
- `GET /api/bias` - Get language bias analysis and statistics

### News Fetching
- `GET /api/fetch-news` - Trigger news fetching (for cron jobs)
- `POST /api/fetch-news` - Manually trigger news fetching

## Language Bias Detection

The platform uses OpenRouter LLM to analyze news articles and detect potential language-based reporting bias. A source is flagged for bias if:

1. It supports multiple languages (e.g., English, Sinhala, Tamil)
2. It publishes an important news story in only one language
3. The LLM determines this represents potential exclusion of speakers of other languages

Bias detection results include:
- Bias type (language_exclusion, selective_reporting)
- Detected language
- Missing languages
- Confidence score
- Reasoning

## Future Enhancements

- Story clustering: Group related articles about the same event
- Multi-perspective view: Show how different sources cover the same story
- User accounts: Personalization, saved articles, custom feeds
- Enhanced bias analysis: Political bias, fact-checking integration
- Mobile app: React Native mobile application

## License

MIT
