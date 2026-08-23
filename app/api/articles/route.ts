import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/articles - List articles with pagination and filtering
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const sourceId = searchParams.get('source_id');
    const category = searchParams.get('category');
    const language = searchParams.get('language');
    const hasBias = searchParams.get('has_bias');
    const search = searchParams.get('search');

    let query = supabase
      .from('articles')
      .select(`
        *,
        sources (
          id,
          name,
          website_url,
          supported_languages
        )
      `)
      .order('published_at', { ascending: false });

    // Apply filters
    if (sourceId) {
      query = query.eq('source_id', sourceId);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (language) {
      query = query.eq('language', language);
    }
    if (hasBias === 'true') {
      query = query.eq('has_language_bias', true);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    // Get total count for pagination
    let countQuery = supabase.from('articles').select('*', { count: 'exact', head: true });
    if (sourceId) countQuery = countQuery.eq('source_id', sourceId);
    if (category) countQuery = countQuery.eq('category', category);
    if (language) countQuery = countQuery.eq('language', language);
    if (hasBias === 'true') countQuery = countQuery.eq('has_language_bias', true);
    if (search) countQuery = countQuery.or(`title.ilike.%${search}%,description.ilike.%${search}%`);

    const { count: totalCount } = await countQuery;

    return NextResponse.json({
      articles: data || [],
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching articles:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch articles' },
      { status: 500 }
    );
  }
}

