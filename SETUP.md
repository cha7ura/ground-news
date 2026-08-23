# Quick Setup Guide

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings → API
3. Copy your Project URL and anon key
4. Go to Project Settings → API → Service Role (keep this secret!)
5. Copy your service role key

## Step 3: Set Up Database

1. In Supabase dashboard, go to SQL Editor
2. Copy and paste the contents of `supabase/schema.sql`
3. Run the SQL script
4. Verify tables are created: `sources`, `articles`, `categories`, `language_bias`

## Step 4: Get OpenRouter API Key

1. Sign up at [openrouter.ai](https://openrouter.ai)
2. Go to Keys section
3. Create a new API key
4. Copy the key

## Step 5: Configure Environment Variables

Create `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-publishable-key
OPENROUTER_API_KEY=your-openrouter-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Step 6: Run the App

```bash
npm run dev
```

Visit http://localhost:3000

## Step 7: Add Your First News Source

1. Go to http://localhost:3000/admin/sources
2. Click "Add New Source"
3. Fill in the form:
   - Name: e.g., "Daily News"
   - RSS URL: e.g., "https://www.dailynews.lk/rss.xml"
   - Website URL: e.g., "https://www.dailynews.lk"
   - Supported Languages: Select English, Sinhala, Tamil as applicable
   - Category: Optional

## Step 8: Fetch News

Manually trigger news fetching:

```bash
curl http://localhost:3000/api/fetch-news
```

Or set up automatic fetching using Vercel Cron (see `vercel.json`).

## Troubleshooting

### "Missing Supabase environment variables"
- Make sure `.env.local` exists and has all required variables
- Restart the dev server after adding environment variables

### "OpenRouter API error"
- Check your API key is correct
- Ensure you have credits/balance in your OpenRouter account

### "Failed to fetch sources"
- Verify Supabase connection
- Check that tables were created successfully
- Ensure service role key is correct

### RSS Feed Errors
- Verify RSS URLs are correct and accessible
- Some feeds may require specific headers or authentication

