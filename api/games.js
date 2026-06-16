import { createGame, joinGame, publicGame, setReady, stepGame, updatePlayer } from "./engine.js";
import { newId, readGame, writeGame } from "./store.js";

export default async function handler(request, response) {
  try {
    const method = request.method || "GET";
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const action = url.searchParams.get("action") || (method === "POST" ? "create" : "get");
    const body = method === "POST" ? await readBody(request) : {};

    if (method === "POST" && action === "create") {
      const id = newId();
      const hostToken = newId(18);
      const guestToken = newId(18);
      const game = createGame(body.name, id, hostToken, guestToken);
      await writeGame(game);
      return send(response, 200, { game: publicGame(game, hostToken), token: hostToken, role: "host" });
    }

    const id = body.id || url.searchParams.get("id");
    if (!id) return send(response, 400, { error: "Missing game id." });
    const game = await readGame(id);
    if (!game) return send(response, 404, { error: "Game not found." });

    if (method === "GET") {
      stepGame(game);
      await writeGame(game);
      return send(response, 200, { game: publicGame(game, url.searchParams.get("token") || "") });
    }

    let token = body.token || "";
    let role = null;

    if (action === "join") {
      token = joinGame(game, body.name);
      role = "guest";
    } else if (action === "ready") {
      setReady(game, token, body.ready);
    } else if (action === "tick") {
      updatePlayer(game, token, body);
    } else if (action === "reset") {
      const hostName = game.players.host.name;
      const guestName = game.players.guest.name;
      const hostToken = game.players.host.token;
      const guestToken = game.players.guest.token;
      const fresh = createGame(hostName, game.id, hostToken, guestToken);
      fresh.players.guest.joined = game.players.guest.joined;
      fresh.players.guest.name = guestName;
      if (fresh.players.guest.joined) {
        fresh.message = "Both players ready up for the next round.";
      }
      await writeGame(fresh);
      return send(response, 200, { game: publicGame(fresh, token), token });
    } else {
      return send(response, 400, { error: "Unknown action." });
    }

    await writeGame(game);
    return send(response, 200, { game: publicGame(game, token), token, role });
  } catch (error) {
    return send(response, error.status || 500, { error: error.message || "Server error." });
  }
}

function send(response, status, data) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(data));
}

async function readBody(request) {
  if (request.body && typeof request.body === "object" && !request.readable) return request.body;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
