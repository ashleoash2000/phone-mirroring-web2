const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const app = express();
app.disable("x-powered-by");
app.use(express.static("public", { extensions: ["html"] }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true, maxPayload: 64 * 1024 });
const rooms = new Map();
const ipAttempts = new Map();

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function safeCode(code) {
  return typeof code === "string" && /^[A-HJ-NP-Z2-9]{8}$/.test(code);
}
function allowAttempt(ip) {
  const now = Date.now();
  const recent = (ipAttempts.get(ip) || []).filter(t => now - t < 60_000);
  if (recent.length >= 30) return false;
  recent.push(now);
  ipAttempts.set(ip, recent);
  return true;
}
function removePeer(ws) {
  const room = ws.room && rooms.get(ws.room);
  if (!room) return;
  if (room[ws.role] === ws) room[ws.role] = null;
  const otherRole = ws.role === "sender" ? "viewer" : "sender";
  send(room[otherRole], { type: "peer-left" });
  if (!room.sender && !room.viewer) rooms.delete(ws.room);
}

server.on("upgrade", (req, socket, head) => {
  // In production, put this behind HTTPS and use WSS. Reject malformed upgrade paths.
  if (req.url !== "/signal") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
});

wss.on("connection", (ws, req) => {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").toString().split(",")[0].trim();
  if (!allowAttempt(ip)) {
    send(ws, { type: "error", message: "Too many connection attempts. Wait one minute and try again." });
    ws.close(1008, "rate limited");
    return;
  }

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "join") {
      if (ws.room) return;
      const code = String(msg.code || "").toUpperCase();
      const role = msg.role;
      if (!safeCode(code) || !["sender", "viewer"].includes(role)) {
        send(ws, { type: "error", message: "Invalid pairing code or role." });
        return;
      }

      let room = rooms.get(code);
      if (role === "sender") {
        if (room && room.sender) {
          send(ws, { type: "error", message: "That code already has a sender." });
          return;
        }
        if (!room) {
          room = { sender: null, viewer: null, createdAt: Date.now() };
          rooms.set(code, room);
        }
      } else if (!room || !room.sender) {
        send(ws, { type: "error", message: "Pairing code not found. Ask the sender to start sharing first." });
        return;
      }

      if (room[role]) {
        send(ws, { type: "error", message: "This role is already connected for that code." });
        return;
      }
      ws.room = code;
      ws.role = role;
      room[role] = ws;
      send(ws, { type: "joined", role });
      if (room.sender && room.viewer) {
        send(room.sender, { type: "peer-ready" });
        send(room.viewer, { type: "peer-ready" });
      }
      return;
    }

    if (!ws.room || !["offer", "answer", "ice"].includes(msg.type)) return;
    const room = rooms.get(ws.room);
    if (!room) return;
    const target = room[ws.role === "sender" ? "viewer" : "sender"];
    if (!target) return;
    // Only forward WebRTC signaling; screen/video media does not pass through this server.
    if (msg.type === "offer" && ws.role !== "sender") return;
    if (msg.type === "answer" && ws.role !== "viewer") return;
    send(target, { type: msg.type, data: msg.data });
  });

  ws.on("close", () => removePeer(ws));
  ws.on("error", () => removePeer(ws));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Screen-share signaling server listening on port ${PORT}`));

// Expire abandoned rooms and prune old rate-limit entries.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > 60 * 60 * 1000 || (!room.sender && !room.viewer)) {
      for (const peer of [room.sender, room.viewer]) if (peer) peer.close();
      rooms.delete(code);
    }
  }
  for (const [ip, times] of ipAttempts) {
    const kept = times.filter(t => now - t < 60_000);
    if (kept.length) ipAttempts.set(ip, kept); else ipAttempts.delete(ip);
  }
}, 60_000);
