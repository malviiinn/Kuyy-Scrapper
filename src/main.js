
/**
 * Kuyy Scraper - PlaywrightCrawler (ESM)
 * Struktur: Actor.init → PlaywrightCrawler → router (createRouter) → run → export → Actor.exit
 */
import { Actor, Dataset, KeyValueStore } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
// PENTING: hanya import createRouter
import { createRouter } from './routes.js';

/**
 * Import XLSX secara dinamis, supaya kalau paket "xlsx" belum dipasang
 * tetap jalan dan hanya melewatkan ekspor XLSX.
 * Pasang kalau perlu:  npm i xlsx
 */
let XLSX = null;
try {
  XLSX = await import('xlsx'); // akan tersedia jika dependency terpasang
} catch (e) {
  console.warn('[INFO] Ekspor XLSX di-skip (modul "xlsx" tidak tersedia). Pasang dulu: npm i xlsx');
}

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
  startUrls = ['https://kuyy.app/'],
  headless = true,
  slowMo = 0,
  proxy = null,
} = input;

// Siapkan proxy (opsional)
const proxyConfiguration = proxy
  ? await Actor.createProxyConfiguration(proxy)
  : await Actor.createProxyConfiguration();

// Buat router dari input
const appRouter = createRouter(input);

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  requestHandler: appRouter, // ← gunakan appRouter, bukan variabel "router" lain
  launchContext: {
    launchOptions: {
      headless,
      slowMo,
      args: [
        '--disable-gpu',
        '--no-sandbox',
      ],
    },
  },
  requestHandlerTimeoutSecs: 180,
});

await crawler.run(startUrls);

/** ===================== EKSPOR HASIL DATASET ===================== **/
const dataset = await Dataset.open();   // dataset default
const kv = await KeyValueStore.open();  // untuk menyimpan file hasil

// Ambil semua item dari dataset
const { items } = await dataset.getData({ clean: true });

// --- (Opsional) Buang kolom besar 'raw' agar file lebih kecil ---
// const slimItems = items.map(({ raw, ...rest }) => rest);
const exportItems = items; // pakai 'items' apa adanya

// --- Ekspor CSV (tanpa lib eksternal) ---
if (exportItems.length > 0) {
  // Buat header dari union semua keys agar robust meski tiap item beda field
  const headerSet = new Set();
  for (const row of exportItems) Object.keys(row).forEach(k => headerSet.add(k));
  const headers = Array.from(headerSet);

  const escapeCsv = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    const needsQuote = /[",\n\r]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needsQuote ? `"${escaped}"` : escaped;
  };

  const lines = [];
  lines.push(headers.join(',')); // header
  for (const row of exportItems) {
    const line = headers.map(h => escapeCsv(row[h]));
    lines.push(line.join(','));
  }
  const csv = lines.join('\n');

  // Simpan ke KV Store agar bisa diunduh dari Apify Console (Storage → Key-Value Store)
  await kv.setValue('RESULT.csv', csv, { contentType: 'text/csv; charset=utf-8' });
}

// --- Ekspor XLSX (jika paket "xlsx" tersedia) ---
if (XLSX && exportItems.length > 0) {
  try {
    const worksheet = XLSX.utils.json_to_sheet(exportItems, { skipHeader: false });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
    // Tulis ke buffer
    const xlsxBuf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    await kv.setValue(
      'RESULT.xlsx',
      xlsxBuf,
      { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );
  } catch (err) {
    console.warn('Gagal ekspor XLSX:', err.message);
  }
}
/** =================== SELESAI EKSPOR DATASET ===================== **/

await Actor.exit();
