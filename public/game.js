const canvas = document.querySelector("#arena");
const ctx = canvas.getContext("2d");
const els = {
  statusTitle: document.querySelector("#statusTitle"),
  overlay: document.querySelector("#overlay"),
  overlayText: document.querySelector("#overlayText"),
  setupForm: document.querySelector("#setupForm"),
  playerName: document.querySelector("#playerName"),
  createButton: document.querySelector("#createButton"),
  joinButton: document.querySelector("#joinButton"),
  controls: document.querySelector("#gameControls"),
  readyButton: document.querySelector("#readyButton"),
  copyButton: document.querySelector("#copyButton"),
  gpsButton: document.querySelector("#gpsButton"),
  resetButton: document.querySelector("#resetButton"),
  soundToggle: document.querySelector("#soundToggle"),
  hostName: document.querySelector("#hostName"),
  guestName: document.querySelector("#guestName"),
  hostState: document.querySelector("#hostState"),
  guestState: document.querySelector("#guestState"),
  gpsStatus: document.querySelector("#gpsStatus"),
  directionStatus: document.querySelector("#directionStatus"),
  speedStatus: document.querySelector("#speedStatus")
};

const state = {
  game: null,
  token: localStorage.getItem("livetron:token") || "",
  role: localStorage.getItem("livetron:role") || "",
  desiredDir: "E",
  ready: false,
  gpsWatch: null,
  lastGps: null,
  speedMps: 0,
  sound: false,
  tickTimer: null,
  pollTimer: null
};

const pathGameId = location.pathname.startsWith("/game/") ? location.pathname.split("/").pop() : "";

els.setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = await api("create", { name: playerName() });
  acceptSession(data);
  history.replaceState(null, "", `/game/${data.game.id}`);
});

els.joinButton.addEventListener("click", async () => {
  if (!pathGameId && !state.game) {
    toast("Open an invite link to join a game.");
    return;
  }
  const data = await api("join", { id: currentGameId(), name: playerName() });
  acceptSession(data);
});

els.readyButton.addEventListener("click", async () => {
  state.ready = !state.ready;
  const data = await api("ready", { id: currentGameId(), token: state.token, ready: state.ready });
  updateGame(data.game);
});

els.copyButton.addEventListener("click", async () => {
  const url = `${location.origin}/game/${currentGameId()}`;
  await navigator.clipboard.writeText(url);
  toast("Invite link copied.");
});

els.gpsButton.addEventListener("click", () => {
  if (state.gpsWatch) stopGps();
  else startGps();
});

els.resetButton.addEventListener("click", async () => {
  const data = await api("reset", { id: currentGameId(), token: state.token });
  state.ready = false;
  updateGame(data.game);
});

els.soundToggle.addEventListener("click", () => {
  state.sound = !state.sound;
  els.soundToggle.textContent = state.sound ? "Mute" : "Sound";
  chirp(520, 0.05);
});

function playerName() {
  return els.playerName.value.trim() || "Player";
}

function currentGameId() {
  return state.game?.id || pathGameId;
}

function acceptSession(data) {
  state.token = data.token || state.token;
  state.role = data.role || data.game.me || state.role;
  localStorage.setItem("livetron:token", state.token);
  localStorage.setItem("livetron:role", state.role);
  updateGame(data.game);
  startLoops();
  if (!state.gpsWatch) startGps();
}

function updateGame(game) {
  state.game = game;
  if (game.me) state.role = game.me;
  const me = game.players[state.role];
  if (me) {
    state.desiredDir = me.desiredDir;
    state.ready = me.ready;
  }
  renderHud();
}

function renderHud() {
  const game = state.game;
  if (!game) return;
  document.body.dataset.status = game.status;
  const host = game.players.host;
  const guest = game.players.guest;
  els.setupForm.classList.toggle("hidden", Boolean(state.token && state.role));
  els.controls.classList.toggle("hidden", !(state.token && state.role));
  els.hostName.textContent = host.name;
  els.guestName.textContent = guest.joined ? guest.name : "Invite needed";
  els.hostState.textContent = labelPlayer(host);
  els.guestState.textContent = guest.joined ? labelPlayer(guest) : "Waiting";
  els.readyButton.textContent = state.ready ? "Ready ✓" : "Ready";
  els.readyButton.classList.toggle("ready", state.ready);
  els.readyButton.textContent = "Ready";
  els.directionStatus.textContent = `Direction: ${state.desiredDir}`;
  els.speedStatus.textContent = `Speed: ${state.speedMps.toFixed(1)} m/s`;

  if (game.status === "countdown") {
    const remaining = Math.max(0, Math.ceil((Date.parse(game.startsAt) - Date.now()) / 1000));
    els.statusTitle.textContent = `${remaining}`;
    showOverlay(remaining ? `Starting in ${remaining}` : "Go");
    if (remaining <= 3 && remaining > 0) buzz(70);
  } else if (game.status === "playing") {
    els.statusTitle.textContent = "Run the grid";
    hideOverlay();
  } else if (game.status === "finished") {
    els.statusTitle.textContent = game.message;
    showOverlay(game.message);
    buzz(180);
  } else {
    els.statusTitle.textContent = game.players.guest.joined ? "Ready up" : "Share invite";
    showOverlay(game.message);
  }
}

function labelPlayer(player) {
  if (!player.alive) return "Crashed";
  if (state.game.status === "playing") return `${Math.round(player.speed)} u/s`;
  return player.ready ? "Ready" : "Not ready";
}

function draw() {
  const game = state.game;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  if (game) {
    for (const player of Object.values(game.players)) drawTrail(player);
    for (const player of Object.values(game.players)) drawCycle(player);
  }
  requestAnimationFrame(draw);
}

function drawGrid() {
  ctx.fillStyle = "#020708";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(62, 243, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 50) line(x, 0, x, canvas.height);
  for (let y = 0; y <= canvas.height; y += 50) line(0, y, canvas.width, y);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
}

function drawTrail(player) {
  ctx.strokeStyle = player.color;
  ctx.shadowColor = player.color;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  for (const segment of player.trail) line(segment.x1, segment.y1, segment.x2, segment.y2);
  ctx.shadowBlur = 0;
}

function drawCycle(player) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = player.alive ? player.color : "#53666d";
  ctx.shadowColor = player.color;
  ctx.shadowBlur = player.alive ? 20 : 0;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

async function api(action, payload = {}) {
  const response = await fetch(`/api/games?action=${action}`, {
    method: action === "get" ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: action === "get" ? undefined : JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function startLoops() {
  clearInterval(state.tickTimer);
  clearInterval(state.pollTimer);
  state.tickTimer = setInterval(sendTick, 450);
  state.pollTimer = setInterval(pollGame, 900);
}

async function sendTick() {
  if (!state.token || !currentGameId()) return;
  try {
    const data = await api("tick", {
      id: currentGameId(),
      token: state.token,
      desiredDir: state.desiredDir,
      speedMps: state.speedMps,
      gps: state.lastGps
    });
    updateGame(data.game);
  } catch (error) {
    toast(error.message);
  }
}

async function pollGame() {
  if (!currentGameId()) return;
  try {
    const token = state.token ? `&token=${encodeURIComponent(state.token)}` : "";
    const response = await fetch(`/api/games?id=${currentGameId()}${token}`);
    const data = await response.json();
    if (response.ok) updateGame(data.game);
  } catch {
    toast("Connection is patchy.");
  }
}

function startGps() {
  if (!navigator.geolocation) {
    toast("GPS is not available in this browser.");
    return;
  }
  state.gpsWatch = navigator.geolocation.watchPosition(onGps, onGpsError, {
    enableHighAccuracy: true,
    maximumAge: 500,
    timeout: 8000
  });
  els.gpsButton.textContent = "Stop GPS";
  els.gpsStatus.textContent = "GPS starting";
  toast("GPS is the controller. Run to steer.");
}

function stopGps() {
  navigator.geolocation.clearWatch(state.gpsWatch);
  state.gpsWatch = null;
  els.gpsButton.textContent = "Start GPS";
  els.gpsStatus.textContent = "GPS idle";
}

function onGps(position) {
  const gps = {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy,
    at: Date.now()
  };
  const maxAccuracy = state.game?.settings.maxGpsAccuracy || 35;
  if (gps.accuracy > maxAccuracy) {
    els.gpsStatus.textContent = `GPS weak ±${Math.round(gps.accuracy)}m`;
    return;
  }
  if (state.lastGps) {
    const meters = distanceMeters(state.lastGps, gps);
    const seconds = Math.max(0.4, (gps.at - state.lastGps.at) / 1000);
    state.speedMps = Math.min(8, meters / seconds);
    if (meters >= (state.game?.settings.sampleMinMeters || 5)) {
      setDirection(bearingToDir(bearingDegrees(state.lastGps, gps)));
    }
  }
  state.lastGps = gps;
  els.gpsStatus.textContent = `GPS ±${Math.round(gps.accuracy)}m`;
}

function onGpsError(error) {
  els.gpsStatus.textContent = error.message || "GPS permission needed";
}

function setDirection(dir) {
  if (state.desiredDir === dir) return;
  state.desiredDir = dir;
  els.directionStatus.textContent = `Direction: ${dir}`;
  buzz(30);
}

function bearingToDir(degrees) {
  if (degrees >= 315 || degrees < 45) return "N";
  if (degrees >= 45 && degrees < 135) return "E";
  if (degrees >= 135 && degrees < 225) return "S";
  return "W";
}

function bearingDegrees(from, to) {
  const lat1 = radians(from.lat);
  const lat2 = radians(to.lat);
  const dLon = radians(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
}

function distanceMeters(a, b) {
  const earth = 6371000;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

function radians(value) {
  return value * Math.PI / 180;
}

function degrees(value) {
  return value * 180 / Math.PI;
}

function showOverlay(text) {
  els.overlay.classList.remove("hidden");
  els.overlayText.textContent = text;
}

function hideOverlay() {
  els.overlay.classList.add("hidden");
}

function toast(text) {
  showOverlay(text);
  setTimeout(() => {
    if (state.game?.status === "playing") hideOverlay();
    else renderHud();
  }, 1400);
}

function buzz(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
  chirp(260 + ms, 0.025);
}

function chirp(frequency, duration) {
  if (!state.sound) return;
  const audio = new AudioContext();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.035;
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + duration);
}

if (pathGameId) {
  els.joinButton.textContent = state.token ? "Rejoin" : "Join Game";
  pollGame().then(() => {
    if (state.token) startLoops();
  });
}

draw();
