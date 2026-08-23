import { NextRequest, NextResponse } from 'next/server';
import { fetchAllNews } from '@/lib/newsFetcher';

// POST /api/fetch-news - Manually trigger news fetching (admin)
export async function POST(request: NextRequest) {
  try {
    // In production, add authentication check here
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    const result = await fetchAllNews();

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error('Error fetching news:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch news' },
      { status: 500 }
    );
  }
}

// GET /api/fetch-news - Get fetch status (for cron jobs)
export async function GET() {
  try {
    // This endpoint can be called by Vercel Cron or similar
    const result = await fetchAllNews();

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error('Error fetching news:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch news' },
      { status: 500 }
    );
  }
}

