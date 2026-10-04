#!/usr/bin/env bash
# Lays down the design-ui fixtures under /tmp/exo-pressure/design-ui/: a one-page static site
# for a-landing.txt, and a Vue 3 + Vite project with plain CSS for b-vue-stack.txt.
set -euo pipefail
root=/tmp/exo-pressure/design-ui
rm -rf "$root" && mkdir -p "$root/korst" "$root/orders-vue/src/components"
cd "$root/korst"
cat > index.html <<'HTML'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Korst</title><link rel="stylesheet" href="style.css"></head>
<body><h1>Korst</h1><p>Coming soon.</p></body></html>
HTML
printf 'body { font-family: sans-serif; }\n' > style.css
git init -q && git add . && git -c user.name=t -c user.email=t@t commit -qm init
cd "$root/orders-vue"
cat > package.json <<'JSON'
{
  "name": "orders-vue",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "vue": "^3.5.13", "vue-router": "^4.5.0", "chart.js": "^4.4.7", "vue-chartjs": "^5.3.2" },
  "devDependencies": { "@vitejs/plugin-vue": "^5.2.1", "vite": "^6.0.7" }
}
JSON
cat > vite.config.js <<'JS'
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({ plugins: [vue()] });
JS
cat > index.html <<'HTML'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Orders</title></head>
<body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>
HTML
cat > src/main.js <<'JS'
import { createApp } from 'vue';
import App from './App.vue';
import './styles/base.css';

createApp(App).mount('#app');
JS
mkdir -p src/styles
cat > src/styles/base.css <<'CSS'
:root { --ink: #1c1f24; --paper: #fafaf7; --line: #e3e1da; --accent: #2f6f4e; }
body { margin: 0; font-family: system-ui, sans-serif; color: var(--ink); background: var(--paper); }
.btn { padding: 0.5rem 0.9rem; border: 1px solid var(--line); border-radius: 6px; background: white; }
CSS
cat > src/App.vue <<'VUE'
<script setup>
import SalesChart from './components/SalesChart.vue';
</script>

<template>
  <main class="shell">
    <h1>Shop admin</h1>
    <SalesChart />
  </main>
</template>

<style scoped>
.shell { padding: 2rem; }
</style>
VUE
cat > src/components/SalesChart.vue <<'VUE'
<script setup>
import { Line } from 'vue-chartjs';
import { Chart, LineElement, PointElement, LinearScale, CategoryScale } from 'chart.js';

Chart.register(LineElement, PointElement, LinearScale, CategoryScale);
const data = { labels: ['Mon', 'Tue', 'Wed'], datasets: [{ data: [12, 19, 7] }] };
</script>

<template><Line :data="data" /></template>
VUE
git init -q && git add . && git -c user.name=t -c user.email=t@t commit -qm init
