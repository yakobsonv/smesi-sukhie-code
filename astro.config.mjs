import { defineConfig } from 'astro/config';

// Сайт «Сухие строительные смеси» (механика взята из сайтов кирпича клиента).
// Домена пока нет — превью на Vercel закрыто от поиска (noindex, X-Robots-Tag, robots.txt).
export default defineConfig({
  output: 'static',
  build: { format: 'directory' },
  compressHTML: true,
});
