import { NextRequest, NextResponse } from 'next/server';
import { getLatestArticles } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = parseInt(searchParams.get('limit') || '12', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const articles = await getLatestArticles(limit, offset);
  return NextResponse.json({ articles });
}
