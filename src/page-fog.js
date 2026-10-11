import { createShader, isWebGPUSupported } from "shaders/js";

const canvas = document.querySelector("#page-fog");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const night = { colorA: "#141a24", colorB: "#3c516c", theme: "dark" };
const dawn = { colorA: "#ebdccd", colorB: "#c7c7c7", theme: "light" };
const day = { colorA: "#c7cadd", colorB: "#96b0ea", theme: "light" };
const dusk = { colorA: "#ead3c2", colorB: "#c9aea8", theme: "light" };

const skies = [
  { at: 0, ...night },
  { at: 5, ...night },
  { at: 5, ...dawn },
  { at: 7, ...dawn },
  { at: 9.5, ...day },
  { at: 16, ...day },
  { at: 17, ...dusk },
  { at: 18, ...dusk },
  { at: 18, ...night },
  { at: 24, ...night },
];

function mixHex(from, to, t) {
  const start = parseInt(from.slice(1), 16);
  const end = parseInt(to.slice(1), 16);
  const channel = (shift) => Math.round(((start >> shift) & 255) * (1 - t) + ((end >> shift) & 255) * t);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

const namedSkies = { night: 2, dawn: 7, day: 12, dusk: 17.5 };

function skyHour() {
  const value = new URLSearchParams(location.search).get("sky");
  if (!value) return null;
  if (value in namedSkies) return namedSkies[value];
  const hour = Number(value);
  if (Number.isFinite(hour) && hour >= 0 && hour < 24) return hour;
  return null;
}

function skyAt(date = new Date()) {
  const hour = skyHour() ?? date.getHours() + date.getMinutes() / 60;
  let index = 0;
  while (index < skies.length - 1 && hour >= skies[index + 1].at) index += 1;
  const from = skies[index];
  const to = skies[index + 1];
  const t = (hour - from.at) / (to.at - from.at);
  return {
    colorA: mixHex(from.colorA, to.colorA, t),
    colorB: mixHex(from.colorB, to.colorB, t),
    theme: from.theme,
  };
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#141a24" : "#f7f7f3";
}

const rainColor = {
  dark: { colorA: "#d5e2ef", colorB: "#d5e2ef00" },
  light: { colorA: "#7d92a6", colorB: "#7d92a600" },
};

function rainOverride() {
  const value = new URLSearchParams(location.search).get("rain");
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

function isRainCode(code) {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}

async function rainingNow() {
  const forced = rainOverride();
  if (forced !== null) return forced;
  const { lat, lon } = canvas.dataset;
  if (!lat || !lon) return false;
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat);
    url.searchParams.set("longitude", lon);
    url.searchParams.set("current", "weather_code,precipitation");
    const response = await fetch(url);
    if (!response.ok) return false;
    const data = await response.json();
    const code = Number(data.current?.weather_code);
    const precipitation = Number(data.current?.precipitation);
    return isRainCode(code) || precipitation > 0.1;
  } catch {
    return false;
  }
}

applyTheme(skyAt().theme);

if (!(canvas instanceof HTMLCanvasElement) || reducedMotion || !isWebGPUSupported()) {
  canvas?.remove();
  const clock = setInterval(() => applyTheme(skyAt().theme), 60_000);
  addEventListener("pagehide", () => clearInterval(clock), { once: true });
} else {
  const sky = skyAt();
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  try {
    const shader = await createShader(canvas, {
      components: [{
        id: "mist",
        type: "Fog",
        props: {
          ...sky,
          colorSpace: "oklab",
          speed: 0.45,
          turbulence: 0.28,
          detail: 14,
          blending: 0.58,
          mouseInfluence: 0.55,
          mouseRadius: 0.055,
        },
      }, {
        id: "rain",
        type: "FallingLines",
        props: {
          ...rainColor[sky.theme],
          colorSpace: "oklab",
          angle: 102,
          speed: 1.6,
          speedVariance: 0.6,
          density: 46,
          trailLength: 0.09,
          balance: 0.78,
          strokeWidth: 0.035,
          rounding: 1,
          opacity: 0.72,
          visible: rainOverride() === true,
        },
      }],
    }, {
      disableTelemetry: true,
      onError(reason) {
        console.warn("page fog stopped:", reason);
        shader?.destroy();
        canvas.remove();
      },
    });

    let shownA = sky.colorA;
    let shownB = sky.colorB;
    let shownTheme = sky.theme;
    const applySky = () => {
      const next = skyAt();
      applyTheme(next.theme);
      if (next.theme !== shownTheme) {
        shownTheme = next.theme;
        shader.update("rain", rainColor[next.theme]);
      }
      if (next.colorA === shownA && next.colorB === shownB) return;
      shownA = next.colorA;
      shownB = next.colorB;
      shader.update("mist", { colorA: next.colorA, colorB: next.colorB });
    };
    const clock = setInterval(applySky, 60_000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") applySky();
    });
    shader.update("mist", { colorA: sky.colorA, colorB: sky.colorB });

    let rainShown = rainOverride() === true;
    const applyRain = async () => {
      const next = await rainingNow();
      if (next === rainShown) return;
      rainShown = next;
      shader.update("rain", { visible: next });
    };
    applyRain();
    const weather = setInterval(applyRain, 15 * 60_000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") applyRain();
    });
    addEventListener("pagehide", () => {
      clearInterval(clock);
      clearInterval(weather);
    }, { once: true });
  } catch (error) {
    console.warn("page fog stopped:", error);
    canvas.remove();
  }
}
