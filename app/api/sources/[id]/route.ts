import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// PUT /api/sources/[id] - Update a source
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name, rss_url, website_url, supported_languages, category } = body;

    const { data, error } = await supabaseAdmin
      .from('sources')
      .update({
        ...(name && { name }),
        ...(rss_url && { rss_url }),
        ...(website_url && { website_url }),
        ...(supported_languages && { supported_languages }),
        ...(category !== undefined && { category }),
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ source: data });
  } catch (error: any) {
    console.error('Error updating source:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update source' },
      { status: 500 }
    );
  }
}

// DELETE /api/sources/[id] - Delete a source
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error } = await supabaseAdmin
      .from('sources')
      .delete()
      .eq('id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting source:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete source' },
      { status: 500 }
    );
  }
}

