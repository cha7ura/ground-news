import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Support both variable names for compatibility
const supabaseAnonKey = 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
}

// Client for client-side operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client for API routes (uses same anon key)
// For server-side operations, create a new client instance
export function createServerClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
  });
}

// For backward compatibility, export supabaseAdmin as server client
export const supabaseAdmin = createServerClient();

// Database types
export interface Source {
  id: string;
  name: string;
  rss_url: string;
  website_url: string;
  supported_languages: string[]; // ['en', 'si', 'ta']
  category: string;
  created_at: string;
  updated_at: string;
}

export interface Article {
  id: string;
  source_id: string;
  title: string;
  description: string | null;
  url: string;
  published_at: string;
  author: string | null;
  language: string; // 'en', 'si', 'ta'
  category: string | null;
  content: string | null;
  image_url: string | null;
  has_language_bias: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface LanguageBias {
  id: string;
  source_id: string;
  article_id: string;
  bias_type: string; // 'language_exclusion', 'selective_reporting'
  detected_language: string;
  missing_languages: string[];
  confidence_score: number;
  created_at: string;
}

