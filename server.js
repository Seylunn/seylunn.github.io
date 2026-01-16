const express = require("express");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// WORLD SETTINGS
const MAP_SIZE = 4000;
const TICK_RATE = 30;
const FOOD_COUNT = 500;

// WORLD STATE
let clients = new Map(); // ws -> player
let food = [];

// HELPERS
function randPos() {
  return {
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE
  };
}

function wrap(v) {
  if (v < 0) return v + MAP_SIZE;
  if (v >= MAP_SIZE) return v - MAP_SIZE;
  return v;
}

// INIT FOOD
for (let i = 0; i < FOOD_COUNT; i++) {
  const p = randPos();
  food.push({
    id: Math.random().toString(36).slice(2),
    x: p.x,
    y: p.y,
    color: Math.floor(Math.random() * 6)
  });
}

wss.on("connection", ws => {
  const id = Math.random().toString(36).slice(2);
  const pos = randPos();

  clients.set(ws, {
    id,
    name: "Player",
    x: pos.x,
    y: pos.y,
    angle: 0,
    boosting: false,
    length: 40
  });

  ws.on("message", msg => {
    try {
      const data = JSON.parse(msg.toString());
      const p = clients.get(ws);
      if (!p) return;

      if (data.type === "join") {
        p.name = data.name || "Player";
      } else if (data.type === "input") {
        p.angle = data.angle;
        p.boosting = data.boosting;
      }
    } catch (e) {}
  });

  ws.on("close", () => {
    clients.delete(ws);
  });
});

// GAME LOOP
setInterval(() => {
  const speedBase = 3;
  const boostExtra = 2;

  // MOVE PLAYERS
  for (const [ws, p] of clients.entries()) {
    const speed = speedBase + (p.boosting ? boostExtra : 0);
    p.x = wrap(p.x + Math.cos(p.angle) * speed);
    p.y = wrap(p.y + Math.sin(p.angle) * speed);

    // EAT FOOD
    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i];
      const dx = p.x - f.x;
      const dy = p.y - f.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 20) {
        p.length += 3;
        food.splice(i, 1);

        // respawn food
        const np = randPos();
        food.push({
          id: Math.random().toString(36).slice(2),
          x: np.x,
          y: np.y,
          color: Math.floor(Math.random() * 6)
        });
      }
    }
  }

  // LEADERBOARD
  const leaderboard = [...clients.values()]
    .sort((a, b) => b.length - a.length)
    .slice(0, 10)
    .map(p => ({
      name: p.name,
      score: Math.floor(p.length)
    }));

  // SNAPSHOT
  const snapshot = {
    type: "state",
    players: [...clients.values()],
    food,
    leaderboard,
    mapSize: MAP_SIZE
  };

  const payload = JSON.stringify(snapshot);

  // SEND TO ALL
  for (const [ws] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log("Worms.io running on http://localhost:" + PORT);
});

