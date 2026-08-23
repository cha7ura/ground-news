import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, Source } from '@/lib/supabase';

// GET /api/sources - List all sources
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('sources')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ sources: data || [] });
  } catch (error: any) {
    console.error('Error fetching sources:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sources' },
      { status: 500 }
    );
  }
}

// POST /api/sources - Create a new source
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, rss_url, website_url, supported_languages, category } = body;

    if (!name || !rss_url || !website_url) {
      return NextResponse.json(
        { error: 'Missing required fields: name, rss_url, website_url' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('sources')
      .insert({
        name,
        rss_url,
        website_url,
        supported_languages: supported_languages || ['en'],
        category: category || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ source: data }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating source:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create source' },
      { status: 500 }
    );
  }
}

