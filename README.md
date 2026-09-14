# AirMouse

AirMouse is a futuristic, computer vision-powered virtual mouse that allows you to control your cursor entirely hands-free using your webcam. Built with modern web technologies and Google's MediaPipe Hand Landmarker, it translates your physical hand gestures into smooth, precise on-screen actions.

## 🚀 Features

- **Butter Smooth Tracking**: Uses a frame-rate independent velocity filter to ensure your cursor glides across the screen without jitter, scaling stabilization dynamically based on how fast you move your hand.
- **Intuitive Gestures**:
  - **Move**: Point your index finger at the screen. The cursor follows your fingertip.
  - **Left Click**: Pinch your thumb and middle finger together.
  - **Hold / Drag**: Curl your hand into a full fist. The cursor intelligently locks a frozen offset to your wrist bone, ensuring zero jitter while you drag items. Uncurl your index finger to drop.
  - **Right Click**: While pointing, quickly flick your thumb across the side of your fist (like pulling a trigger).
- **Responsive HUD**: A sleek, bottom-anchored HUD provides real-time feedback on your current gesture state.
- **100% Client-Side**: All machine learning inference runs directly in your browser using WebAssembly and WebGL. No images are ever sent to a server.

## 🛠️ Setup & Deployment

This project consists of static HTML, CSS, and vanilla JavaScript. It requires no build steps or bundlers.

### Running Locally
To test it locally, you just need a basic HTTP server to bypass browser webcam security restrictions.
```bash
python -m http.server 8000
```
Then visit `http://localhost:8000`

### Deploying to Vercel
Because this is a static site, deploying to Vercel takes seconds:
1. Push this repository to your GitHub account.
2. Log into [Vercel](https://vercel.com/) and click **Add New Project**.
3. Import your GitHub repository.
4. Leave all build settings as default (no framework, no build command) and click **Deploy**.
5. Your AirMouse will be live and accessible from anywhere!

## 🔧 Technologies
- **HTML/CSS/JS**
- **MediaPipe Tasks Vision** (Hand Landmarker)
