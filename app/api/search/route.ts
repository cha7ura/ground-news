import { NextRequest, NextResponse } from 'next/server';
import { searchArticles, searchStories } from '@/lib/meilisearch';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get('q') || '';
  const type = searchParams.get('type') || 'articles';
  const topic = searchParams.get('topic') || undefined;
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  try {
    if (type === 'stories') {
      const results = await searchStories(query, { topic, limit, offset });
      return NextResponse.json(results);
    }

    const results = await searchArticles(query, {
      topics: topic ? [topic] : undefined,
      limit,
      offset,
    });
    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json(
      { error: 'Search service unavailable' },
      { status: 503 }
    );
  }
}
