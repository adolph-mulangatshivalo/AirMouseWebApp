import {
    HandLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// DOM Elements
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const loadingElement = document.getElementById("loading");
const statusText = document.getElementById("status");
const fpsText = document.getElementById("fps");
const cursor = document.getElementById("virtual-cursor");
const actionText = document.getElementById("action-text");
const actionBar = document.getElementById("action-bar");

// Application State
let handLandmarker = undefined;
let runningMode = "VIDEO";
let lastVideoTime = -1;
let isPinching = false;
let isHolding = false;
let grabOffsetX = 0;
let grabOffsetY = 0;
let holdReleaseFrames = 0;
let isRightPinching = false;
let isMoving = false;
let frames = 0;
let lastTime = performance.now();
let lastPredictTime = performance.now();
let lostHandFrames = 0; // Tracking persistence counter
let lastThumbOpenTime = performance.now(); // Snap gesture timing

// Smooth Cursor State
let currentCursorX = window.innerWidth / 2;
let currentCursorY = window.innerHeight / 2;
let handWasPresent = false;

// Utility: Calculate 3D distance between two points for extreme angle robustness
function calculateDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    // Use Z-depth if available to maintain accuracy when hand is pointing directly at camera
    const dz = (point1.z !== undefined && point2.z !== undefined) ? (point1.z - point2.z) : 0;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Utility: Calculate angle in degrees between two 3D vectors defined by 4 points
function calculateAngle(p1, p2, p3, p4) {
    const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: (p2.z !== undefined && p1.z !== undefined) ? (p2.z - p1.z) : 0 };
    const v2 = { x: p4.x - p3.x, y: p4.y - p3.y, z: (p4.z !== undefined && p3.z !== undefined) ? (p4.z - p3.z) : 0 };
    
    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
    
    if (mag1 === 0 || mag2 === 0) return 0;
    const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.acos(cosTheta) * (180 / Math.PI);
}

// Utility: Simulate a mouse click at specific screen coordinates
function triggerClick(x, y) {
    // Find what element is directly under the coordinates
    // (Our virtual cursor has pointer-events: none in CSS, so it won't block this)
    const element = document.elementFromPoint(x, y);

    if (element) {
        // Create and dispatch the click event to that element
        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: 0
        });
        element.dispatchEvent(clickEvent);
    }
}

// Utility: Simulate a right click (context menu) at specific screen coordinates
function triggerRightClick(x, y) {
    const element = document.elementFromPoint(x, y);

    if (element) {
        const clickEvent = new MouseEvent('contextmenu', {
            view: window, bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2
        });
        element.dispatchEvent(clickEvent);
    }
}

function triggerMouseDown(x, y) {
    const element = document.elementFromPoint(x, y);
    if (element) {
        element.dispatchEvent(new MouseEvent('mousedown', {
            view: window, bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0
        }));
    }
}

function triggerMouseUp(x, y) {
    const element = document.elementFromPoint(x, y);
    if (element) {
        element.dispatchEvent(new MouseEvent('mouseup', {
            view: window, bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0
        }));
    }
}



// Initialize the MediaPipe HandLandmarker
async function initializeHandLandmarker() {
    try {
        statusText.textContent = "Loading dependencies...";

        // Load the vision WebAssembly files from CDN
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        statusText.textContent = "Loading hand landmarker model...";

        // Create the HandLandmarker instance
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU" // Use GPU for better performance if available
            },
            runningMode: runningMode,
            numHands: 1, // We only need one hand for the mouse
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.35, // Lowered to prevent dropping tracking at weird angles
        });

        loadingElement.style.display = "none";
        statusText.textContent = "Model loaded. Starting camera...";

        // Once model is loaded, start the webcam
        startCamera();
    } catch (error) {
        console.error("Initialization error:", error);
        statusText.textContent = "Error loading model: " + error.message;
    }
}

// Request access to the user's webcam
async function startCamera() {
    try {
        const constraints = { video: { facingMode: "user" } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.addEventListener("loadeddata", predictWebcam);
        statusText.textContent = "Active";
    } catch (err) {
        console.error("Camera access error:", err);
        statusText.textContent = "Error accessing camera: " + err.message;
    }
}

// Main rendering and prediction loop
async function predictWebcam() {
    // Ensure canvas dimensions match the video stream
    if (canvasElement.width !== video.videoWidth) {
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
    }

    let startTimeMs = performance.now();
    const dt = startTimeMs - lastPredictTime || 16;
    lastPredictTime = startTimeMs;

    // Only run prediction if we have a new video frame
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;

        // Perform detection
        const results = handLandmarker.detectForVideo(video, startTimeMs);

        // Clear previous drawings
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        // Draw the live webcam feed onto the canvas
        canvasCtx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);

        // Initialize drawing utility
        const drawingUtils = new DrawingUtils(canvasCtx);

        if (results.landmarks && results.landmarks.length > 0) {
            lostHandFrames = 0; // Reset persistence counter
            statusText.textContent = "Tracking";

            for (const landmarks of results.landmarks) {
                // Draw hand skeleton on the canvas (dark border + blue interior for connectors)
                drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                    color: "#0f172a",
                    lineWidth: 5
                });
                drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                    color: "#3b82f6",
                    lineWidth: 3
                });
                // Draw the landmark points
                drawingUtils.drawLandmarks(landmarks, {
                    color: "#f8fafc",
                    lineWidth: 2,
                    radius: 4
                });

                const indexTip = landmarks[8];
                const middleTip = landmarks[12]; // The finger next to the index finger
                const thumbTip = landmarks[4];
                const wrist = landmarks[0];
                const middleMCP = landmarks[9]; // Base of middle finger

                if (indexTip && middleTip && thumbTip && wrist && middleMCP) {
                    const rect = canvasElement.getBoundingClientRect();

                    // --- SCALE-INVARIANT DISTANCE METRICS ---
                    // By dividing pinch distance by hand size, the threshold works perfectly 
                    // whether the hand is 1 foot or 4 feet away from the camera.
                    const handSize = calculateDistance(wrist, middleMCP) || 0.001;

                    // 1. Move Logic: "Pointing Fist" clutch
                    // Helper to check if a finger is extended (tip is further from wrist than PIP joint)
                    const isExtended = (tipIdx, pipIdx) => {
                        return calculateDistance(landmarks[tipIdx], wrist) > calculateDistance(landmarks[pipIdx], wrist);
                    };

                    const indexExt = isExtended(8, 6);
                    const middleExt = isExtended(12, 10);
                    const ringExt = isExtended(16, 14);
                    const pinkyExt = isExtended(20, 18);

                    const isFullFist = !indexExt && !middleExt && !ringExt && !pinkyExt;

                    if (!isMoving) {
                        // Engage clutch if pointing OR if making a full fist
                        if ((indexExt && !middleExt && !ringExt && !pinkyExt) || isFullFist) {
                            isMoving = true;
                        }
                    } else {
                        // Drop clutch only if hand is fully open and they aren't actively holding a grab
                        if (middleExt && ringExt && !isHolding) {
                            isMoving = false;
                        }
                    }

                    // 2a. Left Click Logic: Thumb + Middle Finger Pinch
                    const rawClickDist = calculateDistance(middleTip, thumbTip);
                    const normalizedClickDist = rawClickDist / handSize;

                    if (!isPinching) {
                        // Trigger only if not already grabbing or right clicking
                        // 0.15 is very forgiving, fingers don't need to perfectly touch
                        if (normalizedClickDist < 0.15 && !isHolding && !isRightPinching) {
                            isPinching = true;
                            cursor.classList.add("clicking");
                            triggerClick(currentCursorX, currentCursorY);
                        }
                    } else {
                        if (normalizedClickDist > 0.22) {
                            isPinching = false;
                            if (!isHolding) cursor.classList.remove("clicking");
                        }
                    }

                    // 2b. Hold Logic: Full Fist Grab (No fingers showing)
                    if (!isHolding) {
                        // Engage Hold when all fingers are curled (and not doing another click)
                        if (isFullFist && !isPinching && !isRightPinching) {
                            isHolding = true;
                            
                            // Capture the exact offset between the stable WRIST (0) and the current cursor.
                            const fistAnchorX = rect.left + (1 - landmarks[0].x) * rect.width;
                            const fistAnchorY = rect.top + landmarks[0].y * rect.height;
                            
                            // NEVER move the cursor when a grab starts. Keep it exactly where they left it,
                            // even if they brought their hand into the frame as a fist from thin air.
                            grabOffsetX = currentCursorX - fistAnchorX;
                            grabOffsetY = currentCursorY - fistAnchorY;
                            handWasPresent = true; // Prevent the movement block from teleporting it

                            cursor.classList.add("clicking");
                            triggerMouseDown(currentCursorX, currentCursorY);
                        }
                    } else {
                        // Release Hold when they point their index finger again
                        // We use a debounce to prevent the grab from flickering or jumping if the camera loses the fist for a single frame
                        if (indexExt) {
                            holdReleaseFrames++;
                            if (holdReleaseFrames > 3) {
                                isHolding = false;
                                if (!isPinching) cursor.classList.remove("clicking");
                                triggerMouseUp(currentCursorX, currentCursorY);
                                holdReleaseFrames = 0;
                            }
                        } else {
                            holdReleaseFrames = 0; // Reset debounce if they maintain the fist
                        }
                    }

                    // 3. Right Click Logic: Thumb moves closer to the dots on the fist
                    // "Dots on the fist" include the index/middle knuckles and middle joints
                    const fistDots = [landmarks[5], landmarks[6], landmarks[9], landmarks[10]];
                    
                    let minFistDist = Infinity;
                    for (const dot of fistDots) {
                        const dist = calculateDistance(thumbTip, dot);
                        if (dist < minFistDist) minFistDist = dist;
                    }
                    
                    const normalizedRightClickDist = minFistDist / handSize;

                    if (normalizedRightClickDist > 0.28) {
                        // Update the timer as long as the thumb is opened away from the fist
                        lastThumbOpenTime = performance.now();
                    }

                    if (!isRightPinching) {
                        // Trigger when thumb folds down. 0.20 is very forgiving.
                        if (normalizedRightClickDist < 0.20 && !isHolding && !isPinching) {
                            // Only right-click if the thumb was closed quickly (fast flick)
                            const timeToClose = performance.now() - lastThumbOpenTime;

                            // 500ms allows for a very comfortable, effortless flick
                            if (timeToClose < 500) {
                                isRightPinching = true;
                                cursor.classList.add("right-clicking");
                                triggerRightClick(currentCursorX, currentCursorY);
                            }
                        }
                    } else {
                        // Release when thumb opens back up away from the fist
                        if (normalizedRightClickDist > 0.28) {
                            isRightPinching = false;
                            cursor.classList.remove("right-clicking");
                        }
                    }

                    // 4. Cursor Position Update
                    if (isMoving) {
                        let targetX, targetY;
                        
                        if (isHolding) {
                            // When holding, use the stable wrist + frozen offset
                            const fistAnchorX = rect.left + (1 - landmarks[0].x) * rect.width;
                            const fistAnchorY = rect.top + landmarks[0].y * rect.height;
                            targetX = fistAnchorX + grabOffsetX;
                            targetY = fistAnchorY + grabOffsetY;
                        } else {
                            // When pointing, use the tip of the index finger
                            targetX = rect.left + (1 - indexTip.x) * rect.width;
                            targetY = rect.top + indexTip.y * rect.height;
                        }
                        
                        // Clamp to screen bounds
                        targetX = Math.max(0, Math.min(window.innerWidth, targetX));
                        targetY = Math.max(0, Math.min(window.innerHeight, targetY));

                        if (!handWasPresent) {
                            currentCursorX = targetX;
                            currentCursorY = targetY;
                            handWasPresent = true;
                        }

                        // --- FRAME-RATE INDEPENDENT VELOCITY SMOOTHING ---
                        const dx = targetX - currentCursorX;
                        const dy = targetY - currentCursorY;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const velocity = dist / dt; // pixels per millisecond

                        // Adaptive filter: high velocity = low smoothing (fast), low velocity = high smoothing (stable)
                        let dynamicSmoothing = 0.12 + (velocity / 2.0) * 0.85;
                        dynamicSmoothing = Math.max(0.12, Math.min(0.92, dynamicSmoothing));

                        currentCursorX += dx * dynamicSmoothing;
                        currentCursorY += dy * dynamicSmoothing;

                        cursor.style.left = `${currentCursorX}px`;
                        cursor.style.top = `${currentCursorY}px`;
                        cursor.style.opacity = "1"; // Bright when grabbed
                    } else {
                        // Freeze cursor in place when not moving
                        handWasPresent = false;
                        cursor.style.opacity = "0.4"; // Dim visual feedback to show it's frozen
                    }
                    
                    // --- Update Action HUD ---
                    if (isHolding) {
                        actionText.textContent = "Hold";
                        actionBar.className = "action-bar left-click";
                    } else if (isPinching) {
                        actionText.textContent = "Left Click";
                        actionBar.className = "action-bar left-click";
                    } else if (isRightPinching) {
                        actionText.textContent = "Right Click";
                        actionBar.className = "action-bar right-click";
                    } else if (isMoving) {
                        actionText.textContent = "Moving";
                        actionBar.className = "action-bar";
                    } else {
                        actionText.textContent = "Hovering";
                        actionBar.className = "action-bar";
                    }
                }
            }
        } else {
            lostHandFrames++;
            if (lostHandFrames > 5) { // ~150ms grace period before dropping the hand completely
                statusText.textContent = "Ready";
                actionText.textContent = "No Hand Detected";
                actionBar.className = "action-bar";
                // Hide cursor gracefully
                cursor.style.opacity = "0";
                handWasPresent = false;
                if (isPinching) {
                        isPinching = false;
                        cursor.classList.remove("clicking");
                    }
                    if (isHolding) {
                        isHolding = false;
                        cursor.classList.remove("clicking");
                        triggerMouseUp(currentCursorX, currentCursorY);
                    }
                    if (isRightPinching) {
                    isRightPinching = false;
                    cursor.classList.remove("right-clicking");
                }
                isMoving = false;
            }
        }

        canvasCtx.restore();
    }

    // FPS tracking
    frames++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
        fpsText.textContent = frames;
        frames = 0;
        lastTime = now;
    }

    // Request next frame continuously
    window.requestAnimationFrame(predictWebcam);
}

// Start application
initializeHandLandmarker();

