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

/* ---------- Timezone safe helpers for America/New_York ---------- */

// "YYYY-MM-DD"
function todayYMD_NY() {
  const now = new Date();
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = ny.getFullYear();
  const m = String(ny.getMonth() + 1).padStart(2, '0');
  const d = String(ny.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "YYYY-MM-DDTHH:00"
function nyNowHourKey() {
  const now = new Date();
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = ny.getFullYear();
  const m = String(ny.getMonth() + 1).padStart(2, '0');
  const d = String(ny.getDate()).padStart(2, '0');
  const H = String(ny.getHours()).padStart(2, '0');
  return `${y}-${m}-${d}T${H}:00`;
}

// find today, else first future day by ISO string compare
function findStartIdxTodayOrNext(dates) {
  const today = todayYMD_NY();
  let idx = dates.findIndex(d => d === today);
  if (idx >= 0) return idx;
  idx = dates.findIndex(d => d > today);
  return idx >= 0 ? idx : 0;
}

// format "YYYY-MM-DDTHH:mm" into "h:mm AM/PM" without Date parsing
function formatLocalClock(s) {
  if (!s) return '';
  const hh = parseInt(s.slice(11, 13), 10);
  const mm = s.slice(14, 16);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${mm} ${ampm}`;
}

const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// "YYYY-MM-DD" -> "Mon, Oct 26" using UTC calendar so weekday matches the date
function weekdayMonthDay(ymd) {
  const d = new Date(ymd + 'T00:00:00Z');
  const wd = WEEKDAYS[d.getUTCDay()];
  const m = MONTHS_SHORT[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${wd}, ${m} ${day}`;
}

// "YYYY-MM-DD" -> "Oct 26"
function monthDayShort(ymd) {
  const d = new Date(ymd + 'T00:00:00Z');
  const m = MONTHS_SHORT[d.getUTCMonth()];
  const day = d.getUTCDate();
  return `${m} ${day}`;
}

/* ------------------------------- Animator ------------------------------ */

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
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');
    this.ctx = ctx;

    this.particles = [];
    this._raf = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
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
    this.particles = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  createRain() {
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
    this.clear();
    this.animateSunny();
  }

  animateSunny() {
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
  if (!state.settings.animations) {
    animator.clear();
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

/* ----------------------------- Data fetchers --------------------------- */

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,uv_index,visibility` +
    `&hourly=temperature_2m,precipitation_probability,weather_code,uv_index,wind_speed_10m,time` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,wind_speed_10m_max,uv_index_max,time` +
    `&forecast_days=7` +
    `&temperature_unit=${state.settings.tempUnit}` +
    `&wind_speed_unit=mph` +
    `&timezone=America%2FNew_York` +
    `&past_days=0`;
  const response = await fetch(url);
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
    const response = await fetch(url);
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
    const response = await fetch(url);
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
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

/* ------------------------------ Share utils ---------------------------- */

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

    const downloadPNG = () => {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    if (navigator.canShare || navigator.share) {
      canvas.toBlob(async blob => {
        if (!blob) {
          downloadPNG();
          return;
        }

        let fileObj;
        try {
          fileObj = new File([blob], fileName, { type: 'image/png' });
        } catch {
          fileObj = blob;
        }

        if (navigator.canShare && navigator.canShare({ files: [fileObj] })) {
          try {
            await navigator.share({
              files: [fileObj],
              title: 'Armstrong Weather Dashboard',
              text: `Weather comparison, ${state.settings.city1.name} vs ${state.settings.city2.name}`
            });
            return;
          } catch {
            downloadPNG();
            return;
          }
        }

        const dataUrl = canvas.toDataURL('image/png');
        try {
          await navigator.share({
            title: 'Armstrong Weather Dashboard',
            text: `Weather comparison, ${state.settings.city1.name} vs ${state.settings.city2.name}`,
            url: dataUrl
          });
        } catch {
          downloadPNG();
        }
      }, 'image/png');
    } else {
      downloadPNG();
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

/* --------------------------------- Load -------------------------------- */

async function loadWeather() {
  state.loading = true;
  state.error = null;

  if (state.weather.city1 && state.weather.city2) {
    state.previousWeather = {
      city1: JSON.parse(JSON.stringify(state.weather.city1)),
      city2: JSON.parse(JSON.stringify(state.weather.city2))
    };
  }

  render();

  try {
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
    state.error = error.message;
    console.error('Error:', error);
  }

  state.loading = false;
  render();
}

/* ----------------------------- Comparisons ----------------------------- */

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

/* ------------------------------- UI utils ------------------------------ */

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
  jd
