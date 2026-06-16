const ARENA = { width: 1000, height: 700 };
const STARTS = {
  host: { x: 250, y: 350, dir: "E" },
  guest: { x: 750, y: 350, dir: "W" }
};
const VECTORS = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 }
};
const OPPOSITE = { N: "S", E: "W", S: "N", W: "E" };

export function createGame(hostName, id, hostToken, guestToken) {
  const now = new Date().toISOString();
  return {
    id,
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    startsAt: null,
    winner: null,
    message: "Share the invite link, then both players ready up.",
    arena: ARENA,
    settings: {
      countdownSeconds: 8,
      baseSpeed: 80,
      maxSpeedBoost: 75,
      trailPadding: 8,
      edgePadding: 12,
      sampleMinMeters: 5,
      maxGpsAccuracy: 35
    },
    players: {
      host: makePlayer("host", hostName || "Blue", hostToken, STARTS.host, "#24d8ff"),
      guest: makePlayer("guest", "Orange", guestToken, STARTS.guest, "#ffb020")
    },
    events: []
  };
}

function makePlayer(id, name, token, start, color) {
  return {
    id,
    name,
    token,
    color,
    joined: id === "host",
    ready: false,
    alive: true,
    x: start.x,
    y: start.y,
    dir: start.dir,
    desiredDir: start.dir,
    speed: 80,
    lastStepAt: null,
    trail: [{ x1: start.x, y1: start.y, x2: start.x, y2: start.y }],
    gps: null
  };
}

export function publicGame(game, token = "") {
  const role = Object.values(game.players).find((player) => player.token === token)?.id || null;
  return {
    ...game,
    me: role,
    inviteUrl: `/game/${game.id}`,
    players: Object.fromEntries(
      Object.entries(game.players).map(([id, player]) => [
        id,
        {
          id,
          name: player.name,
          color: player.color,
          joined: player.joined,
          ready: player.ready,
          alive: player.alive,
          x: player.x,
          y: player.y,
          dir: player.dir,
          desiredDir: player.desiredDir,
          speed: player.speed,
          trail: player.trail,
          gps: player.gps ? { accuracy: player.gps.accuracy, at: player.gps.at } : null
        }
      ])
    )
  };
}

export function joinGame(game, name) {
  if (game.players.guest.joined) {
    const error = new Error("This game already has two players.");
    error.status = 409;
    throw error;
  }
  game.players.guest.joined = true;
  game.players.guest.name = name || "Orange";
  game.message = "Both players can ready up when they are in a clear outdoor space.";
  addEvent(game, "Opponent joined.");
  return game.players.guest.token;
}

export function setReady(game, token, ready) {
  const player = requirePlayer(game, token);
  player.ready = Boolean(ready);
  if (game.status === "waiting" && game.players.host.ready && game.players.guest.ready && game.players.guest.joined) {
    const startAt = Date.now() + game.settings.countdownSeconds * 1000;
    game.status = "countdown";
    game.startsAt = new Date(startAt).toISOString();
    game.message = "Countdown started.";
    addEvent(game, "Countdown started.");
  }
}

export function updatePlayer(game, token, input) {
  const player = requirePlayer(game, token);
  if (game.status === "countdown" && Date.now() >= Date.parse(game.startsAt)) {
    game.status = "playing";
    game.message = "Run. Turn clean. Do not cross the light.";
    for (const item of Object.values(game.players)) item.lastStepAt = Date.now();
    addEvent(game, "Game started.");
  }
  if (game.status === "playing") stepGame(game);
  if (!player.alive || game.status === "finished") return;

  const desiredDir = sanitizeDirection(input?.desiredDir);
  if (desiredDir && desiredDir !== OPPOSITE[player.dir]) player.desiredDir = desiredDir;

  const realSpeed = Number(input?.speedMps || 0);
  const boost = Math.max(0, Math.min(game.settings.maxSpeedBoost, realSpeed * 12));
  player.speed = game.settings.baseSpeed + boost;

  if (input?.gps) {
    player.gps = {
      lat: Number(input.gps.lat),
      lon: Number(input.gps.lon),
      accuracy: Number(input.gps.accuracy || 0),
      at: new Date().toISOString()
    };
  }
}

export function stepGame(game) {
  if (game.status !== "playing") return;
  const now = Date.now();
  for (const player of Object.values(game.players)) {
    if (!player.alive) continue;
    const last = player.lastStepAt || now;
    const elapsed = Math.min(0.8, Math.max(0, (now - last) / 1000));
    player.lastStepAt = now;
    if (player.desiredDir !== player.dir && player.desiredDir !== OPPOSITE[player.dir]) {
      player.dir = player.desiredDir;
      player.trail.push({ x1: player.x, y1: player.y, x2: player.x, y2: player.y });
    }
    const vector = VECTORS[player.dir];
    player.x += vector.x * player.speed * elapsed;
    player.y += vector.y * player.speed * elapsed;
    const segment = player.trail[player.trail.length - 1];
    segment.x2 = player.x;
    segment.y2 = player.y;
  }
  resolveCollisions(game);
}

function resolveCollisions(game) {
  const dead = [];
  for (const player of Object.values(game.players)) {
    if (!player.alive) continue;
    if (hitEdge(game, player) || hitTrail(game, player)) dead.push(player.id);
  }
  if (!dead.length) return;
  for (const id of dead) game.players[id].alive = false;
  const survivors = Object.values(game.players).filter((player) => player.alive);
  game.status = "finished";
  game.winner = survivors.length === 1 ? survivors[0].id : "draw";
  game.message = game.winner === "draw" ? "Both players crashed." : `${game.players[game.winner].name} wins.`;
  addEvent(game, game.message);
}

function hitEdge(game, player) {
  const pad = game.settings.edgePadding;
  return player.x < pad || player.y < pad || player.x > game.arena.width - pad || player.y > game.arena.height - pad;
}

function hitTrail(game, player) {
  const head = { x: player.x, y: player.y };
  const padding = game.settings.trailPadding;
  for (const other of Object.values(game.players)) {
    for (let i = 0; i < other.trail.length; i += 1) {
      if (other.id === player.id && i >= other.trail.length - 2) continue;
      if (distanceToSegment(head, other.trail[i]) <= padding) return true;
    }
  }
  return false;
}

function distanceToSegment(point, segment) {
  const ax = segment.x1;
  const ay = segment.y1;
  const bx = segment.x2;
  const by = segment.y2;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - ax, point.y - ay);
  const t = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (ax + t * dx), point.y - (ay + t * dy));
}

function requirePlayer(game, token) {
  const player = Object.values(game.players).find((item) => item.token === token);
  if (!player) {
    const error = new Error("Invalid player token.");
    error.status = 403;
    throw error;
  }
  return player;
}

function sanitizeDirection(value) {
  return ["N", "E", "S", "W"].includes(value) ? value : null;
}

function addEvent(game, text) {
  game.events.unshift({ text, at: new Date().toISOString() });
  game.events = game.events.slice(0, 8);
}
