/* ============================== STATE =============================== */

const state = {
  weather: { city1: null, city2: null },
  historical: { city1: null, city2: null },
  aqi: { city1: null, city2: null },
  history30Days: { city1: [], city2: [] },
  previousWeather: { city1: null, city2: null },
  loading: true,
  error: null,
  lastUpdate: null,
  showSettings: false,
  activeTab: 'overview',
  battleMode: false,
  detailOpen: false,
  detailDate: null,
  settings: JSON.parse(localStorage.getItem('weatherSettings')) || {
    city1: { name: 'Oneonta, NY', lat: 42.4528, lon: -75.0638 },
    city2: { name: 'Gray Court, SC', lat: 34.6193, lon: -82.0787 },
    tempUnit: 'fahrenheit',
    autoRefresh: true,
    theme: 'dark',
    animations: true
  },
  streaks: JSON.parse(localStorage.getItem('weatherStreaks')) || { city1: {}, city2: {} }
};

const THEMES = {
  dark: { name: 'Dark', bg: 'theme-dark', card: 'bg-zinc-900', border: 'border-zinc-800', text: 'text-zinc-100' },
  ocean: { name: 'Ocean', bg: 'theme-ocean', card: 'bg-white bg-opacity-10', border: 'border-white border-opacity-20', text: 'text-white' },
  sunset: { name: 'Sunset', bg: 'theme-sunset', card: 'bg-white bg-opacity-10', border: 'border-white border-opacity-20', text: 'text-white' },
  forest: { name: 'Forest', bg: 'theme-forest', card: 'bg-white bg-opacity-10', border: 'border-white border-opacity-20', text: 'text-white' },
  arctic: { name: 'Arctic', bg: 'theme-arctic', card: 'bg-white bg-opacity-40', border: 'border-gray-300', text: 'text-gray-900' }
};

/* ============================ TIME HELPERS =========================== */

function todayYMD_NY() {
  const now = new Date();
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = ny.getFullYear();
  const m = String(ny.getMonth() + 1).padStart(2, '0');
  const d = String(ny.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nyNowHourKey() {
  const now = new Date();
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = ny.getFullYear();
  const m = String(ny.getMonth() + 1).padStart(2, '0');
  const d = String(ny.getDate()).padStart(2, '0');
  const H = String(ny.getHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${H}:00`;
}

function findStartIdxTodayOrNext(dates) {
  const today = todayYMD_NY();
  let idx = dates.findIndex(d => d === today);
  if (idx >= 0) return idx;
  idx = dates.findIndex(d => d > today);
  return idx >= 0 ? idx : 0;
}

function formatLocalClock(s) {
  if (!s) return '';
  const hh = parseInt(s.slice(11, 13), 10);
  const mm = s.slice(14, 16);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${mm} ${ampm}`;
}

function formatYMDToLabel(s) {
  if (!s) return '';
  const m = parseInt(s.slice(5, 7), 10);
  const d = parseInt(s.slice(8, 10), 10);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}`;
}

function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function formatFullDayDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'America/New_York' }).format(dt);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'America/New_York' }).format(dt);
  return `${weekday}, ${month} ${d}${ordinal(d)}`;
}

function formatShortDayDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay();
  const weekdays = ['Sun','Mon','Tues','Wed','Thurs','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${weekdays[dow]}, ${months[m - 1]} ${d}`;
}

/* ============================== STYLE INJECT ========================== */

function injectStyles() {
  if (document.getElementById('armstrong-style')) return;
  const css = `
  @keyframes pulse-green {
    0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); }
    60% { box-shadow: 0 0 40px 18px rgba(34,197,94,0); }
    100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
  }
  .winner-glow {
    position: relative;
    animation: pulse-green 2s ease-in-out infinite;
    border-color: rgba(34,197,94,0.6) !important;
  }
  .winner-glow::after {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: 16px;
    pointer-events: none;
    box-shadow: 0 0 0 2px rgba(34,197,94,0.35) inset;
  }
  .weather-transition { transition: transform .6s; transform: scale(1.02); }
  .z-50 { z-index: 50; }
  `;
  const style = document.createElement('style');
  style.id = 'armstrong-style';
  style.textContent = css;
  document.head.appendChild(style);
}

/* ============================== ANIMATOR ============================== */

class WeatherAnimator {
  constructor() {
    this.canvas = document.getElementById('weatherAnimation');
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'weatherAnimation';
      this.canvas.className = 'fixed inset-0 pointer-events-none z-0';
      document.body.appendChild(this.canvas);
      const appRoot = document.getElementById('app');
      if (appRoot) appRoot.classList.add('relative', 'z-10');
    }
    const ctx = this.canvas.getContext && this.canvas.getContext('2d');
    if (!ctx) {
      this.ctx = null;
      this.particles = [];
      this._raf = null;
      return;
    }
    this.ctx = ctx;
    this.particles = [];
    this._raf = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    if (!this.ctx) return;
    this.particles = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  createRain() {
    if (!this.ctx) return;
    this.clear();
    for (let i = 0; i < 100; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        speed: 5 + Math.random() * 5,
        length: 10 + Math.random() * 20
      });
    }
    this.animateRain();
  }

  animateRain() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = 'rgba(174, 194, 224, 0.5)';
    this.ctx.lineWidth = 2;

    this.particles.forEach(p => {
      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y);
      this.ctx.lineTo(p.x, p.y + p.length);
      this.ctx.stroke();

      p.y += p.speed;
      if (p.y > this.canvas.height) {
        p.y = -p.length;
        p.x = Math.random() * this.canvas.width;
      }
    });

    if (state.settings.animations) {
      this._raf = requestAnimationFrame(() => this.animateRain());
    }
  }

  createSnow() {
    if (!this.ctx) return;
    this.clear();
    for (let i = 0; i < 50; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        speed: 1 + Math.random() * 2,
        size: 2 + Math.random() * 4,
        wobble: Math.random() * 2
      });
    }
    this.animateSnow();
  }

  animateSnow() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';

    this.particles.forEach(p => {
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();

      p.y += p.speed;
      p.x += Math.sin(p.y / 30) * p.wobble;

      if (p.y > this.canvas.height) {
        p.y = -10;
        p.x = Math.random() * this.canvas.width;
      }
    });

    if (state.settings.animations) {
      this._raf = requestAnimationFrame(() => this.animateSnow());
    }
  }

  createSunny() {
    if (!this.ctx) return;
    this.clear();
    this.animateSunny();
  }

  animateSunny() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const centerX = this.canvas.width - 100;
    const centerY = 100;
    const time = Date.now() / 1000;

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + time * 0.1;
      const gradient = this.ctx.createLinearGradient(
        centerX, centerY,
        centerX + Math.cos(angle) * 100,
        centerY + Math.sin(angle) * 100
      );
      gradient.addColorStop(0, 'rgba(255, 220, 100, 0.3)');
      gradient.addColorStop(1, 'transparent');

      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(
        centerX + Math.cos(angle) * 80,
        centerY + Math.sin(angle) * 80
      );
      this.ctx.stroke();
    }

    if (state.settings.animations) {
      this._raf = requestAnimationFrame(() => this.animateSunny());
    }
  }

  createCloudy() {
    if (!this.ctx) return;
    this.clear();
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: 50 + Math.random() * 200,
        speed: 0.3 + Math.random() * 0.5,
        size: 80 + Math.random() * 40
      });
    }
    this.animateCloudy();
  }

  animateCloudy() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.particles.forEach(p => {
      this.ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.arc(p.x + p.size * 0.6, p.y, p.size * 0.8, 0, Math.PI * 2);
      this.ctx.arc(p.x + p.size * 1.2, p.y, p.size * 0.9, 0, Math.PI * 2);
      this.ctx.fill();

      p.x += p.speed;
      if (p.x > this.canvas.width + p.size * 2) {
        p.x = -p.size * 2;
      }
    });

    if (state.settings.animations) {
      this._raf = requestAnimationFrame(() => this.animateCloudy());
    }
  }
}

let animator = null;

function updateWeatherAnimation() {
  if (!animator) animator = new WeatherAnimator();
  if (!state.settings.animations || !animator.ctx) {
    animator && animator.clear();
    return;
  }
  const weather = state.weather.city1 || state.weather.city2;
  if (!weather) return;
  const code = weather.current.weather_code;
  if (code === 0) animator.createSunny();
  else if (code <= 3) animator.createCloudy();
  else if (code <= 67) animator.createRain();
  else if (code <= 77) animator.createSnow();
  else animator.createRain();
}

/* ============================ FETCH HELPERS =========================== */

async function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/* ============================== FETCHERS ============================== */

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,uv_index,visibility` +
    `&hourly=temperature_2m,precipitation_probability,weather_code,uv_index,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,wind_speed_10m_max,uv_index_max` +
    `&forecast_days=7` +
    `&temperature_unit=${state.settings.tempUnit}` +
    `&wind_speed_unit=mph` +
    `&timezone=America%2FNew_York` +
    `&past_days=0`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`HTTP error, status: ${response.status}`);
  return response.json();
}

async function fetch30DayHistory(lat, lon) {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min&temperature_unit=${state.settings.tempUnit}&timezone=America%2FNew_York`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return [];
    const data = await response.json();

    return data.daily.time.map((date, i) => ({
      date,
      high: data.daily.temperature_2m_max[i],
      low: data.daily.temperature_2m_min[i]
    }));
  } catch {
    return [];
  }
}

async function fetchAQI(lat, lon) {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function fetchHistoricalWeather(lat, lon) {
  try {
    const today = new Date();
    const lastYear = new Date(today);
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    const dateStr = lastYear.toISOString().split('T')[0];

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=${state.settings.tempUnit}&timezone=America%2FNew_York`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

/* ============================ SHARE FEATURE =========================== */

function loadHtml2Canvas() {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load html2canvas'));
    document.head.appendChild(s);
  });
}

async function shareWeather() {
  const shareDiv = document.getElementById('shareCapture');
  if (!shareDiv) return;

  try {
    await loadHtml2Canvas();

    const canvas = await html2canvas(shareDiv, {
      backgroundColor: '#000',
      scale: 2,
      useCORS: true
    });

    const fileName = 'armstrong-weather.png';

    const fallbackDownload = () => {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    if (navigator.share) {
      canvas.toBlob(async blob => {
        try {
          if (blob) {
            let f;
            try { f = new File([blob], fileName, { type: 'image/png' }); } catch { f = blob; }
            if (navigator.canShare && navigator.canShare({ files: [f] })) {
              await navigator.share({
                files: [f],
                title: 'Armstrong Weather Dashboard',
                text: `Weather comparison, ${state.settings.city1.name} vs ${state.settings.city2.name}`
              });
              return;
            }
          }
          await navigator.share({
            title: 'Armstrong Weather Dashboard',
            text: `Weather comparison, ${state.settings.city1.name} vs ${state.settings.city2.name}`,
            url: canvas.toDataURL('image/png')
          });
        } catch {
          fallbackDownload();
        }
      }, 'image/png');
    } else {
      fallbackDownload();
    }
  } catch (error) {
    console.error('Share failed:', error);
    alert('Sharing is not available, a PNG will be downloaded instead.');
    try {
      const canvas = await html2canvas(shareDiv, { backgroundColor: '#000', scale: 2, useCORS: true });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'armstrong-weather.png';
      a.click();
    } catch {}
  }
}

/* ======================== HOURLY DETAIL FEATURE ======================= */

function buildHourlyForDate(weather, dateYMD) {
  const h = weather.hourly;
  const out = [];
  for (let i = 0; i < h.time.length; i++) {
    const t = h.time[i];
    if (t.slice(0, 10) !== dateYMD) continue;
    out.push({
      timeLabel: formatLocalClock(t),
      temp: Math.round(h.temperature_2m?.[i] ?? 0),
      precip: Math.round(h.precipitation_probability?.[i] ?? 0),
      uv: Math.round(h.uv_index?.[i] ?? 0),
      wind: Math.round(h.wind_speed_10m?.[i] ?? 0),
      code: h.weather_code?.[i] ?? 0
    });
  }
  return out;
}

function renderHourlyList(cityLabel, rows, theme) {
  if (!rows.length) {
    return `
      <div class="${theme.card} ${theme.border} border rounded-xl p-4">
        <div class="${theme.text} opacity-70">No hourly data for this date</div>
      </div>
    `;
  }
  return `
    <div class="${theme.card} ${theme.border} border rounded-2xl p-4">
      <h4 class="text-lg font-medium mb-3 ${theme.text}">${cityLabel}</h4>
      <div class="divide-y divide-zinc-700">
        ${rows.map(r => `
          <div class="flex items-center justify-between py-2">
            <div class="w-20 ${theme.text}">${r.timeLabel}</div>
            <div class="w-8 text-xl">${getWeatherIcon(r.code)}</div>
            <div class="flex-1 flex gap-4 justify-end text-sm">
              <span class="${theme.text}"><strong>${r.temp}°</strong></span>
              <span class="${theme.text} opacity-70">💧 ${r.precip}%</span>
              <span class="${theme.text} opacity-70">☀️ ${r.uv}</span>
              <span class="${theme.text} opacity-70">💨 ${r.wind} mph</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function openDayDetail(dateYMD) {
  state.detailDate = dateYMD;
  state.detailOpen = true;
  render();
}

function closeDayDetail() {
  state.detailOpen = false;
  state.detailDate = null;
  render();
}

function renderDayDetailModal(theme) {
  if (!state.detailOpen || !state.detailDate) return '';

  const dateLabel = formatFullDayDate(state.detailDate);
  const city1Rows = buildHourlyForDate(state.weather.city1, state.detailDate);
  const city2Rows = buildHourlyForDate(state.weather.city2, state.detailDate);

  return `
    <div class="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div class="${theme.card} ${theme.border} border rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between p-4 border-b ${theme.border}">
          <div class="text-xl ${theme.text}">Hourly forecast, ${dateLabel}</div>
          <button class="${theme.text} opacity-70 hover:opacity-100 text-2xl px-2" onclick="closeDayDetail()">×</button>
        </div>
        <div class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          ${renderHourlyList(state.settings.city1.name, city1Rows, theme)}
          ${renderHourlyList(state.settings.city2.name, city2Rows, theme)}
        </div>
      </div>
    </div>
  `;
}

/* ============================== CHARTS ================================ */

function createChart(canvasId, type, data, options) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  if (typeof Chart === 'undefined') {
    const holder = canvas.parentElement;
    if (holder && !holder.querySelector('.chart-warning')) {
      const note = document.createElement('div');
      note.className = 'chart-warning text-sm opacity-70 mt-2';
      note.textContent = 'Charts unavailable. Chart.js not loaded.';
      holder.appendChild(note);
    }
    return;
  }
  if (canvas.chart) canvas.chart.destroy();
  canvas.chart = new Chart(ctx, { type, data, options });
}

function prepare24HourData() {
  if (!state.weather.city1 || !state.weather.city2) return [];
  const hourly1 = state.weather.city1.hourly;
  const hourly2 = state.weather.city2.hourly;

  const key = nyNowHourKey();

  let start = hourly1.time.findIndex(t => t === key);
  if (start < 0) start = hourly1.time.findIndex(t => t > key);
  if (start < 0) start = 0;

  return Array.from({ length: 24 }, (_, i) => {
    const k = start + i;
    const t = hourly1.time[k] || '';
    const label = t ? formatLocalClock(t) : '';
    return {
      time: label,
      temp1: Math.round(hourly1.temperature_2m?.[k] ?? 0),
      temp2: Math.round(hourly2.temperature_2m?.[k] ?? 0),
      uv1: Math.max(0, hourly1.uv_index?.[k] ?? 0),
      uv2: Math.max(0, hourly2.uv_index?.[k] ?? 0)
    };
  });
}

function prepare7DayData() {
  const daily1 = state.weather.city1.daily;
  const daily2 = state.weather.city2.daily;
  const s = findStartIdxTodayOrNext(daily1.time);

  return daily1.time.slice(s, s + 7).map((date, i) => ({
    date,
    dateShort: formatYMDToLabel(date),
    fullDate: formatFullDayDate(date),
    high1: Math.round(daily1.temperature_2m_max?.[s + i] ?? 0),
    low1: Math.round(daily1.temperature_2m_min?.[s + i] ?? 0),
    high2: Math.round(daily2.temperature_2m_max?.[s + i] ?? 0),
    low2: Math.round(daily2.temperature_2m_min?.[s + i] ?? 0)
  }));
}

function renderCharts() {
  if (!state.weather.city1 || !state.weather.city2) return;

  const hourlyData = prepare24HourData();
  const weeklyData = prepare7DayData();
  const history30 = state.history30Days;

  setTimeout(() => {
    const gridColor = state.settings.theme === 'arctic' ? '#ccc' : '#333';
    const textColor = state.settings.theme === 'arctic' ? '#111' : '#fff';

    createChart('tempChart', 'line', {
      labels: hourlyData.map(d => d.time),
      datasets: [
        { label: state.settings.city1.name, data: hourlyData.map(d => d.temp1), borderColor: 'rgb(59, 130, 246)', tension: 0.4 },
        { label: state.settings.city2.name, data: hourlyData.map(d => d.temp2), borderColor: 'rgb(245, 158, 11)', tension: 0.4 }
      ]
    }, {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor } } },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor }, grid: { color: gridColor } }
      }
    });

    createChart('uvChart', 'line', {
      labels: hourlyData.map(d => d.time),
      datasets: [
        { label: state.settings.city1.name, data: hourlyData.map(d => d.uv1), borderColor: 'rgb(249, 115, 22)', tension: 0.4 },
        { label: state.settings.city2.name, data: hourlyData.map(d => d.uv2), borderColor: 'rgb(236, 72, 153)', tension: 0.4 }
      ]
    }, {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor } } },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor }, grid: { color: gridColor } }
      }
    });

    createChart('weeklyChart', 'bar', {
      labels: weeklyData.map(d => d.dateShort),
      datasets: [
        { label: `${state.settings.city1.name} High`, data: weeklyData.map(d => d.high1), backgroundColor: 'rgba(59, 130, 246, 0.8)' },
        { label: `${state.settings.city1.name} Low`, data: weeklyData.map(d => d.low1), backgroundColor: 'rgba(30, 64, 175, 0.8)' },
        { label: `${state.settings.city2.name} High`, data: weeklyData.map(d => d.high2), backgroundColor: 'rgba(245, 158, 11, 0.8)' },
        { label: `${state.settings.city2.name} Low`, data: weeklyData.map(d => d.low2), backgroundColor: 'rgba(180, 83, 9, 0.8)' }
      ]
    }, {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor } } },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor }, grid: { color: gridColor } }
      }
    });

    if (history30.city1.length > 0 && history30.city2.length > 0) {
      createChart('history30Chart', 'line', {
        labels: history30.city1.map(d => formatYMDToLabel(d.date)),
        datasets: [
          { label: `${state.settings.city1.name} High`, data: history30.city1.map(d => d.high), borderColor: 'rgb(59, 130, 246)', tension: 0.4, fill: false },
          { label: `${state.settings.city1.name} Low`, data: history30.city1.map(d => d.low), borderColor: 'rgba(59, 130, 246, 0.5)', tension: 0.4, fill: false },
          { label: `${state.settings.city2.name} High`, data: history30.city2.map(d => d.high), borderColor: 'rgb(245, 158, 11)', tension: 0.4, fill: false },
          { label: `${state.settings.city2.name} Low`, data: history30.city2.map(d => d.low), borderColor: 'rgba(245, 158, 11, 0.5)', tension: 0.4, fill: false }
        ]
      }, {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { ticks: { color: textColor, maxTicksLimit: 10 }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } }
        }
      });
    }
  }, 100);
}

/* ============================== RENDERING ============================= */

function getWeatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌧️';
  return '⛈️';
}

function getUVLevel(uv) {
  if (uv <= 2) return { level: 'Low', color: 'text-green-400' };
  if (uv <= 5) return { level: 'Moderate', color: 'text-yellow-400' };
  if (uv <= 7) return { level: 'High', color: 'text-orange-400' };
  if (uv <= 10) return { level: 'Very High', color: 'text-red-400' };
  return { level: 'Extreme', color: 'text-purple-400' };
}

function render() {
  const theme = THEMES[state.settings.theme];
  document.body.className = theme.bg;
  const app = document.getElementById('app');

  if (state.loading) {
    app.innerHTML = `
      <div class="min-h-screen flex items-center justify-center ${theme.bg}">
        <div class="text-2xl ${theme.text}">Loading weather data...</div>
      </div>
    `;
    return;
  }

  if (state.error) {
    app.innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-8 ${theme.bg}">
        <div class="text-center max-w-2xl">
          <div class="text-2xl text-red-400 mb-4">⚠️ Error Loading Weather Data</div>
          <div class="${theme.text} mb-4">${state.error}</div>
          <button onclick="loadWeather()" class="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl transition-colors text-white">
            Try Again
          </button>
        </div>
      </div>
    `;
    return;
  }

  const { city1, city2 } = state.weather;
  if (!city1 || !city2) return;

  const moonPhase = getMoonPhase();
  const comparison = getComparisonStats(city1, city2);
  const bestPlace = calculateBestPlace();

  app.innerHTML = `
    <div class="min-h-screen p-4 md:p-8 ${theme.bg}">
      <div class="max-w-7xl mx-auto">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h1 class="text-3xl md:text-4xl font-light ${theme.text}">Armstrong Weather Dashboard</h1>
          <div class="flex gap-2 flex-wrap">
            <button onclick="state.battleMode = !state.battleMode; render();" class="flex items-center gap-2 ${state.battleMode ? 'bg-green-600' : theme.card} ${theme.border} border hover:opacity-80 px-4 py-2 rounded-xl transition-colors text-white">
              ⚔️ Battle
            </button>
            <button onclick="shareWeather()" class="flex items-center gap-2 ${theme.card} ${theme.border} border hover:opacity-80 px-4 py-2 rounded-xl transition-colors ${theme.text}">
              📤 Share
            </button>
            <button onclick="loadWeather()" class="flex items-center gap-2 ${theme.card} ${theme.border} border hover:opacity-80 px-4 py-2 rounded-xl transition-colors ${theme.text}">
              🔄 Refresh
            </button>
            <button onclick="state.showSettings = true; render();" class="flex items-center gap-2 ${theme.card} ${theme.border} border hover:opacity-80 px-4 py-2 rounded-xl transition-colors ${theme.text}">
              ⚙️ Settings
            </button>
          </div>
        </div>

        ${state.lastUpdate ? `<div class="text-sm mb-6 ${theme.text} opacity-60">Last updated: ${new Date(state.lastUpdate).toLocaleString()}</div>` : ''}

        ${state.battleMode ? `
          <div class="${theme.card} ${theme.border} border rounded-2xl p-6 mb-6 ${bestPlace.winner.key === 'city1' ? 'battle-animation' : ''}">
            <div class="text-center">
              <div class="text-2xl md:text-3xl font-bold ${theme.text} mb-4">🏆 Best Place To Be: ${bestPlace.winner.city}</div>
              <div class="text-4xl md:text-6xl font-light ${theme.text} mb-4">Weather Score: ${bestPlace.winner.score}/100</div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div class="text-left">
                  <div class="text-lg font-medium ${theme.text} mb-2">✅ Why ${bestPlace.winner.city} wins:</div>
                  ${bestPlace.winner.reasons.map(r => `<div class="text-sm ${theme.text} opacity-80">• ${r}</div>`).join('')}
                </div>
                <div class="text-left">
                  <div class="text-lg font-medium ${theme.text} mb-2">${bestPlace.loser.city} Score: ${bestPlace.loser.score}/100</div>
                  <div class="text-sm ${theme.text} opacity-60">Try again tomorrow for a rematch!</div>
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div class="${theme.card} ${theme.border} border rounded-2xl p-4">
            <div class="text-center">
              <div class="text-4xl mb-2">${moonPhase.emoji}</div>
              <div class="${theme.text} font-medium">${moonPhase.name}</div>
            </div>
          </div>
          <div class="${theme.card} ${theme.border} border rounded-2xl p-4 md:col-span-2">
            <div class="${theme.text} font-medium mb-2">Quick Comparison</div>
            <div class="text-sm ${theme.text} opacity-80 space-y-1">
              <div>🌡️ ${comparison.temp}</div>
              <div>💧 ${comparison.humidity}</div>
              <div>☀️ ${comparison.uv}</div>
            </div>
          </div>
        </div>

        <div class="flex gap-2 mb-6 overflow-x-auto">
          <button onclick="state.activeTab = 'overview'; render();" class="px-4 md:px-6 py-3 rounded-xl transition-colors whitespace-nowrap ${state.activeTab === 'overview' ? 'bg-blue-600 text-white' : theme.card + ' ' + theme.text}">
            Overview
          </button>
          <button onclick="state.activeTab = 'charts'; render(); renderCharts();" class="px-4 md:px-6 py-3 rounded-xl transition-colors whitespace-nowrap ${state.activeTab === 'charts' ? 'bg-blue-600 text-white' : theme.card + ' ' + theme.text}">
            📊 Charts
          </button>
          <button onclick="state.activeTab = 'insights'; render();" class="px-4 md:px-6 py-3 rounded-xl transition-colors whitespace-nowrap ${state.activeTab === 'insights' ? 'bg-blue-600 text-white' : theme.card + ' ' + theme.text}">
            💡 Insights
          </button>
          <button onclick="state.activeTab = 'outfit'; render();" class="px-4 md:px-6 py-3 rounded-xl transition-colors whitespace-nowrap ${state.activeTab === 'outfit' ? 'bg-blue-600 text-white' : theme.card + ' ' + theme.text}">
            👔 Outfit
          </button>
        </div>

        <div id="shareCapture">
          ${state.activeTab === 'overview' ? renderOverview(city1, city2, theme, calculateBestPlace()) : 
            state.activeTab === 'charts' ? renderChartsView(theme) : 
            state.activeTab === 'outfit' ? renderOutfitView(city1, city2, theme) :
            renderInsightsView(city1, city2, theme)}
        </div>

        ${renderDayDetailModal(theme)}
      </div>

      ${state.showSettings ? renderSettings(theme) : ''}
    </div>
  `;
}

function renderOverview(city1, city2, theme, bestPlace) {
  return `
    <div class="flex flex-col lg:flex-row gap-6 mobile-stack">
      ${renderWeatherCard(city1, state.settings.city1.name, theme, state.battleMode && bestPlace.winner.key === 'city1', 'slide-in-left')}
      ${renderWeatherCard(city2, state.settings.city2.name, theme, state.battleMode && bestPlace.winner.key === 'city2', 'slide-in-right')}
    </div>
  `;
}

function renderWeatherCard(data, cityName, theme, isWinner, animationClass) {
  const current = data.current;
  const daily = data.daily;
  const uvInfo = getUVLevel(current.uv_index || 0);
  const todayIdx = findStartIdxTodayOrNext(daily.time);

  const tempClass = state.previousWeather.city1 &&
    Math.abs(current.temperature_2m - (state.previousWeather[cityName.includes('Oneonta') ? 'city1' : 'city2']?.current?.temperature_2m || current.temperature_2m)) > 2
    ? 'temp-change' : '';

  return `
    <div class="flex-1 ${theme.card} ${theme.border} border rounded-2xl p-6 md:p-8 mobile-p-4 ${isWinner ? 'winner-glow' : ''} weather-card ${animationClass}">
      <h2 class="text-xl md:text-2xl font-light mb-6 md:mb-8 ${theme.text} fade-in">${cityName} ${isWinner ? '🏆' : ''}</h2>
      
      <div class="mb-6 md:mb-8">
        <div class="flex items-center gap-4 mb-6 fade-in">
          <span class="text-5xl md:text-7xl weather-icon">${getWeatherIcon(current.weather_code)}</span>
          <div>
            <div class="text-4xl md:text-6xl font-light ${theme.text} ${tempClass} number-roll">${Math.round(current.temperature_2m)}°</div>
            <div class="${theme.text} opacity-60 text-base md:text-lg fade-in">Feels like ${Math.round(current.apparent_temperature)}°</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 md:gap-4">
          <div class="${theme.card} ${theme.border} border rounded-xl p-3 md:p-4 weather-metric fade-in" style="animation-delay: 0.1s;">
            <div class="${theme.text} opacity-60 text-xs md:text-sm mb-1 md:mb-2">💧 Humidity</div>
            <div class="text-xl md:text-2xl ${theme.text} number-roll">${current.relative_humidity_2m}%</div>
          </div>
          <div class="${theme.card} ${theme.border} border rounded-xl p-3 md:p-4 weather-metric fade-in" style="animation-delay: 0.2s;">
            <div class="${theme.text} opacity-60 text-xs md:text-sm mb-1 md:mb-2">💨 Wind</div>
            <div class="text-xl md:text-2xl ${theme.text} number-roll">${Math.round(current.wind_speed_10m)} mph</div>
          </div>
          <div class="${theme.card} ${theme.border} border rounded-xl p-3 md:p-4 weather-metric fade-in" style="animation-delay: 0.3s;">
            <div class="${theme.text} opacity-60 text-xs md:text-sm mb-1 md:mb-2">☀️ UV Index</div>
            <div class="text-xl md:text-2xl ${theme.text} number-roll">${Math.round(current.uv_index || 0)} <span class="text-xs md:text-sm ${uvInfo.color}">${uvInfo.level}</span></div>
          </div>
          <div class="${theme.card} ${theme.border} border rounded-xl p-3 md:p-4 weather-metric fade-in" style="animation-delay: 0.4s;">
            <div class="${theme.text} opacity-60 text-xs md:text-sm mb-1 md:mb-2">👁️ Visibility</div>
            <div class="text-xl md:text-2xl ${theme.text} number-roll">${Math.round((current.visibility || 0) / 1609.34)} mi</div>
          </div>
          <div class="${theme.card} ${theme.border} border rounded-xl p-3 md:p-4 weather-metric fade-in" style="animation-delay: 0.5s;">
            <div class="${theme.text} opacity-60 text-xs md:text-sm mb-1 md:mb-2">🌅 Sunrise</div>
            <div class="text-base md:text-xl ${theme.text}">${formatLocalClock(daily.sunrise[todayIdx])}</div>
          </div>
          <div class="${theme.card} ${theme.border} border rounded-xl p-3 md:p-4 weather-metric fade-in" style="animation-delay: 0.6s;">
            <div class="${theme.text} opacity-60 text-xs md:text-sm mb-1 md:mb-2">🌇 Sunset</div>
            <div class="text-base md:text-xl ${theme.text}">${formatLocalClock(daily.sunset[todayIdx])}</div>
          </div>
        </div>
      </div>

      <div class="fade-in" style="animation-delay: 0.7s;">
        <h3 class="text-base md:text-lg font-light mb-4 ${theme.text}">7-Day Forecast</h3>
        <div class="space-y-2">
          ${daily.time.slice(todayIdx, todayIdx + 7).map((date, i) => {
            const idx = todayIdx + i;
            const dayUV = getUVLevel(daily.uv_index_max[idx] || 0);
            return `
              <div class="flex items-center justify-between ${theme.card} ${theme.border} border rounded-xl p-2 md:p-3 weather-metric fade-in cursor-pointer hover:opacity-90"
                   style="animation-delay: ${0.8 + i * 0.1}s;"
                   onclick="openDayDetail('${date}')"
                   title="View hourly forecast">
                <span class="${theme.text} w-40 md:w-52 text-xs md:text-sm">${formatShortDayDate(date)}</span>
                <span class="text-xl md:text-2xl weather-icon">${getWeatherIcon(daily.weather_code[idx])}</span>
                <div class="flex gap-2 md:gap-4 items-center text-xs md:text-sm">
                  <span class="${theme.text} opacity-60">💧 ${daily.precipitation_probability_max[idx]}%</span>
                  <span class="${dayUV.color}">☀️ ${Math.round(daily.uv_index_max[idx] || 0)}</span>
                  <span class="${theme.text} font-medium">${Math.round(daily.temperature_2m_max[idx])}°</span>
                  <span class="${theme.text} opacity-60">${Math.round(daily.temperature_2m_min[idx])}°</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderOutfitView(city1, city2, theme) {
  const outfit1 = getOutfitRecommendation(city1);
  const outfit2 = getOutfitRecommendation(city2);
  
  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="${theme.card} ${theme.border} border rounded-2xl p-6 md:p-8 slide-in-left">
        <h2 class="text-2xl font-light mb-6 ${theme.text}">${state.settings.city1.name}</h2>
        <div class="${theme.text} font-medium mb-4">👔 What to Wear Today</div>
        <div class="space-y-3">
          ${outfit1.map((item, i) => `
            <div class="${theme.card} ${theme.border} border rounded-xl p-4 fade-in" style="animation-delay: ${i * 0.1}s;">
              <div class="text-lg">${item}</div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="${theme.card} ${theme.border} border rounded-2xl p-6 md:p-8 slide-in-right">
        <h2 class="text-2xl font-light mb-6 ${theme.text}">${state.settings.city2.name}</h2>
        <div class="${theme.text} font-medium mb-4">👔 What to Wear Today</div>
        <div class="space-y-3">
          ${outfit2.map((item, i) => `
            <div class="${theme.card} ${theme.border} border rounded-xl p-4 fade-in" style="animation-delay: ${i * 0.1}s;">
              <div class="text-lg">${item}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

/* ============================ INSIGHTS HELPERS ======================== */

function getMoonPhase() {
  const date = new Date();
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  const day = date.getDate();
  let c = 0, e = 0, jd = 0, b = 0;

  if (month < 3) { year--; month += 12; }
  c = 365.25 * year;
  e = 30.6 * (month + 1);
  jd = c + e + day - 694039.09;
  jd /= 29.5305882;
  b = parseInt(jd);
  jd -= b;
  b = Math.round(jd * 8);
  if (b >= 8) b = 0;

  const phases = [
    { name: 'New Moon', emoji: '🌑' },
    { name: 'Waxing Crescent', emoji: '🌒' },
    { name: 'First Quarter', emoji: '🌓' },
    { name: 'Waxing Gibbous', emoji: '🌔' },
    { name: 'Full Moon', emoji: '🌕' },
    { name: 'Waning Gibbous', emoji: '🌖' },
    { name: 'Last Quarter', emoji: '🌓' },
    { name: 'Waning Crescent', emoji: '🌘' }
  ];
  return phases[b];
}

function getOutfitRecommendation(data) {
  const temp = data.current.temperature_2m;
  const code = data.current.weather_code;
  const wind = data.current.wind_speed_10m;

  const outfit = [];

  if (temp < 30) outfit.push('🧥 Heavy winter coat', '🧣 Scarf and gloves', '🥾 Insulated boots');
  else if (temp < 50) outfit.push('🧥 Jacket or coat', '👖 Long pants', '👟 Closed-toe shoes');
  else if (temp < 70) outfit.push('👕 Long sleeve shirt', '👖 Pants or jeans');
  else if (temp < 85) outfit.push('👕 T-shirt', '🩳 Shorts or light pants');
  else outfit.push('👕 Light breathable clothing', '🩳 Shorts', '🧢 Hat for sun protection');

  if (code > 60 && code <= 67) outfit.push('☔ Umbrella', '🥾 Waterproof shoes');
  else if (code > 67) outfit.push('🧤 Waterproof gloves', '☔ Rain gear');

  if (wind > 15) outfit.push('🧥 Windbreaker');

  if (data.current.uv_index > 6) outfit.push('🕶️ Sunglasses', '🧴 Sunscreen');

  return outfit.slice(0, 5);
}

function getAQILevel(aqi) {
  if (!aqi) return { level: 'Unknown', color: 'text-zinc-400', desc: 'No data' };
  if (aqi <= 50) return { level: 'Good', color: 'text-green-400', desc: 'Air quality is satisfactory' };
  if (aqi <= 100) return { level: 'Moderate', color: 'text-yellow-400', desc: 'Acceptable for most people' };
  if (aqi <= 150) return { level: 'Unhealthy for Sensitive', color: 'text-orange-400', desc: 'Sensitive groups may be affected' };
  if (aqi <= 200) return { level: 'Unhealthy', color: 'text-red-400', desc: 'Everyone may begin to feel effects' };
  if (aqi <= 300) return { level: 'Very Unhealthy', color: 'text-purple-400', desc: 'Health alert, everyone affected' };
  return { level: 'Hazardous', color: 'text-red-600', desc: 'Health warnings of emergency' };
}

function getWeatherAdvice(data, aqi) {
  const temp = data.current.temperature_2m;
  const weatherCode = data.current.weather_code;
  const uvIndex = data.current.uv_index || 0;
  const aqiLevel = aqi?.current?.us_aqi || 0;

  const advice = [];

  if (weatherCode === 0) advice.push('☀️ Beautiful day, perfect for outdoor activities');
  else if (weatherCode <= 3) advice.push('⛅ Partly cloudy, great weather for a walk');
  else if (weatherCode <= 67) advice.push('☔ Rain expected, bring an umbrella');
  else if (weatherCode <= 77) advice.push('🌨️ Snow expected, dress warmly');

  if (temp < 32) advice.push('🥶 Freezing temps, layer up and protect extremities');
  else if (temp < 50) advice.push('🧥 Cool weather, jacket recommended');
  else if (temp > 85) advice.push('🌡️ Hot day, stay hydrated and seek shade');

  if (uvIndex > 7) advice.push('🕶️ High UV, wear sunscreen and sunglasses');
  if (aqiLevel > 100) advice.push('😷 Poor air quality, consider limiting outdoor activity');

  if (advice.length === 0) advice.push('👍 Good weather for most activities');

  return advice;
}

function getComparisonStats(data1, data2) {
  const temp1 = data1.current.temperature_2m;
  const temp2 = data2.current.temperature_2m;
  const tempDiff = Math.abs(temp1 - temp2);
  const warmer = temp1 > temp2 ? state.settings.city1.name : state.settings.city2.name;
  const colder = temp1 < temp2 ? state.settings.city1.name : state.settings.city2.name;

  const humidity1 = data1.current.relative_humidity_2m;
  const humidity2 = data2.current.relative_humidity_2m;
  const humidityDiff = Math.abs(humidity1 - humidity2);
  const moreHumid = humidity1 > humidity2 ? state.settings.city1.name : state.settings.city2.name;

  const uv1 = data1.current.uv_index || 0;
  const uv2 = data2.current.uv_index || 0;
  const uvDiff = Math.abs(uv1 - uv2);

  return {
    temp: `${warmer} is ${tempDiff.toFixed(1)}°F warmer than ${colder}`,
    humidity: `${moreHumid} is ${humidityDiff}% more humid`,
    uv: uvDiff > 2 ? `UV index differs by ${uvDiff.toFixed(1)} points` : 'Similar UV exposure'
  };
}

/* =========================== BEST PLACE SCORE ========================= */
/* 0 to 100 scale, higher is better */
function calculateBestPlace() {
  const { city1, city2 } = state.weather;
  if (!city1 || !city2) {
    return {
      winner: { key: 'city1', city: state.settings.city1.name, score: 0, reasons: [] },
      loser: { key: 'city2', city: state.settings.city2.name, score: 0, reasons: [] }
    };
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function scoreCity(city) {
    // Start at 50, add or subtract based on comfort, clamp to 0..100
    let s = 50;

    const t = city.current.temperature_2m;       // ideal band 70 to 80
    const h = city.current.relative_humidity_2m; // ideal near 50
    const uv = city.current.uv_index || 0;       // lower better
    const code = city.current.weather_code || 0; // clear better

    // Temperature, up to +25 for ideal, down to -25 for extreme
    const tempDiffFromIdeal = Math.abs(t - 75);
    const tempComponent = 25 * clamp01(1 - tempDiffFromIdeal / 30); // 0 to +25
    s += tempComponent - 25 * clamp01((tempDiffFromIdeal - 15) / 20); // small penalty if far outside

    // Humidity, up to +10 near 50, down to -10 if very high or very low
    const humDiff = Math.abs(h - 50);
    s += 10 * clamp01(1 - humDiff / 50) - 10 * clamp01((humDiff - 20) / 40);

    // UV penalty, up to -10 if UV > 8
    if (uv > 8) s -= 10 * clamp01((uv - 8) / 4);

    // Precip or snow penalty
    if (code > 60 && code <= 67) s -= 10;  // rain
    if (code > 67) s -= 20;                // snow or storms

    // Clamp to 0..100
    s = Math.max(0, Math.min(100, Math.round(s)));
    return s;
  }

  const s1 = scoreCity(city1);
  const s2 = scoreCity(city2);

  const winnerKey = s1 >= s2 ? 'city1' : 'city2';
  const loserKey = winnerKey === 'city1' ? 'city2' : 'city1';
  const winnerCity = state.settings[winnerKey].name;
  const loserCity = state.settings[loserKey].name;

  const reasons = [];
  if (s1 !== s2) {
    const w = state.weather[winnerKey];
    const l = state.weather[loserKey];
    if (w.current.temperature_2m < 85 && l.current.temperature_2m > 85) reasons.push('More comfortable temperature');
    if (Math.abs(w.current.temperature_2m - 75) < Math.abs(l.current.temperature_2m - 75)) reasons.push('Closer to ideal temp');
    if (w.current.relative_humidity_2m < l.current.relative_humidity_2m) reasons.push('Less humidity');
    if ((w.current.uv_index || 0) < (l.current.uv_index || 0)) reasons.push('Lower UV exposure');
    if ((w.current.weather_code || 0) < (l.current.weather_code || 0)) reasons.push('Better weather conditions');
  }

  return {
    winner: { key: winnerKey, city: winnerCity, score: winnerKey === 'city1' ? s1 : s2, reasons },
    loser: { key: loserKey, city: loserCity, score: loserKey === 'city1' ? s1 : s2, reasons: [] }
  };
}

/* ============================ INSIGHTS RENDER ========================= */

function renderInsightsView(city1, city2, theme) {
  const advice1 = getWeatherAdvice(city1, state.aqi.city1);
  const advice2 = getWeatherAdvice(city2, state.aqi.city2);
  const streak1 = state.streaks.city1;
  const streak2 = state.streaks.city2;
  
  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      ${renderInsightCard(city1, state.settings.city1.name, advice1, streak1, state.historical.city1, theme, 'city1', 'slide-in-left')}
      ${renderInsightCard(city2, state.settings.city2.name, advice2, streak2, state.historical.city2, theme, 'city2', 'slide-in-right')}
    </div>
  `;
}

function renderInsightCard(data, cityName, advice, streak, historical, theme, cityKey, animationClass) {
  const aqiData = state.aqi[cityKey];
  const aqiInfo = getAQILevel(aqiData?.current?.us_aqi);
  
  let historicalHTML = '';
  if (historical && historical.daily) {
    const daily = data.daily;
    const todayIdx = findStartIdxTodayOrNext(daily.time);

    const lastYearHigh = historical.daily.temperature_2m_max[0];
    const lastYearLow = historical.daily.temperature_2m_min[0];
    const currentHigh = daily.temperature_2m_max[todayIdx];
    const diff = Number((currentHigh - lastYearHigh).toFixed(1));
    const warmerCooler = diff > 0 ? 'warmer' : 'cooler';

    historicalHTML = `
      <div class="${theme.card} ${theme.border} border rounded-xl p-4 fade-in" style="animation-delay: 0.5s;">
        <div class="${theme.text} font-medium mb-2">📅 This Day Last Year</div>
        <div class="text-sm ${theme.text} opacity-80">
          <div>High: ${Math.round(lastYearHigh)}° / Low: ${Math.round(lastYearLow)}°</div>
          <div class="mt-2">Today is ${Math.abs(diff)}° ${warmerCooler} than last year</div>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="${theme.card} ${theme.border} border rounded-2xl p-6 mobile-p-4 ${animationClass}">
      <h2 class="text-2xl font-light mb-6 ${theme.text} fade-in">${cityName}</h2>
      
      <div class="${theme.card} ${theme.border} border rounded-xl p-4 mb-4 fade-in" style="animation-delay: 0.1s;">
        <div class="${theme.text} font-medium mb-2">💡 Weather Advice</div>
        <div class="space-y-2">
          ${advice.map((a, i) => `<div class="text-sm ${theme.text} opacity-80 fade-in" style="animation-delay: ${0.2 + i * 0.1}s;">• ${a}</div>`).join('')}
        </div>
      </div>
      
      ${aqiData ? `
        <div class="${theme.card} ${theme.border} border rounded-xl p-4 mb-4 fade-in" style="animation-delay: 0.3s;">
          <div class="${theme.text} font-medium mb-2">🌫️ Air Quality Index</div>
          <div class="flex items-center justify-between">
            <div>
              <div class="text-3xl ${aqiInfo.color} number-roll">${Math.round(aqiData.current.us_aqi)}</div>
              <div class="text-sm ${theme.text} opacity-60">${aqiInfo.level}</div>
            </div>
            <div class="text-sm ${theme.text} opacity-80 text-right">${aqiInfo.desc}</div>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2 text-xs ${theme.text} opacity-70">
            <div>PM2.5: ${aqiData.current.pm2_5?.toFixed(1) || 'N/A'} µg/m³</div>
            <div>PM10: ${aqiData.current.pm10?.toFixed(1) || 'N/A'} µg/m³</div>
          </div>
        </div>
      ` : ''}

      ${streak.count ? `
        <div class="${theme.card} ${theme.border} border rounded-xl p-4 mb-4 fade-in" style="animation-delay: 0.4s;">
          <div class="${theme.text} font-medium mb-2">🔥 Weather Streak</div>
          <div class="text-sm ${theme.text} opacity-80">
            ${streak.count} consecutive ${streak.lastCondition} day${streak.count > 1 ? 's' : ''}!
          </div>
        </div>
      ` : ''}

      ${historicalHTML}
    </div>
  `;
}

function renderChartsView(theme) {
  return `
    <div class="space-y-6 md:space-y-8">
      <div class="${theme.card} ${theme.border} border rounded-2xl p-4 md:p-6 fade-in">
        <h3 class="text-lg md:text-xl font-light mb-4 ${theme.text}">24-Hour Temperature Forecast</h3>
        <div style="height: 250px;"><canvas id="tempChart"></canvas></div>
      </div>
      
      <div class="${theme.card} ${theme.border} border rounded-2xl p-4 md:p-6 fade-in" style="animation-delay: 0.1s;">
        <h3 class="text-lg md:text-xl font-light mb-4 ${theme.text}">24-Hour UV Index</h3>
        <div style="height: 250px;"><canvas id="uvChart"></canvas></div>
      </div>
      
      <div class="${theme.card} ${theme.border} border rounded-2xl p-4 md:p-6 fade-in" style="animation-delay: 0.2s;">
        <h3 class="text-lg md:text-xl font-light mb-4 ${theme.text}">7-Day Temperature Range</h3>
        <div style="height: 250px;"><canvas id="weeklyChart"></canvas></div>
      </div>
      
      ${state.history30Days.city1.length > 0 ? `
        <div class="${theme.card} ${theme.border} border rounded-2xl p-4 md:p-6 fade-in" style="animation-delay: 0.3s;">
          <h3 class="text-lg md:text-xl font-light mb-4 ${theme.text}">📅 30-Day Temperature History</h3>
          <div style="height: 300px;"><canvas id="history30Chart"></canvas></div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderSettings(theme) {
  return `
    <div class="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
      <div class="${theme.card} ${theme.border} border rounded-2xl p-6 md:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-xl md:text-2xl font-light ${theme.text}">Settings</h2>
          <button onclick="state.showSettings = false; render();" class="${theme.text} opacity-60 hover:opacity-100 text-2xl">×</button>
        </div>

        <div class="space-y-6">
          <div>
            <label class="block ${theme.text} mb-2">City 1</label>
            <input id="city1Name" value="${state.settings.city1.name}" class="w-full ${theme.card} ${theme.border} border rounded-xl px-4 py-3 ${theme.text}">
            <div class="grid grid-cols-2 gap-4 mt-2">
              <input id="city1Lat" type="number" step="0.0001" value="${state.settings.city1.lat}" placeholder="Latitude" class="${theme.card} ${theme.border} border rounded-xl px-4 py-2 ${theme.text}">
              <input id="city1Lon" type="number" step="0.0001" value="${state.settings.city1.lon}" placeholder="Longitude" class="${theme.card} ${theme.border} border rounded-xl px-4 py-2 ${theme.text}">
            </div>
          </div>

          <div>
            <label class="block ${theme.text} mb-2">City 2</label>
            <input id="city2Name" value="${state.settings.city2.name}" class="w-full ${theme.card} ${theme.border} border rounded-xl px-4 py-3 ${theme.text}">
            <div class="grid grid-cols-2 gap-4 mt-2">
              <input id="city2Lat" type="number" step="0.0001" value="${state.settings.city2.lat}" placeholder="Latitude" class="${theme.card} ${theme.border} border rounded-xl px-4 py-2 ${theme.text}">
              <input id="city2Lon" type="number" step="0.0001" value="${state.settings.city2.lon}" placeholder="Longitude" class="${theme.card} ${theme.border} border rounded-xl px-4 py-2 ${theme.text}">
            </div>
          </div>

          <div>
            <label class="block ${theme.text} mb-2">Temperature Unit</label>
            <select id="tempUnit" class="w-full ${theme.card} ${theme.border} border rounded-xl px-4 py-3 ${theme.text}">
              <option value="fahrenheit" ${state.settings.tempUnit === 'fahrenheit' ? 'selected' : ''}>Fahrenheit</option>
              <option value="celsius" ${state.settings.tempUnit === 'celsius' ? 'selected' : ''}>Celsius</option>
            </select>
          </div>

          <div>
            <label class="block ${theme.text} mb-2">Theme</label>
            <select id="theme" class="w-full ${theme.card} ${theme.border} border rounded-xl px-4 py-3 ${theme.text}">
              ${Object.entries(THEMES).map(([key, t]) => 
                `<option value="${key}" ${state.settings.theme === key ? 'selected' : ''}>${t.name}</option>`
              ).join('')}
            </select>
          </div>

          <div class="flex items-center justify-between">
            <span class="${theme.text}">Weather Animations</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="animations" ${state.settings.animations ? 'checked' : ''} class="sr-only peer">
              <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <button onclick="saveSettings()" class="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-medium transition-colors">
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ============================== SETTINGS ============================== */

function saveSettings() {
  state.settings = {
    city1: {
      name: document.getElementById('city1Name').value,
      lat: parseFloat(document.getElementById('city1Lat').value),
      lon: parseFloat(document.getElementById('city1Lon').value)
    },
    city2: {
      name: document.getElementById('city2Name').value,
      lat: parseFloat(document.getElementById('city2Lat').value),
      lon: parseFloat(document.getElementById('city2Lon').value)
    },
    tempUnit: document.getElementById('tempUnit').value,
    theme: document.getElementById('theme').value,
    animations: document.getElementById('animations').checked,
    autoRefresh: state.settings.autoRefresh
  };
  localStorage.setItem('weatherSettings', JSON.stringify(state.settings));
  state.showSettings = false;
  loadWeather();
}

/* ================================ STREAKS ============================= */

function updateStreaks() {
  const today = new Date().toDateString();
  ['city1', 'city2'].forEach(city => {
    const data = state.weather[city];
    if (!data) return;

    const code = data.current.weather_code;
    const condition = code === 0 ? 'sunny' : code <= 67 ? 'rainy' : 'snowy';

    if (!state.streaks[city].lastDate || state.streaks[city].lastDate !== today) {
      if (state.streaks[city].lastCondition === condition) {
        state.streaks[city].count = (state.streaks[city].count || 0) + 1;
      } else {
        state.streaks[city].count = 1;
        state.streaks[city].lastCondition = condition;
      }
      state.streaks[city].lastDate = today;
    }
  });
  localStorage.setItem('weatherStreaks', JSON.stringify(state.streaks));
}

function checkWeatherChanges() {
  ['city1', 'city2'].forEach(city => {
    const prev = state.previousWeather[city];
    const curr = state.weather[city];
    if (!prev || !curr) return;

    const tempChange = Math.abs(curr.current.temperature_2m - prev.current.temperature_2m);
    if (tempChange > 2) triggerWeatherTransition();

    if (curr.current.weather_code !== prev.current.weather_code) triggerWeatherTransition();
  });
}

function triggerWeatherTransition() {
  if (!state.settings.animations) return;
  setTimeout(() => {
    const cards = document.querySelectorAll('.weather-card');
    cards.forEach(card => {
      card.classList.add('weather-transition');
      setTimeout(() => card.classList.remove('weather-transition'), 1200);
    });
  }, 100);
}

/* ================================ INIT ================================ */

async function loadWeather() {
  try {
    if (!document.getElementById('app')) {
      const a = document.createElement('div');
      a.id = 'app';
      document.body.appendChild(a);
    }

    state.loading = true;
    state.error = null;

    if (state.weather.city1 && state.weather.city2) {
      state.previousWeather = {
        city1: JSON.parse(JSON.stringify(state.weather.city1)),
        city2: JSON.parse(JSON.stringify(state.weather.city2))
      };
    }

    try { render(); } catch (e) {
      console.error('Render while loading failed:', e);
    }

    const [data1, data2, aqi1, aqi2, hist1, hist2, history1, history2] = await Promise.all([
      fetchWeather(state.settings.city1.lat, state.settings.city1.lon),
      fetchWeather(state.settings.city2.lat, state.settings.city2.lon),
      fetchAQI(state.settings.city1.lat, state.settings.city1.lon),
      fetchAQI(state.settings.city2.lat, state.settings.city2.lon),
      fetchHistoricalWeather(state.settings.city1.lat, state.settings.city1.lon),
      fetchHistoricalWeather(state.settings.city2.lat, state.settings.city2.lon),
      fetch30DayHistory(state.settings.city1.lat, state.settings.city1.lon),
      fetch30DayHistory(state.settings.city2.lat, state.settings.city2.lon)
    ]);

    state.weather = { city1: data1, city2: data2 };
    state.aqi = { city1: aqi1, city2: aqi2 };
    state.historical = { city1: hist1, city2: hist2 };
    state.history30Days = { city1: history1, city2: history2 };
    state.lastUpdate = new Date();

    updateStreaks();
    updateWeatherAnimation();

    if (state.previousWeather.city1) {
      checkWeatherChanges();
    }
  } catch (error) {
    console.error('Error:', error);
    state.error = String(error && error.message ? error.message : error);
  } finally {
    state.loading = false;
    try { render(); } catch (e) {
      console.error('Render after load failed:', e);
      const app = document.getElementById('app');
      if (app) {
        app.innerHTML = `<div style="padding:16px;color:#fca5a5;">UI failed to render. ${e}</div>`;
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  if (!document.getElementById('app')) {
    const a = document.createElement('div');
    a.id = 'app';
    document.body.appendChild(a);
  }
  loadWeather();
  if (state.settings.autoRefresh) {
    setInterval(loadWeather, 3600000);
  }
});
