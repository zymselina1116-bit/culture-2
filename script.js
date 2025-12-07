/*
 * SHADOW PUPPETRY HAND TRACKING BATTLE
 *
 * This interactive prototype uses MediaPipe Hands to track both hands
 * and control two shadow-puppet characters in real-time.
 *
 * GESTURES:
 * - FIST (closed hand) = Movement mode - character follows hand position
 * - OPEN PALM = Attack mode - creates attack effect
 *
 * Characters appear as black silhouettes on a traditional shadow-play stage
 */

// ============================================================================
// CONFIGURATION & GLOBAL STATE
// ============================================================================

const config = {
    // Character image paths (replace with your uploaded images)
    leftCharacterImage: 'left-character.png',
    rightCharacterImage: 'right-character.png',

    // Character size
    characterWidth: 150,
    characterHeight: 200,

    // Attack settings
    attackRange: 100,
    attackDuration: 300, // milliseconds
    strongAttackMultiplier: 1.5,

    // Collision settings
    collisionRadius: 80,

    // Particle settings
    particleCount: 20,
    particleLifetime: 1000, // milliseconds

    // Hand tracking sensitivity
    fistThreshold: 0.7, // How closed the hand needs to be to count as fist
    palmVelocityThreshold: 0.05 // Movement speed to trigger strong attack
};

// Global state
const state = {
    leftHand: null,
    rightHand: null,
    leftCharacter: { x: 0.3, y: 0.5, mode: 'move', image: null, lastAttackTime: 0 },
    rightCharacter: { x: 0.7, y: 0.5, mode: 'move', image: null, lastAttackTime: 0 },
    particles: [],
    isReady: false
};

// ============================================================================
// CANVAS & RENDERING SETUP
// ============================================================================

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const video = document.getElementById('webcam');
const loadingEl = document.getElementById('loading');
const instructionsEl = document.getElementById('instructions');

// Set canvas to full window size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ============================================================================
// IMAGE LOADING
// ============================================================================

// Load character images
function loadCharacterImages() {
    return new Promise((resolve) => {
        let loadedCount = 0;
        const totalImages = 2;

        // Load left character
        const leftImg = new Image();
        leftImg.onload = () => {
            state.leftCharacter.image = leftImg;
            loadedCount++;
            if (loadedCount === totalImages) resolve();
        };
        leftImg.onerror = () => {
            // Create fallback silhouette if image fails to load
            state.leftCharacter.image = createFallbackCharacter('LEFT');
            loadedCount++;
            if (loadedCount === totalImages) resolve();
        };
        leftImg.src = config.leftCharacterImage;

        // Load right character
        const rightImg = new Image();
        rightImg.onload = () => {
            state.rightCharacter.image = rightImg;
            loadedCount++;
            if (loadedCount === totalImages) resolve();
        };
        rightImg.onerror = () => {
            // Create fallback silhouette if image fails to load
            state.rightCharacter.image = createFallbackCharacter('RIGHT');
            loadedCount++;
            if (loadedCount === totalImages) resolve();
        };
        rightImg.src = config.rightCharacterImage;
    });
}

// Create a fallback character silhouette if images are not available
function createFallbackCharacter(label) {
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = config.characterWidth;
    fallbackCanvas.height = config.characterHeight;
    const fallbackCtx = fallbackCanvas.getContext('2d');

    // Draw a simple warrior silhouette
    fallbackCtx.fillStyle = '#000000';

    // Head
    fallbackCtx.beginPath();
    fallbackCtx.arc(fallbackCanvas.width / 2, 40, 25, 0, Math.PI * 2);
    fallbackCtx.fill();

    // Body
    fallbackCtx.fillRect(fallbackCanvas.width / 2 - 20, 65, 40, 80);

    // Arms
    fallbackCtx.fillRect(fallbackCanvas.width / 2 - 50, 70, 30, 15);
    fallbackCtx.fillRect(fallbackCanvas.width / 2 + 20, 70, 30, 15);

    // Legs
    fallbackCtx.fillRect(fallbackCanvas.width / 2 - 25, 145, 18, 55);
    fallbackCtx.fillRect(fallbackCanvas.width / 2 + 7, 145, 18, 55);

    return fallbackCanvas;
}

// ============================================================================
// GESTURE DETECTION
// ============================================================================

/**
 * Detect if hand is in fist position (closed hand)
 * Based on finger curl - all fingers except thumb should be curled
 */
function isFist(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    // Get key points
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    const indexBase = landmarks[5];
    const middleBase = landmarks[9];
    const ringBase = landmarks[13];
    const pinkyBase = landmarks[17];

    // Calculate distances - fingers should be close to palm in fist
    const indexCurl = distance(indexTip, indexBase);
    const middleCurl = distance(middleTip, middleBase);
    const ringCurl = distance(ringTip, ringBase);
    const pinkyCurl = distance(pinkyTip, pinkyBase);

    // Average curl should be small for fist
    const avgCurl = (indexCurl + middleCurl + ringCurl + pinkyCurl) / 4;

    return avgCurl < config.fistThreshold;
}

/**
 * Detect if hand is in open palm position
 * All fingers should be extended
 */
function isOpenPalm(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    // Get key points
    const wrist = landmarks[0];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    const indexBase = landmarks[5];
    const middleBase = landmarks[9];
    const ringBase = landmarks[13];
    const pinkyBase = landmarks[17];

    // Calculate distances - fingers should be extended from palm
    const indexExtend = distance(indexTip, wrist);
    const middleExtend = distance(middleTip, wrist);
    const ringExtend = distance(ringTip, wrist);
    const pinkyExtend = distance(pinkyTip, wrist);

    // All fingers should be relatively far from wrist
    const avgExtend = (indexExtend + middleExtend + ringExtend + pinkyExtend) / 4;

    return avgExtend > config.fistThreshold * 1.5;
}

/**
 * Calculate Euclidean distance between two points
 */
function distance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Get hand velocity to detect palm push motion
 */
function getHandVelocity(currentHand, previousHand) {
    if (!currentHand || !previousHand) return 0;

    const dx = currentHand.x - previousHand.x;
    const dy = currentHand.y - previousHand.y;

    return Math.sqrt(dx * dx + dy * dy);
}

// ============================================================================
// CHARACTER CONTROL & ATTACK SYSTEM
// ============================================================================

/**
 * Update character based on hand tracking data
 */
function updateCharacter(character, hand, previousHand) {
    if (!hand || !hand.landmarks) return;

    const landmarks = hand.landmarks;
    const palmCenter = landmarks[9]; // Middle finger base - roughly palm center

    // Detect gesture
    const fist = isFist(landmarks);
    const palm = isOpenPalm(landmarks);

    // Update character position and mode
    if (fist) {
        // MOVEMENT MODE - character follows hand
        character.mode = 'move';
        character.x = palmCenter.x;
        character.y = palmCenter.y;
    } else if (palm) {
        // ATTACK MODE - character stays in place but can attack
        character.mode = 'attack';

        // Check if palm is pushing forward (velocity check)
        const velocity = getHandVelocity(
            { x: palmCenter.x, y: palmCenter.y },
            previousHand ? { x: previousHand.x, y: previousHand.y } : null
        );

        const now = Date.now();
        const timeSinceLastAttack = now - character.lastAttackTime;

        // Trigger attack if enough time has passed
        if (timeSinceLastAttack > config.attackDuration) {
            const isStrongAttack = velocity > config.palmVelocityThreshold;
            character.attackStrength = isStrongAttack ? config.strongAttackMultiplier : 1.0;
            character.lastAttackTime = now;
            character.isAttacking = true;

            // Attack will be cleared by animation timer
            setTimeout(() => {
                character.isAttacking = false;
            }, config.attackDuration);
        }
    }
}

/**
 * Check collision between two characters
 */
function checkCollision(char1, char2) {
    const dx = (char1.x - char2.x) * canvas.width;
    const dy = (char1.y - char2.y) * canvas.height;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance < config.collisionRadius;
}

/**
 * Check if attack hits the other character
 */
function checkAttackHit(attacker, target) {
    if (!attacker.isAttacking) return false;

    const dx = (attacker.x - target.x) * canvas.width;
    const dy = (attacker.y - target.y) * canvas.height;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Attack range depends on attack strength
    const effectiveRange = config.attackRange * attacker.attackStrength;

    return distance < effectiveRange;
}

// ============================================================================
// PARTICLE SYSTEM
// ============================================================================

class Particle {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = config.particleLifetime;
        this.maxLife = config.particleLifetime;
        this.size = Math.random() * 4 + 2;
        this.color = Math.random() > 0.5 ? '#f4d03f' : '#ff6b35';
    }

    update(deltaTime) {
        this.x += this.vx * deltaTime / 16;
        this.y += this.vy * deltaTime / 16;
        this.vy += 0.2; // Gravity
        this.life -= deltaTime;
    }

    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    isDead() {
        return this.life <= 0;
    }
}

/**
 * Create particle burst at position
 */
function createParticleBurst(x, y, intensity = 1.0) {
    const count = Math.floor(config.particleCount * intensity);

    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const speed = (Math.random() * 3 + 2) * intensity;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - Math.random() * 2; // Bias upward

        state.particles.push(new Particle(x, y, vx, vy));
    }
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Draw the traditional shadow-play stage background
 */
function drawStage() {
    // Create radial gradient for warm circular light effect
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.6;

    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, '#f4d03f');
    gradient.addColorStop(0.4, '#e6c86e');
    gradient.addColorStop(0.7, '#3d2a1f');
    gradient.addColorStop(1, '#1a1410');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Draw character as black silhouette
 */
function drawCharacter(character, flipHorizontal = false) {
    if (!character.image) return;

    const x = character.x * canvas.width;
    const y = character.y * canvas.height;

    ctx.save();

    // Position at character location
    ctx.translate(x, y);

    // Flip if needed
    if (flipHorizontal) {
        ctx.scale(-1, 1);
    }

    // Draw as black silhouette
    ctx.globalCompositeOperation = 'source-over';

    // Draw image
    ctx.drawImage(
        character.image,
        -config.characterWidth / 2,
        -config.characterHeight / 2,
        config.characterWidth,
        config.characterHeight
    );

    // Convert to black silhouette
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#000000';
    ctx.fillRect(
        -config.characterWidth / 2,
        -config.characterHeight / 2,
        config.characterWidth,
        config.characterHeight
    );

    ctx.restore();

    // Draw attack effect if attacking
    if (character.isAttacking) {
        drawAttackEffect(character);
    }
}

/**
 * Draw attack effect arc in front of character
 */
function drawAttackEffect(character) {
    const x = character.x * canvas.width;
    const y = character.y * canvas.height;
    const range = config.attackRange * character.attackStrength;

    ctx.save();

    // Position at character
    ctx.translate(x, y);

    // Draw attack arc
    ctx.strokeStyle = character.attackStrength > 1 ? '#ff6b35' : '#f4d03f';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = ctx.strokeStyle;

    // Draw a sweeping arc
    const progress = 1 - ((Date.now() - character.lastAttackTime) / config.attackDuration);
    ctx.globalAlpha = progress;

    ctx.beginPath();
    const startAngle = -Math.PI / 3;
    const endAngle = Math.PI / 3;
    ctx.arc(0, 0, range, startAngle, endAngle);
    ctx.stroke();

    ctx.restore();
}

/**
 * Main render loop
 */
function render() {
    if (!state.isReady) return;

    // Clear and draw stage
    drawStage();

    // Update and draw particles
    const now = Date.now();
    state.particles = state.particles.filter(particle => {
        particle.update(16); // Assume ~60fps
        particle.draw(ctx);
        return !particle.isDead();
    });

    // Draw characters
    drawCharacter(state.leftCharacter, false);
    drawCharacter(state.rightCharacter, true);

    // Check for hits
    if (state.leftCharacter.isAttacking && checkAttackHit(state.leftCharacter, state.rightCharacter)) {
        // Left character hit right character
        if (!state.leftCharacter.hasHit) {
            const hitX = state.rightCharacter.x * canvas.width;
            const hitY = state.rightCharacter.y * canvas.height;
            createParticleBurst(hitX, hitY, state.leftCharacter.attackStrength);
            state.leftCharacter.hasHit = true;

            // Reset hit flag after attack duration
            setTimeout(() => {
                state.leftCharacter.hasHit = false;
            }, config.attackDuration);
        }
    }

    if (state.rightCharacter.isAttacking && checkAttackHit(state.rightCharacter, state.leftCharacter)) {
        // Right character hit left character
        if (!state.rightCharacter.hasHit) {
            const hitX = state.leftCharacter.x * canvas.width;
            const hitY = state.leftCharacter.y * canvas.height;
            createParticleBurst(hitX, hitY, state.rightCharacter.attackStrength);
            state.rightCharacter.hasHit = true;

            // Reset hit flag after attack duration
            setTimeout(() => {
                state.rightCharacter.hasHit = false;
            }, config.attackDuration);
        }
    }

    // Check for simple collision (both in move mode)
    if (state.leftCharacter.mode === 'move' &&
        state.rightCharacter.mode === 'move' &&
        checkCollision(state.leftCharacter, state.rightCharacter)) {
        // Simple bump - could add visual feedback here if desired
    }

    requestAnimationFrame(render);
}

// ============================================================================
// MEDIAPIPE HANDS SETUP
// ============================================================================

// Store previous hand positions for velocity calculation
let previousLeftHand = null;
let previousRightHand = null;

/**
 * Handle hand tracking results from MediaPipe
 */
function onResults(results) {
    if (!state.isReady) return;

    // Clear previous hand states
    state.leftHand = null;
    state.rightHand = null;

    // Process detected hands
    if (results.multiHandLandmarks && results.multiHandedness) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i].label; // "Left" or "Right"

            // Note: MediaPipe labels are mirrored for selfie view
            // So "Right" in MediaPipe means user's left hand
            if (handedness === 'Right') {
                state.leftHand = { landmarks };
                updateCharacter(state.leftCharacter, state.leftHand, previousLeftHand);
                previousLeftHand = {
                    x: landmarks[9].x,
                    y: landmarks[9].y
                };
            } else if (handedness === 'Left') {
                state.rightHand = { landmarks };
                updateCharacter(state.rightCharacter, state.rightHand, previousRightHand);
                previousRightHand = {
                    x: landmarks[9].x,
                    y: landmarks[9].y
                };
            }
        }
    }

    // Hide instructions once both hands are detected
    if (state.leftHand && state.rightHand) {
        instructionsEl.classList.add('hidden');
    }
}

/**
 * Initialize MediaPipe Hands
 */
async function initializeHandTracking() {
    const hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
    });

    hands.onResults(onResults);

    // Set up camera
    const camera = new Camera(video, {
        onFrame: async () => {
            await hands.send({ image: video });
        },
        width: 1280,
        height: 720
    });

    await camera.start();
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Main initialization function
 */
async function init() {
    try {
        // Load character images
        await loadCharacterImages();

        // Initialize hand tracking
        await initializeHandTracking();

        // Hide loading screen
        loadingEl.classList.add('hidden');

        // Mark as ready and start render loop
        state.isReady = true;
        render();

    } catch (error) {
        console.error('Initialization error:', error);
        loadingEl.querySelector('.loading-text').textContent = 'Error: ' + error.message;
        loadingEl.querySelector('.loading-subtitle').textContent = 'Please refresh and try again';
    }
}

// Start the application
init();
