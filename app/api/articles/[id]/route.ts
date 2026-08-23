import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/articles/[id] - Get single article with bias info
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data: article, error: articleError } = await supabase
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
      .eq('id', params.id)
      .single();

    if (articleError) throw articleError;

    if (!article) {
      return NextResponse.json(
        { error: 'Article not found' },
        { status: 404 }
      );
    }

    // Get bias information if exists
    let biasInfo = null;
    if (article.has_language_bias) {
      const { data: bias } = await supabase
        .from('language_bias')
        .select('*')
        .eq('article_id', params.id)
        .single();

      biasInfo = bias;
    }

    return NextResponse.json({
      article,
      bias: biasInfo,
    });
  } catch (error: any) {
    console.error('Error fetching article:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch article' },
      { status: 500 }
    );
  }
}

