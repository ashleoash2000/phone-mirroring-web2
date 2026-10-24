# Private Android Browser Screen Share

A starter project for consent-based screen sharing from a sender browser to a viewer browser using WebRTC. The signaling server only forwards WebRTC setup messages; it does not receive the screen video.

## Important Android limitation

Browser screen capture (`getDisplayMedia`) is not consistently available in Android browsers. If the sender's Android browser reports that screen capture is unsupported, this web-only approach cannot capture the Android system screen on that device. Use a native Android app using Android's MediaProjection API instead. Do not try to bypass Android's capture permission prompt.

## Requirements

- Node.js 18 or newer
- HTTPS hosting for public use (and WSS for signaling)
- Modern browsers with WebRTC
- Sender must explicitly tap **Start sharing** and approve the browser/OS prompt

## Run locally

1. Extract the ZIP.
2. Open a terminal in the extracted `phone-mirroring-web` directory.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000` on the development computer.

For actual phone testing, `http://localhost` on the phone refers to the phone itself, not your computer. Use a secure HTTPS deployment, or a temporary HTTPS tunnel for development. Browsers require a secure context for screen capture; plain HTTP on a LAN IP generally will not work.

## Use

1. Open the site on the sender device and select **Share this screen**.
2. Tap **Generate pairing code** and send the code privately to the intended viewer.
3. Tap **Start sharing** and approve the screen-capture prompt if the browser supports it.
4. On the viewer device, open the same HTTPS site, choose **View a screen**, enter the code, and connect.
5. Either side can disconnect; the sender can also stop capture using Android/browser controls.

## Deployment

Deploy to a Node.js host that supports WebSockets and provides HTTPS. Set the start command to `npm start`. The application automatically uses `wss://` when loaded over HTTPS. Confirm the host supports WebSocket upgrades to `/signal`.

## Networking

The demo configures a public STUN server. Some carrier, Wi-Fi, and firewall combinations need a TURN relay for reliable connectivity. TURN may incur costs. Configure your own TURN credentials in `makePeer()` if needed; do not hard-code long-lived secrets in public client code. Use short-lived TURN credentials from a backend.

## Security notes and limitations

- Pairing codes are random 8-character codes. Share them only with the intended viewer.
- The signaling server limits connection attempts per source IP and allows one sender and one viewer per code.
- The server does not store media, but it forwards signaling data. The WebRTC connection encrypts media in transit.
- This is a starter implementation, not a security-audited production service. Before public launch, add authentication or stronger room tokens, origin validation, robust distributed rate limiting, abuse controls, monitoring, and privacy/legal notices.
- The sample's rate limiting is in-memory and not suitable for a multi-instance deployment.
- Never share PINs, passwords, banking apps, or other sensitive content. A mirrored screen may expose notifications and personal information.
