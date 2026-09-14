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


## 🔧 Technologies
- **HTML/CSS/JS**
- **MediaPipe Tasks Vision** (Hand Landmarker)
