const state = {
  weather: { city1: null, city2: null },
  loading: true,
  error: null,
  lastUpdate: null,
  showSettings: false,
  activeTab: 'overview',
  settings: JSON.parse(localStorage.getItem('weatherSettings')) || {
    city1: { name: 'Oneonta, NY', lat: 42.4528, lon: -75.0638 },
    city2: { name: 'Gray Court, SC', lat: 34.6193, lon: -82.0787 },
    tempUnit: 'fahrenheit',
    autoRefresh: true
  }
};

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,uv_index,visibility&hourly=temperature_2m,precipitation_probability,weather_code,uv_index,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,wind_speed_10m_max,uv_index_max&temperature_unit=${state.settings.tempUnit}&wind_speed_unit=mph&timezone=America%2FNew_York`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return response.json();
}

async function loadWeather() {
  state.loading = true;
  state.error = null;
  render();
  
  try {
    const [data1, data2] = await Promise.all([
      fetchWeather(state.settings.city1.lat, state.settings.city1.lon),
      fetchWeather(state.settings.city2.lat, state.settings.city2.lon)
    ]);
    state.weather = { city1: data1, city2: data2 };
    state.lastUpdate = new Date();
  } catch (error) {
    state.error = error.message;
    console.error('Error:', error);
  }
  
  state.loading = false;
  render();
}

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

function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function createChart(canvasId, type, data, options) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (canvas.chart) canvas.chart.destroy();
  canvas.chart = new Chart(ctx, { type, data, options });
}

function renderCharts() {
  if (!state.weather.city1 || !state.weather.city2) return;

  const hourlyData = prepare24HourData();
  const weeklyData = prepare7DayData();

  setTimeout(() => {
    createChart('tempChart', 'line', {
      labels: hourlyData.map(d => d.time),
      datasets: [
        {
          label: state.settings.city1.name,
          data: hourlyData.map(d => d.temp1),
          borderColor: 'rgb(59, 130, 246)',
          tension: 0.4
        },
        {
          label: state.settings.city2.name,
          data: hourlyData.map(d => d.temp2),
          borderColor: 'rgb(245, 158, 11)',
          tension: 0.4
        }
      ]
    }, {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#fff' } } },
      scales: {
        x: { ticks: { color: '#aaa' }, grid: { color: '#333' } },
        y: { ticks: { color: '#aaa' }, grid: { color: '#333' } }
      }
    });

    createChart('uvChart', 'line', {
      labels: hourlyData.map(d => d.time),
      datasets: [
        {
          label: state.settings.city1.name,
          data: hourlyData.map(d => d.uv1),
          borderColor: 'rgb(249, 115, 22)',
          tension: 0.4
        },
        {
          label: state.settings.city2.name,
          data: hourlyData.map(d => d.uv2),
          borderColor: 'rgb(236, 72, 153)',
          tension: 0.4
        }
      ]
    }, {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#fff' } } },
      scales: {
        x: { ticks: { color: '#aaa' }, grid: { color: '#333' } },
        y: { ticks: { color: '#aaa' }, grid: { color: '#333' } }
      }
    });

    createChart('weeklyChart', 'bar', {
      labels: weeklyData.map(d => d.date),
      datasets: [
        { label: `${state.settings.city1.name} High`, data: weeklyData.map(d => d.high1), backgroundColor: 'rgba(59, 130, 246, 0.8)' },
        { label: `${state.settings.city1.name} Low`, data: weeklyData.map(d => d.low1), backgroundColor: 'rgba(30, 64, 175, 0.8)' },
        { label: `${state.settings.city2.name} High`, data: weeklyData.map(d => d.high2), backgroundColor: 'rgba(245, 158, 11, 0.8)' },
        { label: `${state.settings.city2.name} Low`, data: weeklyData.map(d => d.low2), backgroundColor: 'rgba(180, 83, 9, 0.8)' }
      ]
    }, {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#fff' } } },
      scales: {
        x: { ticks: { color: '#aaa' }, grid: { color: '#333' } },
        y: { ticks: { color: '#aaa' }, grid: { color: '#333' } }
      }
    });
  }, 100);
}

function prepare24HourData() {
  const now = new Date();
  const currentHour = now.getHours();
  const hourly1 = state.weather.city1.hourly;
  const hourly2 = state.weather.city2.hourly;
  
  return Array.from({ length: 24 }, (_, i) => {
    const index = currentHour + i;
    const time = new Date(now);
    time.setHours(currentHour + i, 0, 0, 0);
    
    return {
      time: time.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
      temp1: Math.round(hourly1.temperature_2m?.[index] || 0),
      temp2: Math.round(hourly2.temperature_2m?.[index] || 0),
      uv1: Math.max(0, hourly1.uv_index?.[index] || 0),
      uv2: Math.max(0, hourly2.uv_index?.[index] || 0)
    };
  });
}

function prepare7DayData() {
  const daily1 = state.weather.city1.daily;
  const daily2 = state.weather.city2.daily;
  
  return daily1.time.slice(0, 7).map((date, i) => ({
    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    high1: Math.round(daily1.temperature_2m_max?.[i] || 0),
    low1: Math.round(daily1.temperature_2m_min?.[i] || 0),
    high2: Math.round(daily2.temperature_2m_max?.[i] || 0),
    low2: Math.round(daily2.temperature_2m_min?.[i] || 0)
  }));
}

function render() {
  const app = document.getElementById('app');
  
  if (state.loading) {
    app.innerHTML = `
      <div class="min-h-screen bg-black flex items-center justify-center">
        <div class="text-2xl text-zinc-400">Loading weather data...</div>
      </div>
    `;
    return;
  }

  if (state.error) {
    app.innerHTML = `
      <div class="min-h-screen bg-black flex items-center justify-center p-8">
        <div class="text-center max-w-2xl">
          <div class="text-2xl text-red-400 mb-4">⚠️ Error Loading Weather Data</div>
          <div class="text-zinc-400 mb-4">${state.error}</div>
          <button onclick="loadWeather()" class="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl transition-colors">
            Try Again
          </button>
        </div>
      </div>
    `;
    return;
  }

  const { city1, city2 } = state.weather;
  if (!city1 || !city2) return;

  app.innerHTML = `
    <div class="min-h-screen bg-black text-white p-8">
      <div class="max-w-7xl mx-auto">
        <div class="flex justify-between items-center mb-8">
          <h1 class="text-4xl font-light">Weather Comparison</h1>
          <div class="flex gap-4">
            <button onclick="loadWeather()" class="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl transition-colors">
              🔄 Refresh
            </button>
            <button onclick="state.showSettings = true; render();" class="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl transition-colors">
              ⚙️ Settings
            </button>
          </div>
        </div>

        ${state.lastUpdate ? `<div class="text-zinc-500 text-sm mb-6">Last updated: ${state.lastUpdate.toLocaleString()}</div>` : ''}

        <div class="flex gap-2 mb-6">
          <button onclick="state.activeTab = 'overview'; render();" class="px-6 py-3 rounded-xl transition-colors ${state.activeTab === 'overview' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}">
            Overview
          </button>
          <button onclick="state.activeTab = 'charts'; render(); renderCharts();" class="px-6 py-3 rounded-xl transition-colors ${state.activeTab === 'charts' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}">
            📊 Charts & Analytics
          </button>
        </div>

        ${state.activeTab === 'overview' ? renderOverview(city1, city2) : renderChartsView()}
      </div>

      ${state.showSettings ? renderSettings() : ''}
    </div>
  `;
}

function renderOverview(city1, city2) {
  return `
    <div class="flex flex-col lg:flex-row gap-6">
      ${renderWeatherCard(city1, state.settings.city1.name)}
      ${renderWeatherCard(city2, state.settings.city2.name)}
    </div>
  `;
}

function renderWeatherCard(data, cityName) {
  const current = data.current;
  const daily = data.daily;
  const uvInfo = getUVLevel(current.uv_index || 0);

  return `
    <div class="flex-1 bg-zinc-900 rounded-2xl p-8 border border-zinc-800">
      <h2 class="text-2xl font-light mb-8 text-zinc-100">${cityName}</h2>
      
      <div class="mb-8">
        <div class="flex items-center gap-4 mb-6">
          <span class="text-7xl">${getWeatherIcon(current.weather_code)}</span>
          <div>
            <div class="text-6xl font-light text-zinc-100">${Math.round(current.temperature_2m)}°</div>
            <div class="text-zinc-400 text-lg">Feels like ${Math.round(current.apparent_temperature)}°</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="bg-zinc-800 rounded-xl p-4">
            <div class="text-zinc-400 text-sm mb-2">💧 Humidity</div>
            <div class="text-2xl text-zinc-100">${current.relative_humidity_2m}%</div>
          </div>
          <div class="bg-zinc-800 rounded-xl p-4">
            <div class="text-zinc-400 text-sm mb-2">💨 Wind</div>
            <div class="text-2xl text-zinc-100">${Math.round(current.wind_speed_10m)} mph</div>
          </div>
          <div class="bg-zinc-800 rounded-xl p-4">
            <div class="text-zinc-400 text-sm mb-2">☀️ UV Index</div>
            <div class="text-2xl text-zinc-100">${Math.round(current.uv_index || 0)} <span class="text-sm ${uvInfo.color}">${uvInfo.level}</span></div>
          </div>
          <div class="bg-zinc-800 rounded-xl p-4">
            <div class="text-zinc-400 text-sm mb-2">👁️ Visibility</div>
            <div class="text-2xl text-zinc-100">${Math.round((current.visibility || 0) / 1609.34)} mi</div>
          </div>
          <div class="bg-zinc-800 rounded-xl p-4">
            <div class="text-zinc-400 text-sm mb-2">🌅 Sunrise</div>
            <div class="text-xl text-zinc-100">${formatTime(daily.sunrise[0])}</div>
          </div>
          <div class="bg-zinc-800 rounded-xl p-4">
            <div class="text-zinc-400 text-sm mb-2">🌇 Sunset</div>
            <div class="text-xl text-zinc-100">${formatTime(daily.sunset[0])}</div>
          </div>
        </div>
      </div>

      <div>
        <h3 class="text-lg font-light mb-4 text-zinc-300">7-Day Forecast</h3>
        <div class="space-y-2">
          ${daily.time.slice(0, 7).map((date, i) => {
            const dayUV = getUVLevel(daily.uv_index_max[i] || 0);
            return `
              <div class="flex items-center justify-between bg-zinc-800 rounded-xl p-3">
                <span class="text-zinc-300 w-28 text-sm">${new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                <span class="text-2xl">${getWeatherIcon(daily.weather_code[i])}</span>
                <div class="flex gap-4 items-center text-sm">
                  <span class="text-zinc-400">💧 ${daily.precipitation_probability_max[i]}%</span>
                  <span class="${dayUV.color}">☀️ ${Math.round(daily.uv_index_max[i] || 0)}</span>
                  <span class="text-zinc-100 font-medium">${Math.round(daily.temperature_2m_max[i])}°</span>
                  <span class="text-zinc-500">${Math.round(daily.temperature_2m_min[i])}°</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderChartsView() {
  return `
    <div class="space-y-8">
      <div class="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
        <h3 class="text-xl font-light mb-4 text-zinc-100">24-Hour Temperature Forecast</h3>
        <div style="height: 300px;"><canvas id="tempChart"></canvas></div>
      </div>
      
      <div class="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
        <h3 class="text-xl font-light mb-4 text-zinc-100">24-Hour UV Index</h3>
        <div style="height: 300px;"><canvas id="uvChart"></canvas></div>
      </div>
      
      <div class="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
        <h3 class="text-xl font-light mb-4 text-zinc-100">7-Day Temperature Range</h3>
        <div style="height: 300px;"><canvas id="weeklyChart"></canvas></div>
      </div>
    </div>
  `;
}

function renderSettings() {
  return `
    <div class="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
      <div class="bg-zinc-900 rounded-2xl p-8 max-w-2xl w-full mx-4 border border-zinc-800">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-light text-zinc-100">Settings</h2>
          <button onclick="state.showSettings = false; render();" class="text-zinc-400 hover:text-zinc-100 text-2xl">×</button>
        </div>

        <div class="space-y-6">
          <div>
            <label class="block text-zinc-300 mb-2">City 1</label>
            <input id="city1Name" value="${state.settings.city1.name}" class="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100">
            <div class="grid grid-cols-2 gap-4 mt-2">
              <input id="city1Lat" type="number" step="0.0001" value="${state.settings.city1.lat}" placeholder="Latitude" class="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-zinc-100">
              <input id="city1Lon" type="number" step="0.0001" value="${state.settings.city1.lon}" placeholder="Longitude" class="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-zinc-100">
            </div>
          </div>

          <div>
            <label class="block text-zinc-300 mb-2">City 2</label>
            <input id="city2Name" value="${state.settings.city2.name}" class="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100">
            <div class="grid grid-cols-2 gap-4 mt-2">
              <input id="city2Lat" type="number" step="0.0001" value="${state.settings.city2.lat}" placeholder="Latitude" class="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-zinc-100">
              <input id="city2Lon" type="number" step="0.0001" value="${state.settings.city2.lon}" placeholder="Longitude" class="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-zinc-100">
            </div>
          </div>

          <div>
            <label class="block text-zinc-300 mb-2">Temperature Unit</label>
            <select id="tempUnit" class="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100">
              <option value="fahrenheit" ${state.settings.tempUnit === 'fahrenheit' ? 'selected' : ''}>Fahrenheit</option>
              <option value="celsius" ${state.settings.tempUnit === 'celsius' ? 'selected' : ''}>Celsius</option>
            </select>
          </div>

          <button onclick="saveSettings()" class="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-medium transition-colors">
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  `;
}

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
    autoRefresh: state.settings.autoRefresh
  };
  localStorage.setItem('weatherSettings', JSON.stringify(state.settings));
  state.showSettings = false;
  loadWeather();
}

// Initialize
loadWeather();

// Auto-refresh every hour
if (state.settings.autoRefresh) {
  setInterval(loadWeather, 3600000);
}
