// Entity handler — creates/upserts tags, resolves aliases, links tags to articles,
// and enriches location tags with coordinates from sri_lanka_locations.

import { createClient } from '@supabase/supabase-js';
import { resolveAlias } from './aliases';
import type {
  AnalysisResult,
  TagAssignment,
  ResolvedEntity,
  EntityType,
} from './types';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export class EntityHandler {
  private supabase: ReturnType<typeof createClient>;
  // Cache location lookups for the current pipeline run
  private locationCache = new Map<string, {
    latitude?: number;
    longitude?: number;
    district?: string;
    province?: string;
    name_si?: string;
  } | null>();

  constructor(supabase: ReturnType<typeof createClient>) {
    this.supabase = supabase;
  }

  /**
   * Process all entities from analysis results and create/link tags.
   * Returns the list of tag assignments that were created.
   */
  async processAnalysis(articleId: string, analysis: AnalysisResult): Promise<TagAssignment[]> {
    const assignments: TagAssignment[] = [];

    // 1. Process entities from the unified LLM response
    const validTypes = new Set<string>(['person', 'organization', 'location', 'topic']);

    for (const raw of (analysis.entities || []).slice(0, 15)) {
      if (!raw.name || !validTypes.has(raw.type)) continue;
      // Hallucination guard: skip if LLM returned a type name as the entity name
      if (validTypes.has(raw.name.toLowerCase())) continue;

      const canonical = resolveAlias(raw.name, raw.type as EntityType);
      const slug = slugify(canonical);
      if (!slug) continue;

      const tag = await this.upsertTag(slug, canonical, raw.type, 0.8);
      if (tag) {
        await this.linkTag(articleId, tag.id, 0.8);
        assignments.push(tag);
      }
    }

    // 2. Process key_people — create person tags with higher confidence
    for (const person of (analysis.key_people || []).slice(0, 5)) {
      const name = typeof person === 'string' ? person : person.name;
      if (!name) continue;
      const canonical = resolveAlias(name, 'person');
      const slug = slugify(canonical);
      if (!slug) continue;

      const existing = assignments.find(a => a.tag_slug === slug);
      if (existing) continue; // Already added from entities

      const tag = await this.upsertTag(slug, canonical, 'person', 0.9);
      if (tag) {
        await this.linkTag(articleId, tag.id, 0.9);
        assignments.push(tag);
      }
    }

    // 3. Crime type tag
    if (analysis.crime_type) {
      const slug = analysis.crime_type;
      const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const tag = await this.upsertTag(slug, name, 'topic', 0.85);
      if (tag) {
        await this.linkTag(articleId, tag.id, 0.85);
        assignments.push(tag);
      }
    }

    // 4. Location tags — enrich with coordinates from sri_lanka_locations
    for (const locName of (analysis.locations || []).slice(0, 5)) {
      const canonical = resolveAlias(locName, 'location');
      const slug = slugify(canonical);
      if (!slug) continue;

      const existing = assignments.find(a => a.tag_slug === slug);
      if (existing) continue;

      const coords = await this.getLocationCoordinates(slug);
      const tag = await this.upsertTag(slug, canonical, 'location', 0.8, coords || undefined);
      if (tag) {
        await this.linkTag(articleId, tag.id, 0.8);
        assignments.push(tag);
      }
    }

    // 5. Law enforcement organizations
    for (const orgName of (analysis.law_enforcement || []).slice(0, 3)) {
      const canonical = resolveAlias(orgName, 'organization');
      const slug = slugify(canonical);
      if (!slug) continue;

      const existing = assignments.find(a => a.tag_slug === slug);
      if (existing) continue;

      const tag = await this.upsertTag(slug, canonical, 'organization', 0.85);
      if (tag) {
        await this.linkTag(articleId, tag.id, 0.85);
        assignments.push(tag);
      }
    }

    // 6. Police station
    if (analysis.police_station) {
      const slug = slugify(analysis.police_station);
      if (slug) {
        const existing = assignments.find(a => a.tag_slug === slug);
        if (!existing) {
          const tag = await this.upsertTag(slug, analysis.police_station, 'organization', 0.9);
          if (tag) {
            await this.linkTag(articleId, tag.id, 0.9);
            assignments.push(tag);
          }
        }
      }
    }

    // 7. Political party
    if (analysis.political_party) {
      const canonical = resolveAlias(analysis.political_party, 'organization');
      const slug = slugify(canonical);
      if (slug) {
        const existing = assignments.find(a => a.tag_slug === slug);
        if (!existing) {
          const tag = await this.upsertTag(slug, canonical, 'organization', 0.85);
          if (tag) {
            await this.linkTag(articleId, tag.id, 0.85);
            assignments.push(tag);
          }
        }
      }
    }

    return assignments;
  }

  private async upsertTag(
    slug: string,
    name: string,
    type: string,
    confidence: number,
    locationData?: {
      latitude?: number;
      longitude?: number;
      district?: string;
      province?: string;
      name_si?: string;
    },
  ): Promise<TagAssignment | null> {
    const record: Record<string, unknown> = {
      name,
      slug,
      type,
      is_active: true,
      created_by: 'ai',
    };

    if (locationData) {
      if (locationData.latitude != null) record.latitude = locationData.latitude;
      if (locationData.longitude != null) record.longitude = locationData.longitude;
      if (locationData.district) record.district = locationData.district;
      if (locationData.province) record.province = locationData.province;
      if (locationData.name_si) record.name_si = locationData.name_si;
    }

    const { data, error } = await this.supabase
      .from('tags')
      .upsert(record, { onConflict: 'slug' })
      .select('id')
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      tag_slug: slug,
      tag_name: name,
      tag_type: type,
      confidence,
      ...(locationData || {}),
    };
  }

  private async linkTag(articleId: string, tagId: string, confidence: number): Promise<void> {
    await this.supabase
      .from('article_tags')
      .upsert(
        { article_id: articleId, tag_id: tagId, confidence, source: 'ai' },
        { onConflict: 'article_id,tag_id' },
      );
  }

  private async getLocationCoordinates(slug: string): Promise<{
    latitude?: number;
    longitude?: number;
    district?: string;
    province?: string;
    name_si?: string;
  } | null> {
    if (this.locationCache.has(slug)) return this.locationCache.get(slug)!;

    const { data } = await this.supabase
      .from('sri_lanka_locations')
      .select('latitude, longitude, district, province, name_si')
      .eq('slug', slug)
      .maybeSingle();

    this.locationCache.set(slug, data || null);
    return data || null;
  }

  /**
   * Update tag name_si translations for a batch of tags.
   */
  async updateTagTranslations(translations: Record<string, string>): Promise<void> {
    for (const [slug, nameSi] of Object.entries(translations)) {
      if (!nameSi) continue;
      await this.supabase
        .from('tags')
        .update({ name_si: nameSi })
        .eq('slug', slug)
        .is('name_si', null); // Only update if not already translated
    }
  }
}
