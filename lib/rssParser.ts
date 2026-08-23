import Parser from 'rss-parser';
import { Article, Source } from './supabase';

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['enclosure', 'enclosure'],
    ],
  },
});

export interface ParsedArticle {
  title: string;
  description: string | null;
  url: string;
  publishedAt: Date;
  author: string | null;
  imageUrl: string | null;
}

/**
 * Parse RSS feed and extract articles
 */
export async function parseRSSFeed(
  feedUrl: string,
  source: Source
): Promise<ParsedArticle[]> {
  try {
    const feed = await parser.parseURL(feedUrl);
    const articles: ParsedArticle[] = [];

    for (const item of feed.items) {
      // Extract image URL from various possible locations
      let imageUrl: string | null = null;
      
      if (item.enclosure && item.enclosure.type?.startsWith('image/')) {
        imageUrl = item.enclosure.url || null;
      } else if (item.mediaContent && Array.isArray(item.mediaContent)) {
        const imageContent = item.mediaContent.find(
          (m: any) => m.$.type?.startsWith('image/')
        );
        imageUrl = imageContent?.$.url || null;
      } else if (item.mediaThumbnail) {
        imageUrl = item.mediaThumbnail.$.url || null;
      } else if (item.contentSnippet) {
        // Try to extract image from HTML content
        const imgMatch = item.contentSnippet.match(/<img[^>]+src="([^"]+)"/i);
        if (imgMatch) {
          imageUrl = imgMatch[1];
        }
      }

      // Parse published date
      let publishedAt = new Date();
      if (item.pubDate) {
        publishedAt = new Date(item.pubDate);
      } else if (item.isoDate) {
        publishedAt = new Date(item.isoDate);
      }

      articles.push({
        title: item.title || 'Untitled',
        description: item.contentSnippet || item.content || null,
        url: item.link || '',
        publishedAt,
        author: item.creator || item.author || null,
        imageUrl,
      });
    }

    return articles;
  } catch (error) {
    console.error(`Error parsing RSS feed ${feedUrl}:`, error);
    throw error;
  }
}

/**
 * Check if an article already exists in database (by URL)
 */
export function isDuplicateArticle(
  url: string,
  existingUrls: Set<string>
): boolean {
  return existingUrls.has(url);
}

