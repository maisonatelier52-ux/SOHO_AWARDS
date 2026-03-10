import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const config = readFileSync(join(root, 'assets/js/config.js'), 'utf8');
const match = config.match(/siteUrl:\s*"([^"]*)"/);
const siteUrl = (match?.[1] || '').replace(/\/$/, '');
if (!siteUrl) {
  console.error('Set siteUrl in assets/js/config.js before generating sitemap.xml');
  process.exit(1);
}
const htmlFiles = readdirSync(root).filter(f => f.endsWith('.html'));
const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
for (const file of htmlFiles) {
  xml.push(`  <url><loc>${siteUrl}/${file}</loc></url>`);
}
xml.push('</urlset>');
writeFileSync(join(root, 'sitemap.xml'), xml.join('\n'));
writeFileSync(join(root, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
console.log('Updated sitemap.xml and robots.txt for', siteUrl);
