// ========================================================
//            game.js (Platformer Version)
// ========================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const upgradeMenu = document.getElementById('upgradeMenu');
const upgradeOptionsContainer = document.getElementById('upgradeOptionsContainer');

let canvasWidth = window.innerWidth * 0.95;
let canvasHeight = window.innerHeight * 0.95;
canvas.width = canvasWidth;
canvas.height = canvasHeight;

// --- Constants ---
// *** MODIFICATION 2: Global speed scale ***
const SPEED_SCALE = 0.6; // Set overall game speed (1.0 = normal, 0.3 = 30%)
// *** MODIFICATION 1: Define Ground Level ***
const GROUND_LEVEL_PERCENT = 0.85; // Ground at 85% of screen height
let GROUND_LEVEL = canvasHeight * GROUND_LEVEL_PERCENT;

// --- Game State ---
let isGameOver = false;
let isPaused = false;
let score = 0;
let gameTime = 0; // Tracks actual time
let scaledGameTime = 0; // Tracks time scaled by SPEED_SCALE for difficulty ramp-up
let lastTime = 0;
let mouse = { x: canvasWidth / 2, y: canvasHeight / 2, down: false };
let keys = {};

// --- Game Objects ---
let player;
let enemies = [];
let bullets = [];
let xpOrbs = [];
let particles = [];
let backgroundPolygons = [];

// --- Audio Context ---
let audioCtx = null;
try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
} catch (e) {
    console.error("Web Audio API is not supported in this browser", e);
}

// --- Sound Generation Functions ---
// (Sound functions remain the same)
function playSound(type, config = {}) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    let oscillator, gainNode;
    gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(config.volume || 0.5, now);
    gainNode.connect(audioCtx.destination);

    // ... (rest of the sound cases are identical to previous version) ...
    switch (type) {
        case 'jump':
            oscillator = audioCtx.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, now); // A4
            oscillator.frequency.linearRampToValueAtTime(880, now + 0.1); // Ramp up quickly
            gainNode.gain.setValueAtTime(0.3, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            oscillator.connect(gainNode);
            oscillator.start(now);
            oscillator.stop(now + 0.2);
            break;

        case 'shoot':
            oscillator = audioCtx.createOscillator();
            oscillator.type = 'triangle'; // Gives a slightly softer sound than square
            oscillator.frequency.setValueAtTime(880, now); // High pitch
            gainNode.gain.setValueAtTime(0.2, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1); // Quick decay
            oscillator.connect(gainNode);
            oscillator.start(now);
            oscillator.stop(now + 0.1);

             // Add a subtle noise burst for impact
             const noiseSource = audioCtx.createBufferSource();
             const bufferSize = audioCtx.sampleRate * 0.05; // 50ms noise
             const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
             const output = buffer.getChannelData(0);
             for (let i = 0; i < bufferSize; i++) {
                 output[i] = Math.random() * 2 - 1; // White noise
             }
             noiseSource.buffer = buffer;
             const noiseGain = audioCtx.createGain();
             noiseGain.gain.setValueAtTime(0.05, now);
             noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
             noiseSource.connect(noiseGain);
             noiseGain.connect(audioCtx.destination);
             noiseSource.start(now);
             noiseSource.stop(now + 0.05);
            break;

        case 'hit_enemy':
            oscillator = audioCtx.createOscillator();
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(220, now); // Low pitch
            gainNode.gain.setValueAtTime(0.3, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            oscillator.connect(gainNode);
            oscillator.start(now);
            oscillator.stop(now + 0.1);
            break;

        case 'hit_player':
             oscillator = audioCtx.createOscillator();
             oscillator.type = 'sawtooth'; // Harsher sound
             oscillator.frequency.setValueAtTime(110, now); // Very low pitch
             gainNode.gain.setValueAtTime(0.5, now);
             gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
             oscillator.connect(gainNode);
             oscillator.start(now);
             oscillator.stop(now + 0.3);
            break;

        case 'xp_pickup':
            // Simple rising arpeggio
            const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
            freqs.forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.05);
                const g = audioCtx.createGain();
                g.gain.setValueAtTime(0.15, now + i * 0.05);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.1);
                osc.connect(g);
                g.connect(audioCtx.destination);
                osc.start(now + i * 0.05);
                osc.stop(now + i * 0.05 + 0.1);
            });
            break;

        case 'level_up':
            const lFreqs = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
             lFreqs.forEach((freq, i) => {
                 const osc = audioCtx.createOscillator();
                 osc.type = 'triangle';
                 osc.frequency.setValueAtTime(freq, now + i * 0.1);
                 const g = audioCtx.createGain();
                 g.gain.setValueAtTime(0.4, now + i * 0.1);
                 g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.2);
                 osc.connect(g);
                 g.connect(audioCtx.destination);
                 osc.start(now + i * 0.1);
                 osc.stop(now + i * 0.1 + 0.2);
             });
            break;

         case 'game_over':
            oscillator = audioCtx.createOscillator();
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(110, now); // A2
            oscillator.frequency.linearRampToValueAtTime(55, now + 1.0); // Descend pitch
            gainNode.gain.setValueAtTime(0.6, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
            oscillator.connect(gainNode);
            oscillator.start(now);
            oscillator.stop(now + 1.5);
            break;
    }
}


// --- Upgrade Definitions ---
// (Upgrade definitions remain the same)
const allUpgrades = [
    { id: 'hp', name: 'Vitality Boost', description: '+20 Max HP', apply: (p) => { p.maxHp += 20; p.hp += 20; } },
    { id: 'regen', name: 'Regeneration', description: '+0.5 HP/sec', apply: (p) => p.regenRate += 0.5 },
    { id: 'damage', name: 'Power Shot', description: '+5 Bullet Damage', apply: (p) => p.bulletDamage += 5 },
    { id: 'atk_speed', name: 'Rapid Fire', description: '+15% Attack Speed', apply: (p) => p.attackCooldown *= 0.85 },
    { id: 'bullet_speed', name: 'Velocity Rounds', description: '+20% Bullet Speed', apply: (p) => p.bulletSpeed *= 1.2 },
    { id: 'bullet_size', name: 'Heavy Caliber', description: '+20% Bullet Size', apply: (p) => p.bulletSize *= 1.2 },
    { id: 'bullet_count', name: 'Multishot', description: '+1 Bullet per Shot', apply: (p) => p.bulletCount += 1 },
    { id: 'jump', name: 'Spring Boots', description: '+10% Jump Power', apply: (p) => p.jumpPower *= 1.1 },
    { id: 'xp_gain', name: 'Learning', description: '+10% XP Gain', apply: (p) => p.xpGainMultiplier *= 1.1 },
    { id: 'pickup_radius', name: 'Magnetism', description: '+25% Pickup Radius', apply: (p) => p.pickupRadius *= 1.25 },
    { id: 'rotation_speed', name: 'Gyro Stabilizer', description: '+20% Rotation Speed', apply: (p) => p.rotationSpeed *= 1.2 },
    { id: 'crit_chance', name: 'Precision Aim', description: '+5% Crit Chance', apply: (p) => p.critChance += 0.05 },
    { id: 'crit_damage', name: 'Deadeye', description: '+25% Crit Damage', apply: (p) => p.critDamageMultiplier += 0.25 },
    { id: 'armor', name: 'Reinforced Hull', description: '-10% Damage Taken', apply: (p) => p.damageReduction += 0.10 },
];
let currentUpgradeChoices = [];

// --- Utility Functions ---
// (Utility functions remain the same)
function lerp(a, b, t) { return a + (b - a) * t; }
function angleLerp(a1, a2, t) { const max = Math.PI * 2; const da = (a2 - a1) % max; const shortAngleDist = 2 * da % max - da; return a1 + shortAngleDist * t; }
function distance(x1, y1, x2, y2) { const dx = x1 - x2; const dy = y1 - y2; return Math.sqrt(dx * dx + dy * dy); }
function getRandomColor() { const h = Math.random() * 360; const s = 70 + Math.random() * 30; const l = 50 + Math.random() * 20; return `hsl(${h}, ${s}%, ${l}%)`; }
function createParticles(x, y, count, color, speedRange, sizeRange, lifeRange) { /* ... same ... */ }
function hexToRgb(hex) { /* ... same ... */
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) { return r + r + g + g + b + b; });
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

// --- Classes ---
class Player {
    constructor(x, y) {
        this.x = x;
        // *** MODIFICATION 1: Initialize y relative to GROUND_LEVEL ***
        this.size = 30; // Keep player size consistent for now
        this.baseY = GROUND_LEVEL - this.size / 2; // Player's center Y when grounded
        this.y = this.baseY; // Start on the ground

        this.color = '#00FFFF';
        this.glowColor = 'rgba(0, 255, 255, 0.5)';

        // Stats (same)
        this.maxHp = 100;
        this.hp = this.maxHp;
        this.regenRate = 0;
        this.damageReduction = 0;

        // Movement
        this.vy = 0;
        // *** MODIFICATION 2: Apply SPEED_SCALE to gravity and jump power ***
        this.gravity = 0.05 * SPEED_SCALE; // Scaled gravity
        this.jumpPower = 10; // Base jump power (will be scaled on use)
        this.isGrounded = true;
        this.angle = -Math.PI / 2; // Pointing up initially
        this.targetAngle = -Math.PI / 2;
        this.rotationSpeed = 0.15; // Keep rotation speed independent of SPEED_SCALE? Or scale? Let's keep it for responsiveness.

        // Combat (apply SPEED_SCALE to bulletSpeed later in Bullet class)
        this.attackCooldown = 1;
        this.timeSinceLastShot = this.attackCooldown;
        this.bulletDamage = 10;
        this.bulletSpeed = 8; // Base bullet speed
        this.bulletSize = 5;
        this.bulletCount = 1;
        this.bulletSpread = 0.2;
        this.critChance = 0.05;
        this.critDamageMultiplier = 1.5;

        // Progression (same)
        this.level = 1;
        this.xp = 0;
        this.xpToNextLevel = 50;
        this.xpGainMultiplier = 1.0;
        this.pickupRadius = 100;

        // Visuals (same)
        this.damageFlashTimer = 0;
        this.damageFlashDuration = 0.15;
    }

    update(dt) {
         // Apply Regen
         if (this.regenRate > 0 && this.hp < this.maxHp) {
            this.hp += this.regenRate * dt; // Regen rate could also be scaled if desired, but let's keep it absolute for now
            this.hp = Math.min(this.hp, this.maxHp);
        }

        // Movement & Gravity
        if (!this.isGrounded) {
            // *** MODIFICATION 2: Apply SPEED_SCALE to velocity change ***
            this.vy += this.gravity; // Gravity already scaled
            this.y += this.vy * dt * 60; // Apply velocity (scaled gravity effect accumulates here)

            this.targetAngle = Math.atan2(mouse.y - this.y, mouse.x - this.x);

            // *** MODIFICATION 1: Check against new GROUND_LEVEL based baseY ***
            if (this.y >= this.baseY) {
                this.y = this.baseY;
                this.vy = 0;
                this.isGrounded = true;
                // Land particles spawn AT the ground level visually
                createParticles(this.x, GROUND_LEVEL, 10, this.color, [1, 4], [1, 3], [0.3, 0.6]);
            }
        } else {
            this.targetAngle = -Math.PI / 2; // Upright angle
            this.vy = 0;
            this.y = this.baseY; // Ensure player stays exactly on ground
        }
        this.angle = angleLerp(this.angle, this.targetAngle, this.rotationSpeed);

        // Update attack cooldown & damage flash
        this.timeSinceLastShot += dt;
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer -= dt;
        }
    }

    draw(ctx) {
        // (Draw logic remains the same, translates based on this.x, this.y)
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle + Math.PI / 2);

        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 15 + Math.sin(Date.now() * 0.005) * 5;

        if (this.damageFlashTimer > 0 && Math.floor(this.damageFlashTimer * 20) % 2 === 0) {
            ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#FF0000';
        } else {
            ctx.fillStyle = this.color; ctx.strokeStyle = '#FFFFFF';
        }

        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.lineWidth = 2;
        ctx.strokeRect(-this.size / 2, -this.size / 2, this.size, this.size);

        ctx.restore();
    }

    jump() {
        if (this.isGrounded) {
            // *** MODIFICATION 2: Apply SPEED_SCALE to jump velocity ***
            this.vy = -this.jumpPower * SPEED_SCALE;
            this.isGrounded = false;
            playSound('jump');
            // Jump particles spawn AT the ground level visually
            createParticles(this.x, GROUND_LEVEL, 15, this.color, [2, 5], [2, 4], [0.4, 0.8]);
        }
    }

    shoot() {
        // Shoot only when airborne
        if (!this.isGrounded && this.timeSinceLastShot >= this.attackCooldown) {
            playSound('shoot');
            this.timeSinceLastShot = 0;

            const baseAngle = this.angle;
            const totalSpread = this.bulletSpread * (this.bulletCount - 1);
            const startAngle = baseAngle - totalSpread / 2;

            for (let i = 0; i < this.bulletCount; i++) {
                let currentAngle = (this.bulletCount > 1) ? startAngle + i * this.bulletSpread : baseAngle;
                // *** MODIFICATION 2: Bullet speed scaling is handled in Bullet update ***
                const vx = Math.cos(currentAngle) * this.bulletSpeed; // Use base speed here
                const vy = Math.sin(currentAngle) * this.bulletSpeed;
                const isCrit = Math.random() < this.critChance;
                const damage = isCrit ? this.bulletDamage * this.critDamageMultiplier : this.bulletDamage;
                const bulletColor = isCrit ? '#FFFF00' : '#FFFFFF';
                const bulletGlow = isCrit ? 'rgba(255, 255, 0, 0.7)' : 'rgba(255, 255, 255, 0.5)';

                bullets.push(new Bullet(
                    this.x + Math.cos(currentAngle) * (this.size / 1.5),
                    this.y + Math.sin(currentAngle) * (this.size / 1.5),
                    vx, vy, this.bulletSize, bulletColor, bulletGlow, damage, isCrit
                ));
            }
        }
    }

    takeDamage(amount) { /* ... same ... */
        const actualDamage = amount * (1 - Math.min(0.9, this.damageReduction));
        this.hp -= actualDamage;
        this.damageFlashTimer = this.damageFlashDuration;
        playSound('hit_player');
        screenShake(5, 0.2);
        if (this.hp <= 0) { this.hp = 0; gameOver(); }
    }
    collectXp(amount) { /* ... same ... */
        this.xp += amount * this.xpGainMultiplier;
        score += amount * this.xpGainMultiplier * 10;
        if (this.xp >= this.xpToNextLevel) { this.levelUp(); }
    }
    levelUp() { /* ... same ... */
        playSound('level_up');
        this.xp -= this.xpToNextLevel;
        this.level++;
        this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.4 + 50);
        this.hp = this.maxHp;
        isPaused = true;
        showUpgradeMenu();
    }
}

class Bullet {
    constructor(x, y, vx, vy, size, color, glowColor, damage, isCrit) {
        this.x = x;
        this.y = y;
        // Store base velocity components
        this.baseVx = vx;
        this.baseVy = vy;
        this.size = size;
        this.color = color;
        this.glowColor = glowColor;
        this.damage = damage;
        this.isCrit = isCrit;
        this.life = 10; // Life duration maybe shouldn't scale? Or should? Let's keep it absolute.
        this.trail = [];
        this.maxTrailLength = 5;
    }

    update(dt) {
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
        // *** MODIFICATION 2: Apply SPEED_SCALE to movement ***
        this.x += this.baseVx * SPEED_SCALE * dt * 60;
        this.y += this.baseVy * SPEED_SCALE * dt * 60;
        this.life -= dt;
    }

    draw(ctx) { /* ... same draw logic ... */
        // Draw Trail
        ctx.save();
        const rgbColor = hexToRgb(this.color);
        if (rgbColor) {
           for (let i = 0; i < this.trail.length; i++) {
               const point = this.trail[i];
               const alpha = (i / this.maxTrailLength) * 0.5;
               const size = this.size * (i / this.maxTrailLength);
               ctx.fillStyle = `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, ${alpha})`;
               ctx.beginPath(); ctx.arc(point.x, point.y, size, 0, Math.PI * 2); ctx.fill();
           }
        }
        ctx.restore();
       // Draw Bullet
       ctx.save();
       ctx.fillStyle = this.color; ctx.shadowColor = this.glowColor; ctx.shadowBlur = 10 + (this.isCrit ? 5 : 0);
       ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
       ctx.restore();
   }
}

class Enemy {
    constructor(config) {
        // *** MODIFICATION 1: Spawn only from sides ***
        const spawnLeft = Math.random() < 0.5;
        // *** MODIFICATION 3: Use larger size from config ***
        this.size = config.size; // Already larger from definitions
        this.x = spawnLeft ? -this.size : canvasWidth + this.size;
        // *** MODIFICATION 1: Spawn Y fixed to GROUND_LEVEL ***
        this.y = GROUND_LEVEL + 5 - this.size / 2; // Center Y on ground

        this.color = config.color;
        const rgbColor = hexToRgb(this.color);
        this.glowColor = config.glowColor || (rgbColor ? `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, 0.4)` : 'rgba(200, 200, 200, 0.3)');

        this.shape = config.shape;
        this.vertices = this.generateVertices(this.shape, this.size);

        this.maxHp = config.hp;
        this.hp = this.maxHp;
        this.speed = config.speed; // Base speed
        this.damage = config.damage;
        this.xpValue = config.xpValue;
        this.attackCooldown = config.attackCooldown || 1.0;
        this.timeSinceLastAttack = this.attackCooldown;
        // Attack range might need adjusting if player is always on ground level
        this.attackRange = config.attackRange || (this.size + 20); // Simplified range check

        this.hitFlashTimer = 0;
        this.hitFlashDuration = 0.1;
    }

     generateVertices(shapeType, size) { /* ... same ... */
        const points = []; const radius = size / 2; let numSides;
        switch (shapeType) {
            case 'triangle': numSides = 3; break; case 'square': numSides = 4; break;
            case 'pentagon': numSides = 5; break; case 'hexagon': numSides = 6; break;
            case 'octagon': numSides = 8; break;
            case 'star':
                numSides = 5;
                for (let i = 0; i < numSides * 2; i++) { const angle = (Math.PI*2/(numSides*2))*i - Math.PI/2; const r = (i%2===0)?radius:radius*0.5; points.push({x:Math.cos(angle)*r, y:Math.sin(angle)*r}); } return points;
            default: numSides = 4;
        }
        const angleOffset = shapeType==='square'?Math.PI/4:0;
        for (let i=0; i<numSides; i++) { const angle=(Math.PI*2/numSides)*i - Math.PI/2 + angleOffset; points.push({x:Math.cos(angle)*radius, y:Math.sin(angle)*radius}); } return points;
    }

    update(dt, targetX, targetY) { // targetY is less relevant now
        this.timeSinceLastAttack += dt;

        // *** MODIFICATION 1 & 2: Move only horizontally towards player, apply SPEED_SCALE ***
        const dx = targetX - this.x;
        // const dy = targetY - this.y; // No longer needed for basic horizontal movement
        const dist = Math.abs(dx); // Use absolute horizontal distance

        // Move if not too close horizontally
        if (dist > this.attackRange * 0.8) {
            const moveDirection = dx > 0 ? 1 : -1;
            this.x += moveDirection * this.speed * SPEED_SCALE * dt * 60;
            // this.y remains constant (on the ground)
        }

         // Attack Player if in horizontal range and cooldown ready
         if (dist <= this.attackRange && this.timeSinceLastAttack >= this.attackCooldown) {
             this.attackPlayer();
         }

        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= dt;
        }
    }

    draw(ctx) {
        // *** MODIFICATION 1: Y position is fixed, draw is same ***
        ctx.save();
        ctx.translate(this.x, this.y); // Translate to current position

        ctx.shadowColor = this.glowColor; ctx.shadowBlur = 10;

        if (this.hitFlashTimer > 0 && Math.floor(this.hitFlashTimer * 30) % 2 === 0) {
             ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#FF0000';
        } else {
             ctx.fillStyle = this.color; ctx.strokeStyle = `rgba(255, 255, 255, 0.7)`;
        }

        // Draw Shape
        ctx.beginPath(); ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
        for (let i=1; i<this.vertices.length; i++) { ctx.lineTo(this.vertices[i].x, this.vertices[i].y); }
        ctx.closePath(); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();

        // Draw HP bar if not full health (same logic)
        if (this.hp < this.maxHp) {
            const barWidth = this.size * 1.2; const barHeight = 5; const barX = -barWidth / 2; const barY = -this.size / 2 - barHeight - 5; const hpRatio = this.hp / this.maxHp;
            ctx.fillStyle = '#555'; ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = hpRatio>0.5?'#00FF00':hpRatio>0.2?'#FFFF00':'#FF0000';
            ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
            ctx.strokeStyle = '#222'; ctx.strokeRect(barX, barY, barWidth, barHeight);
        }

        ctx.restore();
    }

    takeDamage(amount) { /* ... same ... */
        this.hp -= amount; this.hitFlashTimer = this.hitFlashDuration; playSound('hit_enemy');
        if (this.hp <= 0) { this.die(); return true; } return false;
    }

    attackPlayer() { /* ... same ... */
        player.takeDamage(this.damage); this.timeSinceLastAttack = 0;
        // Particles spawn at enemy's position (which is on the ground)
        createParticles(this.x, this.y, 5, this.color, [1, 3], [2, 4], [0.2, 0.4]);
    }

    die() { /* ... same ... */
        const numOrbs = Math.ceil(this.xpValue / 5); const valuePerOrb = this.xpValue / numOrbs;
        for (let i=0; i<numOrbs; i++) {
            const offsetX = (Math.random() - 0.5) * this.size * 1.5;
            const offsetY = (Math.random() - 0.5) * this.size * 0.5 - this.size*0.2; // Bias upwards slightly from ground
            xpOrbs.push(new XpOrb(this.x + offsetX, this.y + offsetY, valuePerOrb));
        }
        // Death particles spawn at enemy's position
        createParticles(this.x, this.y, 20 + this.size, this.color, [1, 6], [1, 5], [0.5, 1.2]);
        score += this.xpValue * 2;
    }
}

// --- Enemy Definitions ---
// *** MODIFICATION 3: Increase enemy sizes ***
const ENEMY_SIZE_MULTIPLIER = 1.8; // Make enemies almost twice as big
const enemyDefinitions = [];
function defineEnemies() {
    enemyDefinitions.length = 0;
    const baseDefs = [
        // Tier 1
        { levelMin: 0, config: { shape: 'triangle', size: 20, hp: 20, speed: 1.5, damage: 5, xpValue: 5, color: '#FFA500' }},
        { levelMin: 0, config: { shape: 'square', size: 25, hp: 30, speed: 1.2, damage: 7, xpValue: 8, color: '#ADD8E6' }},
        { levelMin: 1, config: { shape: 'triangle', size: 22, hp: 25, speed: 1.8, damage: 6, xpValue: 6, color: '#FFA07A' }},
        // Tier 2
        { levelMin: 2, config: { shape: 'pentagon', size: 30, hp: 50, speed: 1.0, damage: 10, xpValue: 12, color: '#90EE90' }},
        { levelMin: 3, config: { shape: 'square', size: 28, hp: 60, speed: 1.4, damage: 9, xpValue: 15, color: '#B0C4DE' }},
        { levelMin: 3, config: { shape: 'hexagon', size: 35, hp: 80, speed: 0.9, damage: 12, xpValue: 20, color: '#FFB6C1' }},
        { levelMin: 4, config: { shape: 'triangle', size: 18, hp: 30, speed: 2.5, damage: 8, xpValue: 10, color: '#FF6347' }},
        { levelMin: 4, config: { shape: 'star', size: 30, hp: 60, speed: 1.2, damage: 11, xpValue: 18, color: '#FFD700' }},
        // Tier 3
        { levelMin: 5, config: { shape: 'pentagon', size: 32, hp: 100, speed: 1.1, damage: 15, xpValue: 25, color: '#3CB371' }},
        { levelMin: 6, config: { shape: 'octagon', size: 40, hp: 150, speed: 0.8, damage: 18, xpValue: 35, color: '#BA55D3' }},
        { levelMin: 6, config: { shape: 'square', size: 35, hp: 90, speed: 1.8, damage: 14, xpValue: 30, color: '#4682B4' }},
        { levelMin: 7, config: { shape: 'star', size: 38, hp: 120, speed: 1.3, damage: 16, xpValue: 40, color: '#DAA520' }},
        { levelMin: 7, config: { shape: 'triangle', size: 25, hp: 60, speed: 2.8, damage: 13, xpValue: 28, color: '#DC143C' }},
         // Tier 4
         { levelMin: 8, config: { shape: 'hexagon', size: 45, hp: 200, speed: 1.0, damage: 20, xpValue: 50, color: '#8B008B' }},
         { levelMin: 9, config: { shape: 'octagon', size: 42, hp: 180, speed: 1.2, damage: 22, xpValue: 60, color: '#8A2BE2' }},
         { levelMin: 10, config: { shape: 'star', size: 40, hp: 150, speed: 1.6, damage: 25, xpValue: 70, color: '#FF4500' }},
         { levelMin: 11, config: { shape: 'square', size: 30, hp: 100, speed: 2.5, damage: 20, xpValue: 55, color: '#0000CD' }},
         { levelMin: 12, config: { shape: 'pentagon', size: 35, hp: 250, speed: 0.9, damage: 28, xpValue: 80, color: '#2E8B57' }},
         // Tier 5
         { levelMin: 14, config: { shape: 'triangle', size: 40, hp: 150, speed: 3.0, damage: 30, xpValue: 90, color: '#FF0000' }},
         { levelMin: 16, config: { shape: 'star', size: 50, hp: 300, speed: 1.4, damage: 35, xpValue: 120, color: '#FFFF00', glowColor: 'rgba(255, 255, 0, 0.8)' }},
         { levelMin: 18, config: { shape: 'hexagon', size: 55, hp: 400, speed: 1.0, damage: 40, xpValue: 150, color: '#4B0082', glowColor: 'rgba(75, 0, 130, 0.7)' }},
    ];

    baseDefs.forEach(def => {
        // Deep copy config to avoid modifying original object reference
        const scaledConfig = JSON.parse(JSON.stringify(def.config));
        scaledConfig.size *= ENEMY_SIZE_MULTIPLIER;
        // Optionally adjust HP slightly based on size?
        // scaledConfig.hp = Math.round(scaledConfig.hp * (1 + (ENEMY_SIZE_MULTIPLIER - 1) * 0.5)); // Example: increase HP less than size

        enemyDefinitions.push({ levelMin: def.levelMin, config: scaledConfig });
    });
}
defineEnemies();

let enemySpawnTimer = 0;
let enemySpawnInterval = 5.0; // Keep slower initial interval
const minSpawnInterval = 0.3 / SPEED_SCALE; // Minimum interval also scales
const spawnIntervalDecreaseFactor = 0.015; // Keep this factor, but time progresses slower via scaledGameTime

class XpOrb {
    constructor(x, y, value) {
        this.x = x;
        this.y = y;
        this.value = value;
        this.size = 4 + Math.sqrt(value);
        this.color = '#00FF00';
        this.glowColor = 'rgba(0, 255, 0, 0.6)';
        // *** MODIFICATION 2: Scale initial burst velocity ***
        this.vx = (Math.random() - 0.5) * 3 * SPEED_SCALE;
        this.vy = ((Math.random() - 0.5) * 3 - 2) * SPEED_SCALE; // More upward bias scaled
        this.attractionSpeed = 9; // Base speed (scaled in update)
        this.attractionThreshold = 0;
        this.driftSpeed = 3; // Base speed (scaled in update)
        this.life = 30; // Keep life absolute
    }

    update(dt, targetX, targetY, pickupRadius) {
        this.life -= dt;

        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        this.attractionThreshold = pickupRadius * 1.5;
        const isInAttractionRange = dist < this.attractionThreshold;

        // *** MODIFICATION 2: Apply SPEED_SCALE to movement speeds ***
        const scaledAttractionSpeed = this.attractionSpeed * SPEED_SCALE;
        const scaledDriftSpeed = this.driftSpeed * SPEED_SCALE;

        if (isInAttractionRange) {
            const speedMultiplier = Math.max(0.1, (pickupRadius - dist) / pickupRadius) + 1;
            const speed = scaledAttractionSpeed * speedMultiplier * dt * 60; // Use scaled speed
            const moveX = (dist > 0) ? (dx / dist) * speed : 0;
            const moveY = (dist > 0) ? (dy / dist) * speed : 0;

            const dampFactor = Math.max(0, 1 - speedMultiplier * 0.05);
            this.vx *= dampFactor; this.vy *= dampFactor; // vx/vy already scaled from constructor

            this.x += moveX + this.vx * dt * 60; // Apply already scaled vx
            this.y += moveY + this.vy * dt * 60; // Apply already scaled vy

        } else {
            const driftMoveX = (dist > 0) ? (dx / dist) * scaledDriftSpeed * dt * 60 : 0; // Use scaled speed
            const driftMoveY = (dist > 0) ? (dy / dist) * scaledDriftSpeed * dt * 60 : 0;

            // Air resistance doesn't need scaling
            this.vx *= 0.98; this.vy *= 0.98;

            // Apply drift and remaining scaled initial velocity
            this.x += driftMoveX + this.vx * dt * 60; // vx already scaled
            this.y += driftMoveY + this.vy * dt * 60; // vy already scaled
        }

        // Check for actual collection (dist check is absolute)
        if (dist < player.size / 2 + this.size / 2) {
            player.collectXp(this.value);
            playSound('xp_pickup');
            this.life = 0;
            createParticles(this.x, this.y, 3, this.color, [1, 2], [1, 2], [0.2, 0.4]);
        }
    }

    draw(ctx) { /* ... same draw logic ... */
        ctx.save(); ctx.fillStyle = this.color; ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 8 + Math.sin(Date.now() * 0.01 + this.x) * 3;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, vx, vy, size, color, life) {
        this.x = x;
        this.y = y;
        // *** MODIFICATION 2: Scale initial velocity ***
        this.vx = vx * SPEED_SCALE;
        this.vy = vy * SPEED_SCALE;
        this.size = size;
        this.color = color;
        this.life = life; // Keep life absolute
        this.initialLife = life;
        this.alpha = 1.0;
        // *** MODIFICATION 2: Scale particle gravity slightly? Optional. ***
        this.gravityEffect = 0.1 * SPEED_SCALE;
    }

    update(dt) {
        this.x += this.vx * dt * 60; // vx already scaled
        this.y += this.vy * dt * 60; // vy already scaled
        this.vy += this.gravityEffect; // Apply scaled gravity
        this.life -= dt;
        this.alpha = Math.max(0, this.life / this.initialLife);
        this.size *= 0.98; // Shrinking doesn't need scaling
    }

    draw(ctx) { /* ... same draw logic ... */
        ctx.save(); ctx.fillStyle = this.color; ctx.globalAlpha = this.alpha;
        ctx.beginPath(); ctx.fillRect(this.x-this.size/2, this.y-this.size/2, this.size, this.size);
        ctx.restore();
    }
}

// --- Polygon Background ---
// (Background functions remain the same)
function generateBackgroundPolygons(count) { /* ... same ... */ }
function drawBackground(ctx) { /* ... same ... */ }


// --- Game Loop ---
function update(dt) {
    if (isPaused || isGameOver) return;

    // *** MODIFICATION 2: Track scaled time for difficulty progression ***
    gameTime += dt;
    scaledGameTime += dt * SPEED_SCALE; // Use this for spawn interval calculation

    player.update(dt);

    // Update Bullets and Check Collisions
    for (let i = bullets.length - 1; i >= 0; i--) { /* ... collision logic same ... */
        const bullet = bullets[i];
        bullet.update(dt);
        let bulletRemoved = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
             if (bulletRemoved) break;
             const enemy = enemies[j];
             // *** MODIFICATION 1: Collision check still uses distance, but enemies are bigger ***
             const dist = distance(enemy.x, enemy.y, bullet.x, bullet.y);
             if (dist < enemy.size / 2 + bullet.size) { // enemy.size is now larger
                 createParticles(bullet.x, bullet.y, 5+(bullet.isCrit?5:0), bullet.color, [1,4],[1,3],[0.2,0.5]);
                 bullets.splice(i, 1); bulletRemoved = true;
                 if (enemy.takeDamage(bullet.damage)) { enemies.splice(j, 1); }
             }
        }
        if (!bulletRemoved && (bullet.life <= 0 || bullet.x<-bullet.size || bullet.x>canvasWidth+bullet.size || bullet.y<-bullet.size || bullet.y>canvasHeight+bullet.size)) {
            bullets.splice(i, 1);
        }
    }

    // Update Enemies
    for(let i = enemies.length - 1; i >= 0; i--) {
        // Pass player X for horizontal targeting, Y is less critical now but pass anyway
        enemies[i].update(dt, player.x, player.y);
    }

    // Update XP Orbs
    for(let i = xpOrbs.length - 1; i >= 0; i--) {
        xpOrbs[i].update(dt, player.x, player.y, player.pickupRadius);
        if (xpOrbs[i].life <= 0) { xpOrbs.splice(i, 1); }
    }

    // Update Particles
    for(let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(dt);
        if (particles[i].life <= 0 || particles[i].size <= 0.1) { particles.splice(i, 1); }
    }

    // Enemy Spawning Logic
    enemySpawnTimer += dt;
    // *** MODIFICATION 2: Use scaledGameTime for interval calculation ***
    const initialInterval = 5.0;
    enemySpawnInterval = Math.max(minSpawnInterval, initialInterval - scaledGameTime * spawnIntervalDecreaseFactor);

    if (enemySpawnTimer >= enemySpawnInterval) {
        enemySpawnTimer = 0;
        spawnEnemy();
    }
}

function spawnEnemy() {
    // *** MODIFICATION 2: Use scaledGameTime for difficulty level calculation ***
    const difficultyLevel = Math.floor(scaledGameTime / 15); // Difficulty increases slower
    const availableEnemies = enemyDefinitions.filter(def => def.levelMin <= difficultyLevel);

    if (availableEnemies.length > 0) {
         const selectedIndex = Math.floor(Math.pow(Math.random(), 0.5) * availableEnemies.length);
         const enemyConfig = availableEnemies[selectedIndex].config;
         // Enemy constructor now handles placing on ground and using larger size
        enemies.push(new Enemy({...enemyConfig}));
    } else {
        if(enemyDefinitions.length > 0) enemies.push(new Enemy({...enemyDefinitions[0].config}));
    }
}


let screenShakeIntensity = 0; let screenShakeDuration = 0; let screenShakeTime = 0;
function screenShake(intensity, duration) { /* ... same ... */ screenShakeIntensity=Math.max(screenShakeIntensity, intensity); screenShakeDuration=Math.max(screenShakeDuration, duration); screenShakeTime=screenShakeDuration; }
function applyScreenShake(ctx) { /* ... same ... */ if(screenShakeTime>0){ const currentIntensity=screenShakeIntensity*(screenShakeTime/screenShakeDuration); const dx=(Math.random()-0.5)*2*currentIntensity; const dy=(Math.random()-0.5)*2*currentIntensity; ctx.translate(dx,dy); } }
function updateScreenShake(dt) { /* ... same ... */ if(screenShakeTime>0){ screenShakeTime-=dt; if(screenShakeTime<=0){ screenShakeIntensity=0; screenShakeDuration=0; } } }

function render() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.save();
    applyScreenShake(ctx);

    drawBackground(ctx);

    // *** MODIFICATION 1: Draw the Ground ***
    ctx.strokeStyle = '#CCCCCC'; // Light grey ground line
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_LEVEL);
    ctx.lineTo(canvasWidth, GROUND_LEVEL);
    ctx.stroke();
    // Optional: Fill below ground?
    // ctx.fillStyle = '#444444';
    // ctx.fillRect(0, GROUND_LEVEL, canvasWidth, canvasHeight - GROUND_LEVEL);

    // Draw objects (they will appear above the ground line now)
    xpOrbs.forEach(orb => orb.draw(ctx));
    enemies.forEach(enemy => enemy.draw(ctx));
    player.draw(ctx);
    bullets.forEach(bullet => bullet.draw(ctx));
    particles.forEach(particle => particle.draw(ctx));

    ctx.restore(); // Restore from screen shake

    drawUI(ctx);

    if (isGameOver) { drawGameOverScreen(ctx); }
}

function drawUI(ctx) {
    // (UI drawing logic remains the same, positions are absolute)
    // HP Bar
    const hpBarWidth = 200; const hpBarHeight = 20; const hpBarX = 20; const hpBarY = 20;
    ctx.fillStyle='#550000'; ctx.fillRect(hpBarX,hpBarY,hpBarWidth,hpBarHeight); const currentHpWidth=(player.hp/player.maxHp)*hpBarWidth; ctx.fillStyle='#FF0000'; ctx.fillRect(hpBarX,hpBarY,currentHpWidth,hpBarHeight); ctx.strokeStyle='#FFFFFF'; ctx.lineWidth=2; ctx.strokeRect(hpBarX,hpBarY,hpBarWidth,hpBarHeight); ctx.fillStyle='#FFFFFF'; ctx.font='14px sans-serif'; ctx.textAlign='center'; ctx.fillText(`${Math.ceil(player.hp)}/${player.maxHp}`,hpBarX+hpBarWidth/2,hpBarY+hpBarHeight/1.5);
    // XP Bar
    const xpBarWidth=canvasWidth*0.6; const xpBarHeight=15; const xpBarX=(canvasWidth-xpBarWidth)/2; const xpBarY=canvasHeight-xpBarHeight-10; ctx.fillStyle='#003300'; ctx.fillRect(xpBarX,xpBarY,xpBarWidth,xpBarHeight); const currentXpWidth=(player.xp/player.xpToNextLevel)*xpBarWidth; ctx.fillStyle='#00FF00'; ctx.fillRect(xpBarX,xpBarY,currentXpWidth,xpBarHeight); ctx.strokeStyle='#FFFFFF'; ctx.lineWidth=2; ctx.strokeRect(xpBarX,xpBarY,xpBarWidth,xpBarHeight); ctx.fillStyle='#FFFFFF'; ctx.font='12px sans-serif'; ctx.textAlign='center'; ctx.fillText(`Level ${player.level} (${Math.floor(player.xp)}/${player.xpToNextLevel} XP)`,canvasWidth/2,xpBarY+xpBarHeight/1.3);
    // Score & Time
    ctx.fillStyle='#FFFFFF'; ctx.font='20px sans-serif'; ctx.textAlign='right'; ctx.fillText(`Score: ${Math.floor(score)}`,canvasWidth-20,35); const minutes=Math.floor(gameTime/60); const seconds=Math.floor(gameTime%60); ctx.textAlign='right'; ctx.fillText(`Time: ${minutes}:${seconds<10?'0':''}${seconds}`,canvasWidth-20,60);
    // Cooldown Indicator (Position relative to ground)
    // No indicator needed if player can't shoot from ground
    // Keep it if shooting is still airborne only:
    if (!player.isGrounded) {
         const cooldownRatio=Math.min(1,player.timeSinceLastShot/player.attackCooldown); const cdBarWidth=50; const cdBarHeight=5; const cdBarX=player.x-cdBarWidth/2;
         // Place consistently below the *player's drawn position* when jumping
         const cdBarY = player.y + player.size / 2 + 10;
         ctx.fillStyle='#444'; ctx.fillRect(cdBarX,cdBarY,cdBarWidth,cdBarHeight); ctx.fillStyle='#00BFFF'; ctx.fillRect(cdBarX,cdBarY,cdBarWidth*cooldownRatio,cdBarHeight);
    }
}

function drawGameOverScreen(ctx) { /* ... same ... */ ctx.save(); ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.fillRect(0,0,canvasWidth,canvasHeight); ctx.fillStyle='#FF0000'; ctx.font='bold 72px sans-serif'; ctx.textAlign='center'; ctx.shadowColor='#8B0000'; ctx.shadowBlur=10; ctx.fillText('GAME OVER',canvasWidth/2,canvasHeight/2-60); ctx.fillStyle='#FFFFFF'; ctx.font='36px sans-serif'; ctx.shadowColor='#FFFFFF'; ctx.shadowBlur=5; ctx.fillText(`Final Score: ${Math.floor(score)}`,canvasWidth/2,canvasHeight/2+20); const minutes=Math.floor(gameTime/60); const seconds=Math.floor(gameTime%60); ctx.fillText(`Time Survived: ${minutes}:${seconds<10?'0':''}${seconds}`,canvasWidth/2,canvasHeight/2+70); ctx.font='24px sans-serif'; ctx.fillText('Click to Restart',canvasWidth/2,canvasHeight/2+140); ctx.restore(); }
function showUpgradeMenu() { /* ... same ... */ currentUpgradeChoices=[]; const availablePool=[...allUpgrades]; while(currentUpgradeChoices.length<3&&availablePool.length>0){ const randomIndex=Math.floor(Math.random()*availablePool.length); currentUpgradeChoices.push(availablePool[randomIndex]); availablePool.splice(randomIndex,1); } upgradeOptionsContainer.innerHTML=''; currentUpgradeChoices.forEach((upgrade,index)=>{ const optionDiv=document.createElement('div'); optionDiv.classList.add('upgradeOption'); optionDiv.innerHTML=`<h3>${upgrade.name}</h3><p>${upgrade.description}</p>`; optionDiv.onclick=()=>selectUpgrade(index); upgradeOptionsContainer.appendChild(optionDiv); }); upgradeMenu.style.display='flex'; }
function selectUpgrade(index) { /* ... same ... */ if(index>=0&&index<currentUpgradeChoices.length){ const selectedUpgrade=currentUpgradeChoices[index]; selectedUpgrade.apply(player); } hideUpgradeMenu(); }
function hideUpgradeMenu() { /* ... same ... */ upgradeMenu.style.display='none'; isPaused=false; }

function gameLoop(timestamp) {
    // (gameLoop logic remains the same, uses performance.now)
    const currentTime = performance.now();
    const dt = Math.min(0.1, (currentTime - lastTime) / 1000);
    lastTime = currentTime;

    updateScreenShake(dt);

    if (!isGameOver) {
        update(dt); // Pass unscaled dt, scaling happens inside update methods
    }
    render();

    requestAnimationFrame(gameLoop);
}

// --- Input Handling ---
// (Input handling remains the same)
canvas.addEventListener('mousemove',(e)=>{ const rect=canvas.getBoundingClientRect(); mouse.x=e.clientX-rect.left; mouse.y=e.clientY-rect.top; });
canvas.addEventListener('mousedown',(e)=>{ if(e.button===0){ mouse.down=true; if(isGameOver){ restartGame(); }else if(!isPaused){ if(player.isGrounded){ player.jump(); }else{ player.shoot(); /* Shooting only allowed airborne */ } } } });
canvas.addEventListener('mouseup',(e)=>{ if(e.button===0){ mouse.down=false; } });
window.addEventListener('keydown',(e)=>{ keys[e.code]=true; if(e.code==='KeyP'&&!isGameOver&&upgradeMenu.style.display==='none'){ isPaused=!isPaused; } });
window.addEventListener('keyup',(e)=>{ keys[e.code]=false; });

// Handle window resizing
window.addEventListener('resize', () => {
    canvasWidth = window.innerWidth * 0.95;
    canvasHeight = window.innerHeight * 0.95;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // *** MODIFICATION 1: Update GROUND_LEVEL on resize ***
    GROUND_LEVEL = canvasHeight * GROUND_LEVEL_PERCENT;

    if (player) {
        // *** MODIFICATION 1: Update player's baseY relative to new GROUND_LEVEL ***
        player.baseY = GROUND_LEVEL - player.size / 2;
        if (player.isGrounded) player.y = player.baseY; // Snap to new ground if grounded
    }
    generateBackgroundPolygons(30);
});

// --- Game Management ---
function gameOver() { /* ... same ... */ if(isGameOver)return; console.log("Game Over!"); isGameOver=true; playSound('game_over'); screenShake(15,1.0); }

function restartGame() {
    console.log("Restarting Game...");
    isGameOver = false; isPaused = false;
    score = 0; gameTime = 0; scaledGameTime = 0; // Reset scaled time too
    enemies = []; bullets = []; xpOrbs = []; particles = [];
    enemySpawnTimer = 0; enemySpawnInterval = 5.0; // Reset to initial slow interval
    currentUpgradeChoices = []; hideUpgradeMenu();
    defineEnemies(); // Ensure larger enemies are loaded

    // Re-initialize player at correct ground position
    player = new Player(canvasWidth / 2, GROUND_LEVEL - 30 / 2); // Use player size directly

    generateBackgroundPolygons(30 + Math.random() * 20);
    lastTime = performance.now();
}

// --- Initialization ---
function init() {
    // *** MODIFICATION 1: Initialize player relative to GROUND_LEVEL ***
    GROUND_LEVEL = canvasHeight * GROUND_LEVEL_PERCENT; // Set initial ground level
    player = new Player(canvasWidth / 2, GROUND_LEVEL - 30 / 2); // Initial pos using player size

    defineEnemies();
    generateBackgroundPolygons(30);
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

init(); // Start the game!