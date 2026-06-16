import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import gamesHandler from "./api/games.js";

const root = process.cwd();
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 3000);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

createServer(async (request, response) => {
  try {
    if (request.url.startsWith("/api/games")) return gamesHandler(request, response);
    const url = new URL(request.url, `http://${request.headers.host}`);
    let filePath = url.pathname.startsWith("/game/") ? "/index.html" : url.pathname;
    if (filePath === "/") filePath = "/index.html";
    const fullPath = normalize(join(publicDir, filePath));
    if (!fullPath.startsWith(publicDir) || !existsSync(fullPath)) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }
    response.setHeader("content-type", types[extname(fullPath)] || "application/octet-stream");
    response.end(await readFile(fullPath));
  } catch (error) {
    response.statusCode = 500;
    response.end(error.message);
  }
}).listen(port, () => {
  console.log(`LiveTron running at http://localhost:${port}`);
});
