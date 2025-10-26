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

/* ---------- Helpers for New York local time, no Date parsing of OM strings ---------- */

// "2025-10-26"
function todayYMD_NY() {
  const now = new Date();
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = ny.getFullYear();
  const m = String(ny.getMonth() + 1).padStart(2, '0');
  const d = String(ny.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "2025-10-26T14:00"
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

// "YYYY-MM-DDTHH:MM" to "h:mm AM/PM", no Date parsing
function formatLocalClock(s) {
  if (!s) return '';
  const hh = parseInt(s.slice(11, 13), 10);
  const mm = s.slice(14, 16);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${mm} ${ampm}`;
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
    `&hourly=temperature_2m,precipitation_probability,weather_code,uv_index,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,wind_speed_10m_max,uv_index_max` +
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
  } catch (e) {
    return [];
  }
}

async function fetchAQI(lat, lon) {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
  } catch (e) {
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
  } catch (e) {
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
    { name: 'Last Quarter', emoji: '🌗' },
    { name: 'Waning Crescent', emoji: '🌘' }
  ];
  return phases[b];
}

function calculateBestPlace() {
  const c1 = state.weather.city1;
  const c2 = state.weather.city2;

  let score1 = 0, score2 = 0;
  const reasons1 = [], reasons2 = [];

  const temp1 = c1.current.temperature_2m;
  const temp2 = c2.current.temperature_2m;

  const idealTemp = 72;
  const tempScore1 = 100 - Math.abs(temp1 - idealTemp) * 2;
  const tempScore2 = 100 - Math.abs(temp2 - idealTemp) * 2;
  score1 += Math.max(0, tempScore1);
  score2 += Math.max(0, tempScore2);

  if (tempScore1 > tempScore2) reasons1.push(`Better temperature (${Math.round(temp1)}°F)`);
  else if (tempScore2 > tempScore1) reasons2.push(`Better temperature (${Math.round(temp2)}°F)`);

  if (c1.current.weather_code === 0) { score1 += 50; reasons1.push('Clear skies'); }
  if (c2.current.weather_code === 0) { score2 += 50; reasons2.push('Clear skies'); }

  if (c1.current.weather_code > 60) { score1 -= 30; reasons2.push('No precipitation'); }
  if (c2.current.weather_code > 60) { score2 -= 30; reasons1.push('No precipitation'); }

  const humidity1 = c1.current.relative_humidity_2m;
  const humidity2 = c2.current.relative_humidity_2m;
  const humidityScore1 = 50 - Math.abs(humidity1 - 50);
  const humidityScore2 = 50 - Math.abs(humidity2 - 50);
  score1 += humidityScore1;
  score2 += humidityScore2;

  if (humidityScore1 > humidityScore2 + 10) reasons1.push('Comfortable humidity');
  else if (humidityScore2 > humidityScore1 + 10) reasons2.push('Comfortable humidity');

  const uv1 = c1.current.uv_index || 0;
  const uv2 = c2.current.uv_index || 0;
  if (uv1 < 3) { score1 += 20; reasons1.push('Low UV exposure'); }
  if (uv2 < 3) { score2 += 20; reasons2.push('Low UV exposure'); }

  const aqi1 = state.aqi.city1?.current?.us_aqi || 50;
  const aqi2 = state.aqi.city2?.current?.us_aqi || 50;
  score1 += Math.max(0, (100 - aqi1) / 2);
  score2 += Math.max(0, (100 - aqi2) / 2);

  if (aqi1 < 50) reasons1.push('Excellent air quality');
  if (aqi2 < 50) reasons2.push('Excellent air quality');

  const winner = score1 > score2 ?
    { city: state.settings.city1.name, score: Math.round(score1), reasons: reasons1, key: 'city1' } :
    { city: state.settings.city2.name, score: Math.round(score2), reasons: reasons2, key: 'city2' };

  const loser = score1 > score2 ?
    { city: state.settings.city2.name, score: Math.round(score2), key: 'city2' } :
    { city: state.settings.city1.name, score: Math.round(score1), key: 'city1' };

  return { winner, loser };
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
  if (weatherCode === 0) advice.push('☀️ Beautiful day. Perfect for outdoor activities');
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

/* ------------------------------- Charts -------------------------------- */

function createChart(canvasId, type, data, options) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (canvas.chart) canvas.chart.destroy();
  canvas.chart = new Chart(ctx, { type, data, options });
}

function prepare24HourData() {
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
    date: new Date(date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
        { label: state.settings.city2.name, data: hourlyData.map(d => d.temp2), borderColor: 'rgb(245, 158, 11)', tension: 0.4
