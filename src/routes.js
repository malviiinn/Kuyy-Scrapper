
import { createCheerioRouter } from 'crawlee';
import { Dataset, KeyValueStore } from 'apify';

const ACTIVITIES = ['tennis', 'padel', 'softball', 'yoga', 'workout', 'cycling', 'climbing', 'badminton'];

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const parseDateSafe = s => {
  try { return s ? new Date(s) : null; } catch { return null; }
};
const haversineKm = (lat1, lon1, lat2, lon2) => {
  const toRad = v => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Geocode city → {lat, lon} */
async function geocodeCity(city, province, log) {
  const q = `${city}, ${province}, Indonesia`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
  log.info(`Geocode: ${q}`);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Apify-Actor/1.0 (contact: example@example.com)' },
  });
  if (!res.ok) throw new Error(`Geocode gagal: ${res.status} ${res.statusText}`);

  const arr = await res.json().catch(() => null);
  if (Array.isArray(arr) && arr[0]) {
    return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) };
  }
  throw new Error('Geocode tidak menemukan koordinat kota.');
}

function buildEventsUrl(baseUrl, params) {
  const u = new URL(baseUrl);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).length > 0) u.searchParams.set(k, v);
  });
  return u.toString();
}

function unpackResponse(json) {
  let items = [];
  let nextOffsetId;
  let nextOffsetTs;

  if (Array.isArray(json)) {
    items = json;
  } else if (json?.events) {
    items = json.events;
    nextOffsetId = json.last_id ?? json.next_id;
    nextOffsetTs = json.last_timestamp ?? json.offset_timestamp;
  } else if (json?.items) {
    items = json.items;
    nextOffsetId = json.last_id ?? json.next_id;
    nextOffsetTs = json.last_timestamp ?? json.offset_timestamp;
  } else if (typeof json === 'object' && json?.count >= 0) {
    items = json.items ?? [];
    nextOffsetId = json.last_id ?? json.next_id;
    nextOffsetTs = json.last_timestamp ?? json.offset_timestamp;
  } else if (json) {
    items = [json];
  }

  return { items, nextOffsetId, nextOffsetTs };
}

function eventToRecord(ev, activityKey) {
  const start = parseDateSafe(ev.start_timestamp);
  const end = parseDateSafe(ev.end_timestamp);
  return {
    id: ev.id ?? null,
    activity: activityKey,
    title: ev.name ?? null,
    description: ev.description ?? null,
    start_timestamp: ev.start_timestamp ?? null,
    end_timestamp: ev.end_timestamp ?? null,
    start_local: start ? start.toISOString() : null,
    end_local: end ? end.toISOString() : null,
    location: ev.location ?? null,
    latitude: Number.isFinite(ev.latitude) ? ev.latitude : null,
    longitude: Number.isFinite(ev.longitude) ? ev.longitude : null,
    price: ev.price ?? null,
    status: ev.status ?? null,
    type: ev.type ?? null,
    image_url: ev.image_url ?? ev.og_image_url ?? null,
    host_name: ev?.host_info?.name ?? null,
    raw: ev,
    scraped_at: new Date().toISOString(),
  };
}

export function createRouter(actorInput) {
  const router = createCheerioRouter();

  router.addDefaultHandler(async ({ request, log }) => {
    const kv = await KeyValueStore.open();
    await kv.setValue('INPUT', actorInput);

    const {
      province,
      city,
      activity,
      daysRange = 7,
      maxItems = 500,
      distance = 20,
      limitPerPage = 50,
      baseApiUrl = 'https://kuyy.app/api/events',
    } = actorInput ?? {};

    if (!province || !city || !activity || !daysRange) {
      throw new Error('Input wajib: province, city, activity, daysRange');
    }
    const activityNorm = String(activity).toLowerCase();
    if (!ACTIVITIES.includes(activityNorm)) {
      throw new Error(`activity harus salah satu dari: ${ACTIVITIES.join(', ')}`);
    }

    log.info(`Mulai dari: ${request.url}`);

    const startDate = startOfToday();
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + (daysRange - 1));
    const minTs = startDate.getTime();
    const maxTs = endDate.getTime();

    const center = await geocodeCity(city, province, log).catch(err => {
      log.error(err.message);
      return null;
    });
    if (!center) throw new Error('Tidak bisa geocode kota. Pastikan "city" & "province" valid.');

    let total = 0;
    let offsetId;
    let offsetTimestamp;
    let pageNum = 0;

    while (total < maxItems) {
      pageNum += 1;
      const params = {
        limit: limitPerPage,
        when: 'upcoming',
        status: 'scheduled',
        type: 'public,followers',
        asc: 'true',
        latitude: center.lat,
        longitude: center.lon,
        distance,
        is_grouping: 'false',
        sort_by_date: 'false',
        ignore_limit: 'false',
        hide_full: 'false',
        offset_id: offsetId,
        offset_timestamp: offsetTimestamp,
      };

      const url = buildEventsUrl(baseApiUrl, params);
      log.info(`API Page ${pageNum}: ${url}`);

      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error(`Request gagal: ${res.status} ${res.statusText}`);

      let json;
      try {
        json = await res.json();
      } catch {
        const text = await res.text();
        await kv.setValue(`PAGE_${pageNum}_TEXT`, text);
        log.warning('Response bukan JSON. Disimpan di KV untuk inspeksi.');
        break;
      }

      const { items, nextOffsetId, nextOffsetTs } = unpackResponse(json);
      log.info(`Page ${pageNum}: items=${items.length} nextOffsetId=${nextOffsetId ?? '-'} nextOffsetTs=${nextOffsetTs ?? '-'}`);

      if (!items || items.length === 0) break;

      for (const ev of items) {
        const cat = (ev.category ?? '').toLowerCase();
        const cats = (ev.categories ?? '').toLowerCase();
        const isActivity = (cat === activityNorm) || cats.includes(activityNorm);
        if (!isActivity) continue;

        const st = parseDateSafe(ev.start_timestamp);
        if (!st) continue;

        const ts = st.getTime();
        if (ts < minTs || ts > maxTs) continue;

        if (Number.isFinite(ev.latitude) && Number.isFinite(ev.longitude)) {
          const dKm = haversineKm(center.lat, center.lon, ev.latitude, ev.longitude);
          if (dKm > distance) continue;
        }

        await Dataset.pushData(eventToRecord(ev, activityNorm));
        total += 1;
        if (total >= maxItems) break;
      }

      if (nextOffsetId && nextOffsetTs) {
        offsetId = nextOffsetId;
        offsetTimestamp = nextOffsetTs;
      } else {
        break;
      }
    }

    log.info(`Selesai. Total items: ${total}`);
  });

  return router;
}
