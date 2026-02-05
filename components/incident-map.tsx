'use client';

import { useEffect, useRef } from 'react';
import type { MapIncident } from '@/lib/types';

interface IncidentMapProps {
  incidents: MapIncident[];
  className?: string;
}

const CRIME_COLORS: Record<string, string> = {
  drugs: '#7c3aed',       // violet
  shooting: '#dc2626',    // red
  murder: '#991b1b',      // dark red
  robbery: '#ea580c',     // orange
  assault: '#d97706',     // amber
  kidnapping: '#0891b2',  // cyan
  fraud: '#4f46e5',       // indigo
  corruption: '#6d28d9',  // purple
  smuggling: '#0d9488',   // teal
  default: '#ef4444',     // red
};

export function IncidentMap({ incidents, className }: IncidentMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || incidents.length === 0) return;

    // Prevent double-init
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    let cancelled = false;

    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current) return;

      // Load Leaflet CSS
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const map = L.map(mapRef.current, {
        center: [7.8731, 80.7718], // Center of Sri Lanka
        zoom: 8,
        scrollWheelZoom: false,
        zoomControl: true,
      });
      mapInstance.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      // Group incidents by location
      const byLocation: Record<string, MapIncident[]> = {};
      for (const inc of incidents) {
        const key = `${inc.latitude},${inc.longitude}`;
        if (!byLocation[key]) byLocation[key] = [];
        byLocation[key].push(inc);
      }

      // Add markers
      const markers: any[] = [];
      for (const locationIncidents of Object.values(byLocation)) {
        const first = locationIncidents[0];
        const count = locationIncidents.length;
        const radius = Math.min(6 + count * 2, 18);

        const marker = L.circleMarker([first.latitude, first.longitude], {
          radius,
          fillColor: CRIME_COLORS.default,
          color: '#7f1d1d',
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.55,
        }).addTo(map);

        const popupHtml = `
          <div style="max-width:260px;max-height:220px;overflow-y:auto;font-family:system-ui,sans-serif;">
            <div style="font-weight:600;font-size:14px;margin-bottom:2px;">${first.location_tag_name}</div>
            ${first.district ? `<div style="font-size:12px;color:#6b7280;">${first.district} District${first.province ? ', ' + first.province : ''}</div>` : ''}
            <div style="font-size:12px;color:#ef4444;font-weight:500;margin:4px 0;">${count} incident${count > 1 ? 's' : ''}</div>
            <hr style="margin:6px 0;border-color:#e5e7eb;"/>
            ${locationIncidents.slice(0, 4).map((inc: MapIncident) => `
              <div style="margin-bottom:6px;">
                <a href="${inc.article_url}" target="_blank" rel="noopener" style="font-size:12px;color:#1d4ed8;text-decoration:none;line-height:1.3;display:block;">
                  ${inc.article_title.length > 65 ? inc.article_title.slice(0, 65) + '...' : inc.article_title}
                </a>
                <div style="font-size:11px;color:#9ca3af;">
                  ${inc.source_name}${inc.published_at ? ' &middot; ' + new Date(inc.published_at).toLocaleDateString() : ''}
                </div>
              </div>
            `).join('')}
            ${count > 4 ? `<div style="font-size:11px;color:#6b7280;">+${count - 4} more</div>` : ''}
          </div>
        `;
        marker.bindPopup(popupHtml);
        markers.push(marker);
      }

      // Fit bounds if we have markers
      if (markers.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
      }

      // Invalidate size after render
      setTimeout(() => map.invalidateSize(), 100);
    });

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [incidents]);

  if (incidents.length === 0) return null;

  // Summarize by district
  const districtCounts: Record<string, number> = {};
  for (const inc of incidents) {
    if (inc.district) {
      districtCounts[inc.district] = (districtCounts[inc.district] || 0) + 1;
    }
  }
  const topDistricts = Object.entries(districtCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // Unique locations
  const uniqueLocations = new Set(incidents.map(i => i.location_tag_name));

  return (
    <div className={className}>
      {/* Map */}
      <div
        ref={mapRef}
        className="w-full h-[420px] rounded-lg border border-gray-200 dark:border-gray-700"
        style={{ zIndex: 0 }}
      />

      {/* Stats bar */}
      <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          {incidents.length} incidents
        </span>
        <span>{uniqueLocations.size} locations</span>
        {topDistricts.length > 0 && (
          <span className="text-gray-400 dark:text-gray-500">
            Top: {topDistricts.map(([d, c]) => `${d} (${c})`).join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}
