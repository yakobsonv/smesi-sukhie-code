import { defineConfig } from 'astro/config';

// Три сайта клиента в одном проекте: /oskol, /zhkz, /stellard.
// Пока это внутренняя версия для согласования — закрыта от поиска на уровне хостинга,
// боевые адреса остаются на конструкторе.
export default defineConfig({
  output: 'static',
  build: { format: 'directory' },
  compressHTML: true,
});
