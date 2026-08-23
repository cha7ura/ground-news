import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/bias - Get language bias analysis
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sourceId = searchParams.get('source_id');

    let query = supabase
      .from('language_bias')
      .select(`
        *,
        sources (
          id,
          name
        ),
        articles (
          id,
          title,
          url
        )
      `)
      .order('created_at', { ascending: false });

    if (sourceId) {
      query = query.eq('source_id', sourceId);
    }

    const { data, error } = await query.limit(100);

    if (error) throw error;

    // Aggregate bias statistics
    const stats = {
      totalBiasCases: data?.length || 0,
      bySource: {} as Record<string, number>,
      byType: {} as Record<string, number>,
    };

    data?.forEach((bias) => {
      const sourceName = (bias.sources as any)?.name || 'Unknown';
      stats.bySource[sourceName] = (stats.bySource[sourceName] || 0) + 1;
      stats.byType[bias.bias_type] = (stats.byType[bias.bias_type] || 0) + 1;
    });

    return NextResponse.json({
      biases: data || [],
      statistics: stats,
    });
  } catch (error: any) {
    console.error('Error fetching bias data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch bias data' },
      { status: 500 }
    );
  }
}

