// --- LOGIN/REGISTRATION LOGIC ---
const loginContainer = document.getElementById('login-container');
const gameContainer = document.getElementById('game-container');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');

// Function to show the game and hide the login screen
function showGame() {
    loginContainer.style.display = 'none';
    gameContainer.style.display = 'block';

    // Try to lock screen orientation and go fullscreen
    try {
        document.body.requestFullscreen();
        screen.orientation.lock('landscape');
    } catch (error) {
        console.warn('Screen orientation lock or fullscreen failed:', error);
    }

    gameLoop(); // Start the game
}

// Handle registration
registerBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        alert('아이디와 비밀번호를 모두 입력해주세요.');
        return;
    }

    // Get existing users from localStorage, or create a new object
    const users = JSON.parse(localStorage.getItem('game_users')) || {};

    if (users[username]) {
        alert('이미 존재하는 아이디입니다.');
    } else {
        users[username] = password;
        localStorage.setItem('game_users', JSON.stringify(users));
        alert('회원가입이 완료되었습니다. 이제 로그인해주세요.');
    }
});

// Handle login
loginBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        alert('아이디와 비밀번호를 모두 입력해주세요.');
        return;
    }

    const users = JSON.parse(localStorage.getItem('game_users')) || {};

    if (users[username] && users[username] === password) {
        // Save login state for the session
        sessionStorage.setItem('loggedInUser', username);
        alert('로그인 성공!');
        // loadGameData(); // 주석 처리하여 항상 1스테이지부터 시작하도록 수정
        showGame();
    } else {
        alert('아이디 또는 비밀번호가 일치하지 않습니다.');
    }
});

// Check login status on page load
function checkLoginStatus() {
    const loggedInUser = sessionStorage.getItem('loggedInUser');
    if (loggedInUser) {
        showGame();
    }
}
// --- END LOGIN/REGISTRATION LOGIC ---

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 게임 설정 ---
const STAGE_WIDTH = canvas.width;
const STAGE_HEIGHT = canvas.height;
const GROUND_HEIGHT = 50;

// --- 게임 상태 관리 ---
let gameState = 'story'; // tutorial, menu, stage, village, ending, reviving
let activeUI = null; // null, 'quest', 'shop'
let storyPage = 0;
let tutorialState = {
    step: 0, // 0: move, 1: jump, 2: crouch, 3: shoot, 4: ultimate, 5: dash, 6: done
    movedLeft: false,
    movedRight: false,
    jumped: false,
    crouched: false,
    shot: false,
    ultimateUsed: false,
    dashed: false
};
let endingPage = 0;
let stage = 1;

let gameTimer = 0;
let isBossFight = false;
let frameCount = 0;
let backgroundX = 0;
let isGroundSlippery = false;
let isOneShotMode = false; // 치트키: 한방 모드
let isSpawningNextBoss = false;
let isFightingHiddenBoss = false;
let isPoweredUp = false;
let powerUpTimer = 0;
let numberInputSequence = ''; // '1010' 입력을 위한 변수
let showNumberInput = false; // 입력된 숫자를 화면에 표시할지 여부

// --- 리소스 관리 ---
const lasers = [];
const LASER_SPEED = 10;
const enemies = [];
let boss = null;
const bossProjectiles = [];
const lightningZones = []; // 스테이지 1, 3 보스용
const residualElectrics = []; // 스테이지 2 보스용
const bubbles = []; // 스테이지 3 보스용
const fires = []; // 스테이지 6 보스용
const particles = []; // 파티클 효과용
const obstacles = []; // 스테이지 9 보스용
let villageVisitCount = 3;
let stage7BossRush = [];
let currentBossIndex = 0;

// --- 오디오 관리 ---
// (오디오 파일은 게임 폴더에 있어야 합니다)
const sounds = {
    // jump: new Audio('jump.wav'),
    // coin: new Audio('coin.wav'),
    // walk: new Audio('walk.wav'),
    // stage1: new Audio('stage1.mp3'),
    // stage2: new Audio('stage2.mp3'),
    // stage3: new Audio('stage3.mp3'),
    // stage4: new Audio('stage4.mp3'),
    // stage5: new Audio('stage5.mp3'),
    // stage6: new Audio('stage6.mp3'),
    // stage7: new Audio('stage7.mp3'),
};

let currentBGM = null;
let isWalkingSoundPlaying = false;

function playSound(soundName) {
    if (sounds[soundName]) {
        sounds[soundName].currentTime = 0;
        sounds[soundName].play().catch(e => console.log("Sound play failed:", e));
    }
}

function playBGM(stageNum) {
    const bgmName = `stage${stageNum}`;
    if (currentBGM === sounds[bgmName]) return; // 이미 재생 중이면 아무것도 안함

    stopBGM(); // 기존 BGM 중지

    if (sounds[bgmName]) {
        currentBGM = sounds[bgmName];
        currentBGM.loop = true;
        currentBGM.play().catch(e => console.log("BGM play failed:", e));
    }
}

function stopBGM() {
    if (currentBGM) {
        currentBGM.pause();
        currentBGM.currentTime = 0;
        currentBGM = null;
    }
}

// --- 스테이지 데이터 ---
const stages = [
    { // Stage 1
        type: 'boss',
        bossSpawnTime: 90,
        drawBackground: drawStage1Background,
        createBoss: createStage1Boss,
    },
    { // Stage 2
        type: 'boss',
        bossSpawnTime: 60,
        drawBackground: drawStage2Background,
        createBoss: createStage2Boss,
    },
    { // Stage 3
        type: 'boss',
        bossSpawnTime: 50,
        drawBackground: drawStage3Background,
        createBoss: createStage3Boss,
    },
    { // Stage 4
        type: 'kill',
        killGoal: 10,
        drawBackground: drawStage5Background, // 어둠의 성 밖 배경
    },
    { // Stage 5
        type: 'boss',
        bossSpawnTime: 30,
        drawBackground: drawStage5Background,
        createBoss: createStage5Boss,
    },
    { // Stage 6
        type: 'boss',
        bossSpawnTime: 0, // 보스 즉시 등장
        drawBackground: drawStage6Background,
        createBoss: createStage6Boss,
    },
    { // Stage 7
        type: 'boss',
        bossSpawnTime: 0, // 보스 즉시 등장 (보스 러시)
        drawBackground: drawStage7Background,
        createBoss: () => { // 보스 러시 시작
            stage7BossRush = [createStage1Boss, createStage2Boss, createStage3Boss, createStage5Boss, createStage6Boss, createStage7Boss];
            currentBossIndex = 0;
            stage7BossRush[currentBossIndex]();
        }
    },
    { // Stage 8 - Diamond World
        type: 'survival',
        survivalTime: 40, // 40초 생존
        drawBackground: drawStage8Background,
        createBoss: createSharkBoss,
    },
    { // Stage 9 - Ghost Lair
        type: 'boss',
        bossSpawnTime: 0,
        drawBackground: drawStage9Background,
        createBoss: createGhostBoss,
    },
	{ // Stage 10 - Rody
        type: 'boss',
        bossSpawnTime: 0,
        drawBackground: drawStage10Background,
        createBoss: createRodyBoss,
    },
    { // Stage 11 - Purple Orb
        type: 'boss',
        bossSpawnTime: 0,
        drawBackground: drawStage11Background,
        createBoss: createStage11Boss,
    }
];


// --- 필살기 및 상점 데이터 ---


const shopConsumables = {
    potion: { id: 'potion', name: '회복 아이템', price: 50, type: 'consumable' }
};


// --- 플레이어(토드) 설정 ---
const player = {
    x: 100,
    y: STAGE_HEIGHT - GROUND_HEIGHT - 100,
    width: 40,
    baseHeight: 80,
    crouchHeight: 50,
    height: 80,
    headRadius: 20,
    speed: 5,
    dx: 0,
    dy: 0,
    velocity: 0, // 미끄러운 바닥용
    friction: 0.98, // 미끄러운 바닥용
    gravity: 0.6,
    jumpPower: -15,
    isJumping: false,
    isCrouching: false,
    direction: 'right',
    hp: 3,
    maxHp: 3,
    coins: 0, // 초기 코인
    isInvincible: false,
    invincibleTimer: 0,
    inventory: {
        potions: 0,
    },
    
    enemyKillCount: 0,
    isDashing: false,
    dashTimer: 0,
    dashCooldown: 0,
    dashSpeed: 18,
    isSlowed: false,
    slowTimer: 0,

    draw() {
        const bodyY = this.y + this.headRadius * 2;
        const bodyHeight = this.height - this.headRadius * 2;
        const centerX = this.x + this.width / 2;

        if (isPoweredUp) {
            ctx.shadowColor = 'cyan';
            ctx.shadowBlur = 30;
        }

        


        if (this.isInvincible && Math.floor(this.invincibleTimer / 5) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        } else {
            ctx.globalAlpha = 1;
        }

        ctx.fillStyle = '#ff0000';
        const legWidth = 15, legHeight = 30, footHeight = 5;
        ctx.fillRect(centerX - legWidth, this.y + this.height, legWidth, -legHeight);
        ctx.fillRect(centerX - legWidth - 5, this.y + this.height - footHeight, legWidth + 5, footHeight);
        ctx.fillRect(centerX, this.y + this.height, legWidth, -legHeight);
        ctx.fillRect(centerX, this.y + this.height - footHeight, legWidth + 5, footHeight);
        ctx.strokeStyle = '#808080';
        ctx.lineWidth = 4;
        ctx.beginPath();
        const springTurns = this.isCrouching ? 5 : 10;
        for (let i = 0; i < springTurns; i++) {
            const p = i / (springTurns - 1);
            const x = centerX + Math.sin(p * Math.PI * 4) * (this.width / 3);
            const y = bodyY + bodyHeight * p;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        const armXOffset = this.direction === 'right' ? 25 : -25;
        const armY = bodyY + bodyHeight / 2;
        ctx.arc(centerX + armXOffset, armY, 10, 0, Math.PI * 2);
        ctx.fill();
        const headY = this.y + this.headRadius;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(centerX, headY, this.headRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#dddddd';
        ctx.stroke();
        const eyeXOffset = this.direction === 'right' ? 8 : -8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(centerX + eyeXOffset, headY, 6, 0, Math.PI * 2);
        ctx.arc(centerX - eyeXOffset + (this.direction === 'right' ? 4 : -4), headY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0000ff';
        ctx.beginPath();
        ctx.arc(centerX + eyeXOffset, headY, 4, 0, Math.PI * 2);
        ctx.arc(centerX - eyeXOffset + (this.direction === 'right' ? 4 : -4), headY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        const mouthY = headY + 5, mouthLeft = centerX - 12, mouthRight = centerX + 12, mouthBottom = headY + 20;
        ctx.beginPath();
        ctx.moveTo(mouthLeft, mouthY);
        ctx.quadraticCurveTo(centerX, mouthBottom, mouthRight, mouthY);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        const teethCount = 5, toothWidth = 3, toothHeight = 4, teethY = mouthY + 1;
        const totalTeethWidth = teethCount * toothWidth + (teethCount - 1) * 1;
        const startTeethX = centerX - totalTeethWidth / 2;
        for (let i = 0; i < teethCount; i++) {
            ctx.fillRect(startTeethX + i * (toothWidth + 1), teethY, toothWidth, toothHeight);
        }
        const hatY = this.y - 15;
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(centerX - 25, hatY, 50, 10);
        ctx.fillRect(centerX - 15, hatY - 20, 30, 20);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '15px Arial';
        ctx.fillText('T', centerX - 4, hatY - 5);
        
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;
    },

    update() {
        if (this.dashCooldown > 0) this.dashCooldown--;
        if (this.slowTimer > 0) {
            this.slowTimer--;
        } else {
            this.isSlowed = false;
        }

        const currentSpeed = this.isSlowed ? this.speed / 2 : this.speed;

        if (this.isDashing) {
            this.dashTimer--;
            this.x += (this.direction === 'right' ? this.dashSpeed : -this.dashSpeed);
            createDashParticle(this.x + this.width / 2, this.y + this.height / 2);
            if (this.dashTimer <= 0) {
                this.isDashing = false;
            }
        } else {
            if (isPoweredUp) {
                powerUpTimer--;
                if (powerUpTimer <= 0) {
                    isPoweredUp = false;
                }
            }

            if (isGroundSlippery) {
                if (keys.left) this.velocity -= 1;
                if (keys.right) this.velocity += 1;
                this.velocity = Math.max(-currentSpeed, Math.min(currentSpeed, this.velocity));
            } else {
                this.velocity = 0;
                if (keys.left) this.velocity = -currentSpeed;
                if (keys.right) this.velocity = currentSpeed;
            }
            
            this.x += this.velocity;

            if(isGroundSlippery) {
                this.velocity *= this.friction;
            }
        }


        if (this.isInvincible) {
            this.invincibleTimer--;
            if (this.invincibleTimer <= 0) this.isInvincible = false;
        }
        if (gameState === 'stage') {
             if (keys.left) backgroundX += currentSpeed / 4;
            if (keys.right) backgroundX -= currentSpeed / 4;
        }
        this.height = this.isCrouching ? this.crouchHeight : this.baseHeight;
        
        this.dy += this.gravity;
        this.y += this.dy;
        const ground = STAGE_HEIGHT - GROUND_HEIGHT;

        const isMovingOnGround = !this.isJumping && (keys.left || keys.right) && this.y + this.height >= ground;

        if (isMovingOnGround && !isWalkingSoundPlaying) {
            if(sounds.walk) {
                sounds.walk.loop = true;
                sounds.walk.play().catch(e => {});
            }
            isWalkingSoundPlaying = true;
        } else if (!isMovingOnGround && isWalkingSoundPlaying) {
            if(sounds.walk) sounds.walk.pause();
            isWalkingSoundPlaying = false;
        }

        if (this.y + this.height > ground) {
            if (this.isJumping) { // 착지 시 먼지 효과
                createDustEffect(this.x + this.width / 2, this.y + this.height);
            }
            this.isJumping = false;
            this.y = ground - this.height;
            this.dy = 0;
        }
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > STAGE_WIDTH) this.x = STAGE_WIDTH - this.width;
    },

    jump() { 
        if (!this.isJumping && !this.isCrouching) { 
            playSound('jump');
            this.isJumping = true; 
            this.dy = this.jumpPower; 
            createDustEffect(this.x + this.width / 2, this.y + this.height);
        } 
    },
    crouch(isPressed) { 
        if (this.isJumping) return; 
        if (isPressed && !this.isCrouching) { // 수그리기 시작 시 증기 효과
            createSteamEffect(this.x + this.width / 2, this.y + this.height / 2);
        }
        this.isCrouching = isPressed; 
    },
    shoot() {
        const armY = this.y + this.headRadius * 2 + (this.height - this.headRadius * 2) / 2;
        const laserX = this.x + this.width / 2;
        
        const laserProps = {
            x: laserX,
            y: armY,
            width: 20,
            height: 5,
            color: '#00ff00',
            direction: keys.b ? 'up' : this.direction
        };

        if (keys.b) {
            laserProps.width = 5;
            laserProps.height = 20;
            laserProps.x = laserX - laserProps.width / 2; // 중앙 정렬
        }

        lasers.push(laserProps);

        // 발사 섬광 효과
        particles.push({
            x: laserX, y: armY,
            dx: 0, dy: 0,
            radius: 8,
            color: '#fff',
            life: 5,
            startLife: 5
        });
    },
    takeDamage() {
        if (!this.isInvincible) {
            this.hp--;
            this.isInvincible = true;
            this.invincibleTimer = 120;
            if (this.hp <= 0) gameOver();
        }
    },
    usePotion() {
        if (this.inventory.potions > 0 && this.hp < this.maxHp) {
            this.inventory.potions--;
            this.hp = Math.min(this.maxHp, this.hp + 1);
            alert('체력을 1 회복했습니다.');
        }
    },
    knockback(amount) {
        this.x -= amount;
    },
    dash() {
        if (!this.isDashing && this.dashCooldown <= 0) {
            this.isDashing = true;
            this.dashTimer = 15; // 15프레임 (0.25초) 동안 대시
            this.dashCooldown = 60; // 60프레임 (1초) 쿨다운
            this.isInvincible = true; // 대시 중 무적
            this.invincibleTimer = 15;
        }
    }
};

// --- 퀘스트 데이터 ---
const quest = {
    id: 1,
    title: '일반 적 15마리 처치',
    goal: 15,
    reward: 100,
    isActive: false,
    isComplete: false
};

// --- 적/보스/NPC/발사체 생성 함수 ---
function createEnemy() {
    const size = 40;
    const newEnemy = {
        x: STAGE_WIDTH, y: STAGE_HEIGHT - GROUND_HEIGHT - size, width: size, height: size,
        speed: (Math.random() * 2 + 1) * (1 + (stage - 1) * 0.1),
        laserCooldown: (stage === 8) ? 300 : 0, // 5초 쿨다운 (60fps * 5)
        draw() { ctx.fillStyle = 'purple'; ctx.fillRect(this.x, this.y, this.width, this.height); },
        update(speedMultiplier = 1) { 
            this.x -= this.speed * speedMultiplier; 
            if (this.laserCooldown > 0) {
                this.laserCooldown--;
                if (this.laserCooldown === 0) {
                    this.shootLaser();
                    this.laserCooldown = 300;
                }
            }
        },
        shootLaser() {
            const angleToPlayer = Math.atan2((player.y + player.height / 2) - (this.y + this.height / 2), (player.x + player.width / 2) - (this.x + this.width / 2));
            bossProjectiles.push({
                x: this.x, y: this.y + this.height / 2, width: 15, height: 5, speed: 5, angle: angleToPlayer, type: 'laser',
                draw() { ctx.fillStyle = 'orange'; ctx.fillRect(this.x, this.y, this.width, this.height); },
                update(speedMultiplier = 1) { this.x += Math.cos(this.angle) * this.speed * speedMultiplier; this.y += Math.sin(this.angle) * this.speed * speedMultiplier; }
            });
        }
    };
    enemies.push(newEnemy);
    return newEnemy; // 반환하여 속성 수정 가능하게
}

function createBoss() {
    stages[stage - 1].createBoss();
}

function createStage1Boss() { 
    boss = {
        x: STAGE_WIDTH - 200, y: STAGE_HEIGHT - GROUND_HEIGHT - 150, width: 150, height: 150,
        hp: 1000 * (1 + (stage - 1) * 0.2), maxHp: 1000 * (1 + (stage - 1) * 0.2),
        attackCooldown: 0, pattern: 0,
        draw() {
            const centerX = this.x + this.width / 2, centerY = this.y + this.height / 2;
            ctx.fillStyle = '#333'; ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.strokeStyle = '#555'; ctx.strokeRect(this.x, this.y, this.width, this.height);
            ctx.fillStyle = '#00ff00'; ctx.font = '30px Arial'; ctx.fillText(':)', centerX - 15, centerY + 10);
            ctx.fillStyle = '#8B4513'; ctx.beginPath();
            ctx.arc(this.x, centerY, 20, 0, Math.PI * 2); ctx.arc(this.x + this.width, centerY, 20, 0, Math.PI * 2); ctx.fill();
        },
        update() {
            this.attackCooldown--;
            if (this.attackCooldown <= 0) this.chooseAttack();
        },
        chooseAttack() {
            this.pattern = Math.floor(Math.random() * 3);
            switch (this.pattern) {
                case 0: this.attackCooldown = 180; for (let i = 0; i < 10; i++) bossProjectiles.push(createBalloon(this.x, this.y + this.height / 2)); break;
                case 1: this.attackCooldown = 120; for (let i = 0; i < 5; i++) setTimeout(() => this.shootLaser(), i * 200); break;
                case 2: this.attackCooldown = 240; for (let i = 0; i < 5; i++) createLightningZone(Math.random() * STAGE_WIDTH); break;
            }
        },
        shootLaser() {
            if (!boss) return;
            const angle = Math.random() * Math.PI * 2;
            bossProjectiles.push({ 
                x: this.x + this.width / 2, y: this.y + this.height / 2, width: 10, height: 10, speed: 7, angle: angle, type: 'laser',
                draw() { ctx.fillStyle = 'red'; ctx.fillRect(this.x, this.y, this.width, this.height); },
                update(speedMultiplier = 1) { this.x += Math.cos(this.angle) * this.speed * speedMultiplier; this.y += Math.sin(this.angle) * this.speed * speedMultiplier; }
            });
        }
    };
 }
function createStage2Boss() { 
    boss = {
        x: STAGE_WIDTH - 200, y: STAGE_HEIGHT - GROUND_HEIGHT - 200, width: 100, height: 200,
        hp: 1200 * (1 + (stage - 1) * 0.2), maxHp: 1200 * (1 + (stage - 1) * 0.2),
        attackCooldown: 120,
        state: 'idle', // idle, slamming, shooting, leaving
        stateTimer: 0,
        slamTargetX: 0,
        slamStartY: 0,

        draw() {
            const centerX = this.x + this.width / 2;
            // 몸통 (전선)
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 15;
            ctx.beginPath();
            ctx.moveTo(centerX, this.y);
            for(let i = 0; i < this.height; i+=10) {
                ctx.lineTo(centerX + Math.sin(i * 0.5 + frameCount * 0.2) * 10, this.y + i);
            }
            ctx.lineTo(centerX, this.y + this.height);
            ctx.stroke();

            // 얼굴 (LED 전구)
            const headY = this.y;
            ctx.fillStyle = 'yellow';
            ctx.beginPath();
            ctx.arc(centerX, headY, 30, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
            ctx.beginPath();
            ctx.arc(centerX, headY, 40 + Math.sin(frameCount * 0.1) * 5, 0, Math.PI * 2);
            ctx.fill();

            // 인상 쓴 눈
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(centerX - 15, headY - 5);
            ctx.lineTo(centerX - 5, headY);
            ctx.moveTo(centerX + 15, headY - 5);
            ctx.lineTo(centerX + 5, headY);
            ctx.stroke();
        },
        update() {
            this.attackCooldown--;
            if (this.attackCooldown <= 0 && this.state === 'idle') {
                this.state = 'slamming';
                this.stateTimer = 180; // 3초간 패턴 지속
                this.slamTargetX = player.x;
                this.slamStartY = this.y;
            }

            switch(this.state) {
                case 'slamming':
                    // 플레이어 위치로 이동 후 내리꽂기
                    this.x = this.slamTargetX - this.width / 2;
                    this.y += 20; // 내리꽂는 속도
                    if (this.y >= STAGE_HEIGHT - GROUND_HEIGHT - this.height) {
                        this.y = STAGE_HEIGHT - GROUND_HEIGHT - this.height;
                        this.state = 'shooting';
                        this.stateTimer = 300; // 5초간 레이저 발사
                    }
                    break;
                case 'shooting':
                    this.stateTimer--;
                    // 5초간 사방으로 레이저 발사
                    if (this.stateTimer % 10 === 0) {
                        const angle = Math.random() * Math.PI * 2;
                        bossProjectiles.push({
                            x: this.x + this.width / 2, y: this.y, width: 15, height: 3, speed: 5, angle: angle, type: 'laser',
                            draw() { ctx.fillStyle = 'red'; ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle); ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height); ctx.restore(); },
                            update(speedMultiplier = 1) { this.x += Math.cos(this.angle) * this.speed * speedMultiplier; this.y += Math.sin(this.angle) * this.speed * speedMultiplier; }
                        });
                    }
                    if (this.stateTimer <= 0) {
                        this.stateTimer = 300; // 5초간 전기 장판 남김
                        createResidualElectric(this.x, this.y + this.height, this.width, this.stateTimer);
                        this.y = this.slamStartY; // 원래 위치로 복귀
                        this.x = STAGE_WIDTH - 200;
                        this.state = 'idle';
                        this.attackCooldown = 240; // 다음 공격까지 4초
                    }
                    break;
            }
        },
    };
}

function createStage3Boss() {
    boss = {
        x: STAGE_WIDTH - 150, y: STAGE_HEIGHT - GROUND_HEIGHT - 150, width: 150, height: 150,
        hp: 1500, maxHp: 1500,
        attackCooldown: 120, pattern: 0, state: 'idle', stateTimer: 0,
        dx: 0,
        draw() {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            // 몸통
            ctx.fillStyle = '#ff6b6b';
            ctx.beginPath();
            ctx.arc(centerX, centerY, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
            // 눈
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(centerX - 25, centerY - 10, 20, 0, Math.PI * 2);
            ctx.arc(centerX + 25, centerY - 10, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(centerX - 25, centerY - 10, 10, 0, Math.PI * 2);
            ctx.arc(centerX + 25, centerY - 10, 10, 0, Math.PI * 2);
            ctx.fill();
            // 인상
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(centerX - 40, centerY - 25);
            ctx.lineTo(centerX - 10, centerY - 15);
            ctx.moveTo(centerX + 40, centerY - 25);
            ctx.lineTo(centerX + 10, centerY - 15);
            ctx.stroke();
        },
        update() {
            this.attackCooldown--;
            if (this.attackCooldown <= 0 && this.state === 'idle') {
                this.pattern = Math.floor(Math.random() * 3);
                this.state = 'acting';
                switch (this.pattern) {
                    case 0: // 돌진
                        this.stateTimer = 120;
                        this.dx = -15;
                        break;
                    case 1: // 바닥 미끄럽게
                        this.stateTimer = 300;
                        isGroundSlippery = true;
                        break;
                    case 2: // 거품 발사
                        this.stateTimer = 300;
                        createLightningZone(player.x - 50); // 플레이어 뒤에 번개
                        break;
                }
            }

            if (this.state === 'acting') {
                this.stateTimer--;
                switch (this.pattern) {
                    case 0: // 돌진 중
                        this.x += this.dx;
                        if (this.x < 0) this.dx = 15;
                        if (this.x > STAGE_WIDTH - this.width) this.dx = -15;
                        break;
                    case 2: // 거품 발사 중
                        if (this.stateTimer % 15 === 0) {
                            bubbles.push({ 
                                x: this.x, y: this.y + Math.random() * this.height, 
                                width: 30, height: 30, speed: 5 + Math.random() * 5 
                            });
                        }
                        break;
                }
                if (this.stateTimer <= 0) {
                    this.state = 'idle';
                    this.attackCooldown = 120;
                    if (this.pattern === 1) isGroundSlippery = false;
                }
            }
        }
    };
}

function createStage5Boss() { 
    boss = {
        x: STAGE_WIDTH - 200, y: STAGE_HEIGHT - GROUND_HEIGHT - 150, width: 150, height: 150,
        hp: 2000, 
        maxHp: 2000,
        attackCooldown: 0, pattern: 0,
        draw() { 
            const centerX = this.x + this.width / 2, centerY = this.y + this.height / 2;
            ctx.fillStyle = '#581845'; // Dark purple
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.strokeStyle = '#FF5733'; // Orange
            ctx.strokeRect(this.x, this.y, this.width, this.height);
            ctx.fillStyle = '#FF5733'; ctx.font = 'bold 30px Arial'; ctx.fillText('>:)', centerX - 25, centerY + 10);
            ctx.fillStyle = '#C70039'; // Dark red
            ctx.beginPath();
            ctx.arc(this.x, centerY, 20, 0, Math.PI * 2); ctx.arc(this.x + this.width, centerY, 20, 0, Math.PI * 2); ctx.fill();
        },
        update() {
            this.attackCooldown--;
            if (this.attackCooldown <= 0) this.chooseAttack();
        },
        chooseAttack() {
            this.pattern = Math.floor(Math.random() * 3);
            switch (this.pattern) {
                case 0: this.attackCooldown = 120; for (let i = 0; i < 15; i++) bossProjectiles.push(createBalloon(this.x, this.y + this.height / 2)); break;
                case 1: this.attackCooldown = 90; for (let i = 0; i < 8; i++) setTimeout(() => this.shootLaser(), i * 150); break;
                case 2: this.attackCooldown = 180; for (let i = 0; i < 7; i++) createLightningZone(Math.random() * STAGE_WIDTH); break;
            }
        },
        shootLaser() {
            if (!boss) return;
            const angle = Math.random() * Math.PI * 2;
            bossProjectiles.push({ 
                x: this.x + this.width / 2, y: this.y + this.height / 2, width: 12, height: 12, speed: 9, angle: angle, type: 'laser',
                draw() { ctx.fillStyle = '#FF5733'; ctx.fillRect(this.x, this.y, this.width, this.height); },
                update(speedMultiplier = 1) { this.x += Math.cos(this.angle) * this.speed * speedMultiplier; this.y += Math.sin(this.angle) * this.speed * speedMultiplier; }
            });
        }
    };
 }

function createStage6Boss() {
    boss = {
        x: STAGE_WIDTH / 2 - 75, y: STAGE_HEIGHT - GROUND_HEIGHT - 80, width: 150, height: 80,
        hp: 2000, maxHp: 2000,
        state: 'idle', // idle, ascending, bombing
        stateTimer: 300, // 5초 대기 (60fps * 5)
        targetY: 100,
        rotorAngle: 0,
        draw() {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;

            // Rotor
            this.rotorAngle += 0.5;
            ctx.save();
            ctx.translate(centerX, this.y);
            ctx.rotate(this.rotorAngle);
            ctx.fillStyle = '#555';
            ctx.fillRect(-80, -5, 160, 10);
            ctx.restore();

            // Body
            ctx.fillStyle = '#34495e';
            ctx.beginPath();
            ctx.ellipse(centerX, centerY, this.width / 2, this.height / 2, 0, 0, Math.PI * 2);
            ctx.fill();

            // Cockpit
            ctx.fillStyle = '#aed6f1';
            ctx.beginPath();
            ctx.ellipse(this.x + this.width - 20, centerY, 30, 25, 0, 0, Math.PI * 2);
            ctx.fill();

            // Tail
            ctx.fillStyle = '#555';
            ctx.fillRect(this.x - 50, centerY - 5, 50, 10);
        },
        update() {
            this.stateTimer--;
            switch (this.state) {
                case 'idle':
                    if (this.stateTimer <= 0) {
                        this.state = 'ascending';
                    }
                    break;
                case 'ascending':
                    this.y -= 2;
                    if (this.y <= this.targetY) {
                        this.y = this.targetY;
                        this.state = 'bombing';
                        this.stateTimer = 0;
                    }
                    break;
                case 'bombing':
                    this.x += Math.sin(frameCount * 0.02) * 3;
                    this.stateTimer--;
                    if (this.stateTimer <= 0) {
                        this.stateTimer = 120; // 2초마다 폭탄 투하
                        bossProjectiles.push({
                            x: this.x + this.width / 2, y: this.y + this.height, 
                            width: 20, height: 20, speedY: 3, type: 'bomb',
                            draw() {
                                ctx.fillStyle = 'black';
                                ctx.beginPath();
                                ctx.arc(this.x, this.y, this.width/2, 0, Math.PI*2);
                                ctx.fill();
                            },
                            update() {
                                this.y += this.speedY;
                                if (this.y >= STAGE_HEIGHT - GROUND_HEIGHT - this.height/2) {
                                    createFire(this.x, STAGE_HEIGHT - GROUND_HEIGHT, 50, 180);
                                    const index = bossProjectiles.indexOf(this);
                                    if(index > -1) bossProjectiles.splice(index, 1);
                                }
                            }
                        });
                    }
                    break;
            }
        }
    };
}

function createStage7Boss() {
    boss = {
        x: STAGE_WIDTH / 2 - 75, y: STAGE_HEIGHT - GROUND_HEIGHT - 150, width: 150, height: 150,
        hp: 4000, maxHp: 4000,
        state: 'phase1', // phase1, frenzy, idle
        stateTimer: 0,
        attackCooldown: 120,
        frenzyDuration: 7 * 60, // 7초
        dx: 0,

        draw() {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            // 몸체
            ctx.fillStyle = '#444';
            ctx.beginPath();
            ctx.arc(centerX, centerY, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
            // 빨간 눈
            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.arc(centerX, centerY, 40 + Math.sin(frameCount * 0.2) * 5, 0, Math.PI * 2);
            ctx.fill();
        },
        update() {
            this.attackCooldown--;

            if (this.state === 'phase1' && this.attackCooldown <= 0) {
                this.chooseAttack();
            } else if (this.state === 'frenzy') {
                this.stateTimer--;
                // 7초간 모든 패턴 동시 사용
                if (this.stateTimer % 30 === 0) { // 돌진
                    this.dx = player.x < this.x ? -10 : 10;
                }
                this.x += this.dx;
                if (this.x < 0 || this.x > STAGE_WIDTH - this.width) this.dx *= -1;


                if (this.stateTimer % 20 === 0) { // 번개
                    createLightningZone(Math.random() * STAGE_WIDTH);
                }
                if (this.stateTimer % 15 === 0) { // 폭탄
                    bossProjectiles.push({
                        x: this.x + this.width / 2, y: this.y + this.height,
                        width: 20, height: 20, speedY: 4, type: 'bomb',
                        draw() { ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2); ctx.fill(); },
                        update() {
                            this.y += this.speedY;
                            if (this.y >= STAGE_HEIGHT - GROUND_HEIGHT - this.height / 2) {
                                createFire(this.x, STAGE_HEIGHT - GROUND_HEIGHT, 50, 120);
                                const index = bossProjectiles.indexOf(this);
                                if (index > -1) bossProjectiles.splice(index, 1);
                            }
                        }
                    });
                }

                if (this.stateTimer <= 0) {
                    this.state = 'phase1';
                    this.attackCooldown = 180;
                }
            }
            
            // HP가 50% 이하일 때 frenzy 모드 돌입
            if (this.hp < this.maxHp / 2 && this.state !== 'frenzy') {
                this.state = 'frenzy';
                this.stateTimer = this.frenzyDuration;
            }
        },
        chooseAttack() {
            const pattern = Math.floor(Math.random() * 3);
            switch (pattern) {
                case 0: // 양쪽에서 적 소환
                    this.attackCooldown = 180;
                    for(let i=0; i<3; i++) {
                        setTimeout(() => createEnemy(), i * 500);
                        setTimeout(() => { // 오른쪽에서도 소환
                            const enemy = createEnemy();
                            enemy.x = 0;
                            enemy.speed *= -1; // 반대 방향으로 이동
                        }, i * 500 + 250);
                    }
                    break;
                case 1: // 가로 레이저 10번
                    this.attackCooldown = 300;
                    for (let i = 0; i < 10; i++) {
                        setTimeout(() => this.shootHorizontalLaser(), i * 300);
                    }
                    break;
                case 2: // 세로 레이저
                    this.attackCooldown = 240;
                    for (let i = 0; i < 8; i++) {
                        setTimeout(() => this.shootVerticalLaser(), i * 100);
                    }
                    break;
            }
        },
        shootHorizontalLaser() {
            if (!boss) return;
            bossProjectiles.push({
                x: 0, y: Math.random() * (STAGE_HEIGHT - GROUND_HEIGHT - 20),
                width: STAGE_WIDTH, height: 10, timer: 30, // 0.5초
                type: 'wide_laser',
                draw() {
                    ctx.fillStyle = `rgba(255, 0, 0, ${0.2 + (this.timer / 30) * 0.8})`;
                    ctx.fillRect(this.x, this.y, this.width, this.height);
                },
                update() {
                    this.timer--;
                    if (this.timer <= 0) {
                        const index = bossProjectiles.indexOf(this);
                        if (index > -1) bossProjectiles.splice(index, 1);
                    }
                }
            });
        },
        shootVerticalLaser() {
            if (!boss) return;
            createLightningZone(Math.random() * STAGE_WIDTH); // 기존 번개 이펙트 재활용
        }
    };
}

function createHiddenBoss() {
    isFightingHiddenBoss = true;
    boss = {
        x: STAGE_WIDTH / 2 - 100, y: STAGE_HEIGHT - GROUND_HEIGHT - 200, width: 200, height: 200,
        hp: 5000, maxHp: 5000,
        attackCooldown: 180,
        pattern: 0,
        state: 'idle',
        stateTimer: 0,
        draw() {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;

            // Hoodie
            ctx.fillStyle = '#1a1a1a'; // Dark gray hoodie
            ctx.beginPath();
            ctx.moveTo(this.x, this.y + this.height);
            ctx.lineTo(this.x, centerY);
            ctx.quadraticCurveTo(centerX, this.y - 20, this.x + this.width, centerY);
            ctx.lineTo(this.x + this.width, this.y + this.height);
            ctx.closePath();
            ctx.fill();

            // Face shadow
            ctx.fillStyle = '#000';
            ctx.fillRect(centerX - 50, centerY - 20, 100, 80);

            // Glowing green glasses
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(centerX - 40, centerY, 30, 15);
            ctx.fillRect(centerX + 10, centerY, 30, 15);
            ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
            ctx.shadowColor = '#00ff00';
            ctx.shadowBlur = 20;
            ctx.fillRect(centerX - 45, centerY - 5, 40, 25);
            ctx.fillRect(centerX + 5, centerY - 5, 40, 25);
            ctx.shadowBlur = 0;

            // Laptop screen glow on body
            ctx.fillStyle = 'rgba(0, 100, 255, 0.2)';
            ctx.fillRect(this.x + 20, this.y + this.height - 80, this.width - 40, 60);
        },
        update() {
            this.attackCooldown--;
            if (this.attackCooldown <= 0 && this.state === 'idle') {
                this.state = 'acting';
                this.pattern = Math.floor(Math.random() * 3);
                switch (this.pattern) {
                    case 0: // Bomb barrage
                        this.stateTimer = 180; // 3 seconds of bombs
                        this.attackCooldown = 240;
                        break;
                    case 1: // Slippery floor + lightning + laser
                        this.stateTimer = 600; // 10 seconds for this hell
                        isGroundSlippery = true;
                        this.attackCooldown = 720;
                        break;
                    case 2: // Balloon burst
                        this.stateTimer = 180;
                        this.attackCooldown = 240;
                        break;
                }
            }

            if (this.state === 'acting') {
                this.stateTimer--;
                switch (this.pattern) {
                    case 0: // Bomb barrage
                        if (this.stateTimer % 15 === 0) {
                            this.shootHorizontalBomb();
                        }
                        break;
                    case 1: // Slippery floor combo
                        if (this.stateTimer % 120 === 0) { // Every 2 seconds
                            createLightningZone(player.x - 50);
                        }
                        if (this.stateTimer % 60 === 0) { // Every 1 second
                            this.shootSlowLaser();
                        }
                        break;
                    case 2: // Balloon burst
                        if (this.stateTimer === 180 || this.stateTimer === 120 || this.stateTimer === 60) {
                             for (let i = 0; i < 5; i++) bossProjectiles.push(createBalloon(this.x, this.y + this.height / 2));
                        }
                        break;
                }

                if (this.stateTimer <= 0) {
                    this.state = 'idle';
                    if (this.pattern === 1) {
                        isGroundSlippery = false;
                    }
                }
            }
        },
        shootHorizontalBomb() {
            bossProjectiles.push({
                x: 0, y: STAGE_HEIGHT - GROUND_HEIGHT - 40, // Fly just above the ground
                width: 30, height: 30, speedX: 8, type: 'bomb',
                draw() {
                    ctx.fillStyle = 'red';
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.width/2, 0, Math.PI*2);
                    ctx.fill();
                },
                update() {
                    this.x += this.speedX;
                    // Explode on player collision or off-screen
                    if (isColliding(player, this) || this.x > STAGE_WIDTH) {
                        if(isColliding(player, this)) player.takeDamage();
                        const index = bossProjectiles.indexOf(this);
                        if(index > -1) bossProjectiles.splice(index, 1);
                    }
                }
            });
        },
        shootSlowLaser() {
            bossProjectiles.push({
                x: STAGE_WIDTH, y: Math.random() * (STAGE_HEIGHT - GROUND_HEIGHT - 20),
                width: STAGE_WIDTH, height: 15, timer: 60, // 1 second duration
                speedX: 2, // Slow moving laser
                type: 'wide_laser',
                draw() {
                    ctx.fillStyle = `rgba(255, 100, 0, ${0.2 + (this.timer / 60) * 0.6})`;
                    ctx.fillRect(this.x, this.y, this.width, this.height);
                },
                update() {
                    this.timer--;
                    this.x -= this.speedX; // Move slowly from right to left
                    if (this.timer <= 0) {
                        const index = bossProjectiles.indexOf(this);
                        if (index > -1) bossProjectiles.splice(index, 1);
                    }
                }
            });
        }
    };
}


function createBalloon(x, y) {
    const angleToPlayer = Math.atan2(player.y - y, player.x - x);
    return {
        x: x, y: y, width: 30, height: 20, speed: Math.random() * 2 + 2, angle: angleToPlayer, type: 'balloon',
        draw() { ctx.fillStyle = 'cyan'; ctx.beginPath(); ctx.ellipse(this.x, this.y, this.width / 2, this.height / 2, 0, 0, Math.PI * 2); ctx.fill(); },
        update(speedMultiplier = 1) { this.x += Math.cos(this.angle) * this.speed * speedMultiplier; this.y += Math.sin(this.angle) * this.speed * speedMultiplier; }
    };
}

function createLightningZone(x) {
    const zone = {
        x: x - 50, y: 0, width: 100, height: STAGE_HEIGHT - GROUND_HEIGHT, timer: 120, active: false,
        draw() {
            if (!this.active) { 
                ctx.fillStyle = 'rgba(255, 255, 0, 0.2)'; 
                ctx.fillRect(this.x, this.y, this.width, this.height); 
            } else { 
                ctx.fillStyle = 'yellow'; 
                ctx.fillRect(this.x, this.y, this.width, this.height); 
            }
        },
        update() {
            this.timer--;
            if (this.timer <= 0 && !this.active) {
                this.active = true; this.timer = 60;
            }
            if (this.active) {
                 if (isColliding(player, this)) player.takeDamage();
            }
            if (this.active && this.timer <= 0) {
                const index = lightningZones.indexOf(this);
                if (index > -1) lightningZones.splice(index, 1);
            }
        }
    };
    lightningZones.push(zone);
}

// 스테이지 2 보스의 잔류 전기 공격
function createResidualElectric(x, y, width, duration) {
    residualElectrics.push({
        x: x, y: y - 20, width: width, height: 20, timer: duration,
        draw() {
            ctx.fillStyle = `rgba(255, 255, 0, ${0.2 + Math.random() * 0.3})`;
            ctx.beginPath();
            const groundY = STAGE_HEIGHT - GROUND_HEIGHT;
            ctx.moveTo(this.x, groundY);
            for(let i=0; i<this.width; i+=10) {
                ctx.lineTo(this.x + i, groundY - Math.random() * this.height);
            }
            ctx.lineTo(this.x + this.width, groundY);
            ctx.closePath();
            ctx.fill();
        },
        update() {
            this.timer--;
            if (isColliding(player, this)) {
                player.takeDamage();
            }
        }
    });
}

function createFire(x, y, width, duration) {
    fires.push({
        x: x - width / 2, y: y - 30, width: width, height: 30, timer: duration,
        draw() {
            ctx.fillStyle = `rgba(255, ${Math.random() * 100}, 0, 0.7)`;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y + this.height);
            for(let i=0; i < this.width; i+=5) {
                ctx.lineTo(this.x + i, this.y + this.height - (Math.random() * this.height));
            }
            ctx.lineTo(this.x + this.width, this.y + this.height);
            ctx.closePath();
            ctx.fill();
        },
        update() {
            this.timer--;
            if(isColliding(player, this)) player.takeDamage();
        }
    });
}

// --- 파티클 효과 생성 함수 ---
function createDustEffect(x, y) {
    for (let i = 0; i < 5; i++) {
        particles.push({
            x: x, y: y,
            dx: (Math.random() - 0.5) * 2,
            dy: Math.random() * -1.5,
            radius: Math.random() * 3 + 1,
            color: '#888',
            life: 20,
            startLife: 20
        });
    }
}

function createSparkEffect(x, y) {
    for (let i = 0; i < 8; i++) {
        particles.push({
            x: x, y: y,
            dx: (Math.random() - 0.5) * 4,
            dy: (Math.random() - 0.5) * 4,
            radius: Math.random() * 2 + 1,
            color: '#ffcc00',
            life: 15,
            startLife: 15
        });
    }
}

function createSteamEffect(x, y) {
     for (let i = 0; i < 3; i++) {
        particles.push({
            x: x + (Math.random() - 0.5) * 10, y: y,
            dx: (Math.random() - 0.5) * 0.5,
            dy: -0.5 - Math.random() * 0.5,
            radius: Math.random() * 4 + 2,
            color: '#fff',
            life: 25,
            startLife: 25
        });
    }
}

function createDashParticle(x, y) {
    const angle = player.direction === 'right' ? Math.PI : 0;
    for (let i = 0; i < 5; i++) {
        particles.push({
            x: x,
            y: y + (Math.random() - 0.5) * 20,
            dx: Math.cos(angle) * (Math.random() * 3 + 2),
            dy: (Math.random() - 0.5) * 1,
            radius: Math.random() * 2 + 1,
            color: '#fff',
            life: 15,
            startLife: 15
        });
    }
}


const npcs = {
    villageChief: { x: 150, y: STAGE_HEIGHT - GROUND_HEIGHT - 80, width: 50, height: 80, color: 'green' },
    merchant: { x: 600, y: STAGE_HEIGHT - GROUND_HEIGHT - 80, width: 50, height: 80, color: 'blue' },
    radio: { x: 400, y: STAGE_HEIGHT - GROUND_HEIGHT - 60, width: 40, height: 40, color: 'red' }
};

// --- 입력 처리 ---
const keys = { left: false, right: false, down: false, e: false, p: false, m: false, b: false };
function handleKeyDown(e) {
    const key = e.key.toLowerCase();

    // --- 치트키 ---
    if (key === 'h') {
        isOneShotMode = !isOneShotMode;
        alert(`한방 모드 ${isOneShotMode ? '활성화' : '비활성화'}`);
        return;
    }
    if (key === '0') {
        nextStage();
        return;
    }
    // ---

    if (activeUI) {
        if (key === 'e') keys.e = true;
        return;
    }

    if (key === 'arrowleft' || key === 'a') { keys.left = true; player.direction = 'left'; }
    if (key === 'arrowright' || key === 'd') { keys.right = true; player.direction = 'right'; }
    if (key === 'arrowdown' || key === 's') { keys.down = true; player.crouch(true); }
    if (key === 'arrowup' || key === 'w') player.jump();
    if (key === '/') player.dash();
    if (key === ' ') { e.preventDefault(); player.shoot(); }
    if (key === 'e') keys.e = true;
    if (key === 'p') player.usePotion();
    if (key === 'b') keys.b = true;
    
}
function handleKeyUp(e) {
    const key = e.key.toLowerCase();
    if (key === 'arrowleft' || key === 'a') keys.left = false;
    if (key === 'arrowright' || key === 'd') keys.right = false;
    if (key === 'arrowdown' || key === 's') { keys.down = false; player.crouch(false); }
    if (key === 'e') keys.e = false;
    if (key === 'b') keys.b = false;
}
document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);

function handleMouseClick(e) {
    const rect = canvas.getBoundingClientRect();
    let mouseX = e.clientX - rect.left;
    let mouseY = e.clientY - rect.top;

    const mousePos = { x: mouseX, y: mouseY, width: 1, height: 1 };

    if (gameState === 'ending') {
        endingPage++;
        // There are 5 ending texts (0-4). After the last one, reload.
        if (endingPage >= 5) {
            document.location.reload();
        }
        return;
    }

    if (gameState === 'reviving') {
        villageVisitCount--;
        player.hp = player.maxHp;
        player.isInvincible = true;
        player.invincibleTimer = 600; // 10초
        isPoweredUp = true;
        powerUpTimer = 600;
        gameState = 'stage';
        return;
    }

    if (gameState === 'story') {
        storyPage++;
        if (storyPage > 2) {
            startTutorial();
        }
        return;
    }

    if (gameState === 'menu') {
        Object.keys(ultimates).forEach((id, index) => {
            const ultButton = { x: 250, y: 150 + index * 60, width: 300, height: 50 };
            if (isColliding(mousePos, ultButton) && ultimates[id].purchased) {
                player.equippedUltimate = id;
            }
        });
        const villageButton = { x: STAGE_WIDTH - 170, y: 20, width: 150, height: 40 }; // Positioned top right
        if(isColliding(mousePos, villageButton)) goToVillage();

    } else if (gameState === 'stage' && isColliding(mousePos, { x: STAGE_WIDTH - 120, y: 10, width: 110, height: 30 })) {
        goToVillage();
    } else if (gameState === 'village') {
        if (isColliding(mousePos, { x: STAGE_WIDTH - 140, y: 10, width: 120, height: 30 })) goToStage();
    }

    if (activeUI === 'shop') {
        let itemY = 220;
        // 소모품 구매
        const potion = shopConsumables.potion;
        const potionButton = { x: 250, y: itemY, width: 300, height: 30 };
        if(isColliding(mousePos, potionButton)) buyItem(potion);
        itemY += 60;

        
    } else if (activeUI === 'quest') {
        const acceptButton = { x: 350, y: 280, width: 100, height: 30 };
        if (isColliding(mousePos, acceptButton)) acceptQuest();
    }
}
canvas.addEventListener('click', handleMouseClick);

// --- Mobile Controls --- 
const leftBtn = document.getElementById('left-btn');
const rightBtn = document.getElementById('right-btn');
const jumpBtn = document.getElementById('jump-btn');
const crouchBtn = document.getElementById('crouch-btn');
const shootBtn = document.getElementById('shoot-btn');
const dashBtn = document.getElementById('dash-btn');
const ultimateBtn = document.getElementById('ultimate-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');

fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
});

function handleTouchStart(e) {
    e.preventDefault();
    const targetId = e.target.id;
    switch (targetId) {
        case 'left-btn':
            keys.left = true;
            player.direction = 'left';
            break;
        case 'right-btn':
            keys.right = true;
            player.direction = 'right';
            break;
        case 'jump-btn':
            player.jump();
            break;
        case 'crouch-btn':
            keys.down = true;
            player.crouch(true);
            break;
        case 'shoot-btn':
            player.shoot();
            break;
        case 'dash-btn':
            player.dash();
            break;
        

    }
}

function handleTouchEnd(e) {
    e.preventDefault();
    const targetId = e.target.id;
    if (targetId === 'left-btn') {
        keys.left = false;
    } else if (targetId === 'right-btn') {
        keys.right = false;
    } else if (targetId === 'crouch-btn') {
        keys.down = false;
        player.crouch(false);
    }
}

leftBtn.addEventListener('touchstart', handleTouchStart, { passive: false });
rightBtn.addEventListener('touchstart', handleTouchStart, { passive: false });
jumpBtn.addEventListener('touchstart', handleTouchStart, { passive: false });
crouchBtn.addEventListener('touchstart', handleTouchStart, { passive: false });
shootBtn.addEventListener('touchstart', handleTouchStart, { passive: false });
dashBtn.addEventListener('touchstart', handleTouchStart, { passive: false });
ultimateBtn.addEventListener('touchstart', handleTouchStart, { passive: false });

leftBtn.addEventListener('touchend', handleTouchEnd, { passive: false });
rightBtn.addEventListener('touchend', handleTouchEnd, { passive: false });
crouchBtn.addEventListener('touchend', handleTouchEnd, { passive: false });

// --- Canvas Resizing --- 
function resizeCanvas() {
    canvas.width = 800;
    canvas.height = 500;
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', resizeCanvas);


// ====================================================================
//                         게임 상태별 로직
// ====================================================================

function updateLogic() {
    if (activeUI) {
        if (keys.e) { activeUI = null; keys.e = false; }
        return;
    }
    if (gameState === 'story') { /* No updates needed */ }
    else if (gameState === 'tutorial') updateTutorialLogic();
    
    else if (gameState === 'stage') updateStageLogic();
    else if (gameState === 'village') updateVillageLogic();
    else if (gameState === 'reviving') { /* Do nothing */ }
    else if (gameState === 'ending') { /* Do nothing */ }
}

function draw() {
    ctx.save();
    ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

    // 땅을 내려다보는 듯한 효과를 주기 위해 화면을 변형합니다.
    // ctx.transform(1, 0, -0.2, 0.5, 0, 200);

    if (gameState === 'story') drawStory();
    else if (gameState === 'tutorial') drawTutorial();
    
    else if (gameState === 'stage') drawStage();
    else if (gameState === 'village') drawVillage();
    else if (gameState === 'reviving') drawRevivalScreen();
    else if (gameState === 'ending') drawEndingScreen();

    if (activeUI === 'quest') drawQuestUI();
    else if (activeUI === 'shop') drawShopUI();

    ctx.restore();
}

// --- 스토리 로직 ---
function drawStory() {
    const storyText = [
        "미래 언제 머~언 미래에",
        "멋진 ai가 만들어 지는 공장이 있었다.",
        "사람들에게 도움을 주는 ai가 되기 위해서 보스들을 물리치러 가는데....!"
    ];

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

    ctx.fillStyle = 'black';
    ctx.font = '30px Arial';
    ctx.textAlign = 'center';
    
    if (storyPage < storyText.length) {
        ctx.fillText(storyText[storyPage], STAGE_WIDTH / 2, STAGE_HEIGHT / 2);
    }

    ctx.font = '16px Arial';
    ctx.fillText('(화면을 터치하여 계속)', STAGE_WIDTH / 2, STAGE_HEIGHT - 50);
    ctx.textAlign = 'left'; // Reset alignment for other functions
}

// --- 튜토리얼 로직 ---
function startTutorial() {
    gameState = 'tutorial';
    player.x = 100;
    player.y = STAGE_HEIGHT - GROUND_HEIGHT - player.height;
    tutorialState = {
        step: 0,
        movedLeft: false,
        movedRight: false,
        jumped: false,
        crouched: false,
        shot: false,
        ultimateUsed: false,
        dashed: false
    };
}

function updateTutorialLogic() {
    player.update();

    switch (tutorialState.step) {
        case 0: // Move
            if (keys.left) tutorialState.movedLeft = true;
            if (keys.right) tutorialState.movedRight = true;
            if (tutorialState.movedLeft && tutorialState.movedRight) {
                tutorialState.step++;
            }
            break;
        case 1: // Jump
            if (player.isJumping) {
                tutorialState.jumped = true;
            }
            if (tutorialState.jumped && !player.isJumping) { // 점프 후 착지까지 확인
                tutorialState.step++;
            }
            break;
        case 2: // Crouch
            if (player.isCrouching) {
                tutorialState.crouched = true;
            }
            if(tutorialState.crouched && !player.isCrouching) { // 앉았다가 일어서면
                 tutorialState.step++;
            }
            break;
        case 3: // Shoot
            if (lasers.length > 0) {
                tutorialState.shot = true;
            }
            if (tutorialState.shot) {
                tutorialState.step++;
                lasers.length = 0; // 튜토리얼 레이저 정리
            }
            break;
        case 4: // Dash
            if (player.isDashing) {
                tutorialState.dashed = true;
            }
            if (tutorialState.dashed) {
                tutorialState.step++;
                 // 튜토리얼 완료 후 잠시 대기했다가 마을로 이동
                setTimeout(() => {
                    goToVillage();
                }, 2000);
            }
            break;
    }
}


function drawTutorial() {
    drawTutorialBackground();
    player.draw();
    lasers.forEach(l => ctx.fillRect(l.x, l.y, l.width, l.height));


    ctx.fillStyle = 'white';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    let instructionText = '';

    switch (tutorialState.step) {
        case 0:
            instructionText = 'A/D 또는 ←/→ 키를 눌러 양쪽으로 움직여보세요.';
            break;
        case 1:
            instructionText = '잘했어요! 이제 W 또는 ↑ 키를 눌러 점프해보세요.';
            break;
        case 2:
            instructionText = '좋아요! S 또는 ↓ 키를 눌러 앉아보세요.';
            break;
        case 3:
            instructionText = '완벽해요! 스페이스바를 눌러 공격해보세요.';
            break;
        case 4:
            instructionText = '마지막으로 / 키를 눌러 대시해보세요.';
            break;
        case 5:
            instructionText = '튜토리얼 완료! 잠시 후 마을로 이동합니다.';
            break;
    }

    ctx.fillText(instructionText, STAGE_WIDTH / 2, 100);

    ctx.textAlign = 'left';
}

function drawTutorialBackground() {
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    ctx.fillStyle = '#555';
    ctx.fillRect(0, STAGE_HEIGHT - GROUND_HEIGHT, STAGE_WIDTH, GROUND_HEIGHT);
}




// --- 스테이지 로직 ---
function updateStageLogic() {
    const currentStageData = stages[stage - 1];

    if (stage === 7 && !isFightingHiddenBoss) {
        if (isBossFight && !boss && !isSpawningNextBoss) { // 보스러시 중 보스가 죽으면
            isSpawningNextBoss = true;
            currentBossIndex++;
            if (currentBossIndex < stage7BossRush.length) {
                // 잠시 후 다음 보스 등장
                setTimeout(() => {
                    stage7BossRush[currentBossIndex]();
                    isSpawningNextBoss = false; // 보스 스폰 완료
                }, 2000);
            } else {
                nextStage(); // 모든 보스 클리어
            }
        }
    } else if (currentStageData.type === 'survival' && !isBossFight) {
        gameTimer += 1 / 60;
        if (gameTimer >= currentStageData.survivalTime) {
            isBossFight = true;
            enemies.length = 0; // 보스전 시작 시 일반 몹 제거
            createBoss();
        }
    } else if (!isFightingHiddenBoss) {
        if (currentStageData.type === 'boss' && !isBossFight) {
            gameTimer += 1 / 60;
            if (gameTimer >= currentStageData.bossSpawnTime) {
                isBossFight = true;
                enemies.length = 0;
                createBoss();
            }
        }
    }

    player.update();

    let speedMultiplier = 1;

    checkStageCollisions();

    for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        if (l.direction === 'right') {
            l.x += LASER_SPEED;
        } else if (l.direction === 'left') {
            l.x -= LASER_SPEED;
        } else if (l.direction === 'up') {
            l.y -= LASER_SPEED;
        }

        if (l.x > STAGE_WIDTH || l.x < 0 || l.y < 0) {
            lasers.splice(i, 1);
        }
    }

    // Enemy spawning logic
    if (!isBossFight) {
        const maxEnemies = (currentStageData.type === 'kill') ? 5 : 3;
        if (frameCount % 80 === 0 && enemies.length < maxEnemies) {
             createEnemy();
        }
    }
    
    enemies.forEach(e => e.update(speedMultiplier));
    for (let i = enemies.length - 1; i >= 0; i--) { if (enemies[i].x + enemies[i].width < 0) enemies.splice(i, 1); }
    
    if (isBossFight && boss) { 
        boss.update(); 
    }
    
    bubbles.forEach((b, i) => {
        b.x -= b.speed;
        if (b.x < -b.width) bubbles.splice(i, 1);
    });
    for (let i = bossProjectiles.length - 1; i >= 0; i--) {
        const p = bossProjectiles[i];
        p.update(speedMultiplier);
        if (p.x < -p.width || p.x > STAGE_WIDTH || p.y < -p.height || p.y > STAGE_HEIGHT) bossProjectiles.splice(i, 1);
    }
    lightningZones.forEach(z => z.update());
    for (let i = residualElectrics.length - 1; i >= 0; i--) {
        const r = residualElectrics[i];
        r.update();
        if (r.timer <= 0) residualElectrics.splice(i, 1);
    }
    for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i];
        f.update();
        if (f.timer <= 0) fires.splice(i, 1);
    }
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.update();
        if (o.x < -o.width || o.x > STAGE_WIDTH) obstacles.splice(i, 1);
    }

    

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.dx;
        p.y += p.dy;
        p.life--;
        if (p.radius > 0.2) p.radius -= 0.1;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function checkStageCollisions() {
    for (let i = lasers.length - 1; i >= 0; i--) {
        const laser = lasers[i];
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (isColliding(laser, enemies[j])) {
                createSparkEffect(laser.x, laser.y); // 스파크 효과
                enemies.splice(j, 1);
                lasers.splice(i, 1);
                player.coins += 10;
                playSound('coin');
                player.enemyKillCount++;

                const currentStageData = stages[stage - 1];
                if (currentStageData.type === 'kill' && player.enemyKillCount >= currentStageData.killGoal) {
                    nextStage();
                }
                break;
            }
        }
    }
    if (isBossFight && boss) {
        for (let i = lasers.length - 1; i >= 0; i--) {
            const laser = lasers[i];
            if (isColliding(laser, boss)) {
                if (isOneShotMode) {
                    boss.hp = 0;
                } else {
                    const damage = isPoweredUp ? 50 : 10;
                    boss.hp -= damage;
                }
                createSparkEffect(laser.x, laser.y); // 스파크 효과
                lasers.splice(i, 1);
                if (boss.hp <= 0) {
                    player.coins += 1000;
                    playSound('coin');
                    
                    if (stage === 8) {
                        nextStage();
                        return;
                    }

                    const isFinalBoss = (stage === 7 && !isFightingHiddenBoss && currentBossIndex === stage7BossRush.length - 1) || isFightingHiddenBoss;

                    if (isFinalBoss) {
                        boss = null;
                        startDiamondStage();
                    } else {
                        boss = null; // 보스 사망 처리
                        if (stage !== 7) {
                            nextStage();
                        }
                    }
                }
                break;
            }
        }
    }
    for (const enemy of enemies) { if (isColliding(player, enemy)) player.takeDamage(); }
    for (const p of bossProjectiles) { if (isColliding(player, p)) player.takeDamage(); }
    for (let i = bubbles.length - 1; i >= 0; i--) {
        if (isColliding(player, bubbles[i])) {
            player.knockback(50);
            bubbles.splice(i, 1);
        }
    }
    for (const fire of fires) { if(isColliding(player, fire)) player.takeDamage(); }
    for (const obstacle of obstacles) { if (isColliding(player, obstacle)) player.takeDamage(); }
}

function drawStage() {
    const currentStage = stages[stage - 1];
    currentStage.drawBackground();

    player.draw();
    enemies.forEach(e => e.draw());
    if (isBossFight && boss) boss.draw();
    bossProjectiles.forEach(p => p.draw());
    lightningZones.forEach(z => z.draw());
    residualElectrics.forEach(r => r.draw());
    fires.forEach(f => f.draw());
    obstacles.forEach(o => o.draw());
    bubbles.forEach(b => {
        ctx.fillStyle = 'rgba(173, 216, 230, 0.7)';
        ctx.beginPath();
        ctx.arc(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.fillStyle = '#00ff00';
    lasers.forEach(l => ctx.fillRect(l.x, l.y, l.width, l.height));

    // Draw particles
    particles.forEach(p => {
        ctx.globalAlpha = p.life / p.startLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    drawStageUI();
}

function drawStage1Background() {
    ctx.fillStyle = '#87CEEB'; // 하늘
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT - GROUND_HEIGHT);
    // 산
    ctx.fillStyle = '#a9a9a9';
    const mountainX = -(backgroundX * 0.2 % STAGE_WIDTH);
    ctx.beginPath();
    ctx.moveTo(mountainX, STAGE_HEIGHT - GROUND_HEIGHT - 50);
    ctx.lineTo(mountainX + 150, STAGE_HEIGHT - GROUND_HEIGHT - 150);
    ctx.lineTo(mountainX + 300, STAGE_HEIGHT - GROUND_HEIGHT - 100);
    ctx.lineTo(mountainX + 500, STAGE_HEIGHT - GROUND_HEIGHT - 200);
    ctx.lineTo(mountainX + 650, STAGE_HEIGHT - GROUND_HEIGHT - 120);
    ctx.lineTo(mountainX + 800, STAGE_HEIGHT - GROUND_HEIGHT - 180);
    ctx.lineTo(mountainX + STAGE_WIDTH, STAGE_HEIGHT - GROUND_HEIGHT - 50);
    ctx.lineTo(mountainX + STAGE_WIDTH, STAGE_HEIGHT - GROUND_HEIGHT);
    ctx.lineTo(mountainX, STAGE_HEIGHT - GROUND_HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(mountainX + STAGE_WIDTH, STAGE_HEIGHT - GROUND_HEIGHT - 50);
    ctx.lineTo(mountainX + STAGE_WIDTH + 150, STAGE_HEIGHT - GROUND_HEIGHT - 150);
    ctx.lineTo(mountainX + STAGE_WIDTH + 300, STAGE_HEIGHT - GROUND_HEIGHT - 100);
    ctx.lineTo(mountainX + STAGE_WIDTH + 500, STAGE_HEIGHT - GROUND_HEIGHT - 200);
    ctx.lineTo(mountainX + STAGE_WIDTH + 650, STAGE_HEIGHT - GROUND_HEIGHT - 120);
    ctx.lineTo(mountainX + STAGE_WIDTH + 800, STAGE_HEIGHT - GROUND_HEIGHT - 180);
    ctx.lineTo(mountainX + STAGE_WIDTH * 2, STAGE_HEIGHT - GROUND_HEIGHT - 50);
    ctx.lineTo(mountainX + STAGE_WIDTH * 2, STAGE_HEIGHT - GROUND_HEIGHT);
    ctx.lineTo(mountainX + STAGE_WIDTH, STAGE_HEIGHT - GROUND_HEIGHT);
    ctx.closePath();
    ctx.fill();
    // 땅
    ctx.fillStyle = '#228B22';
    ctx.fillRect(0, STAGE_HEIGHT - GROUND_HEIGHT, STAGE_WIDTH, GROUND_HEIGHT);
}

function drawStage2Background() {
    ctx.fillStyle = '#2c3e50'; // 어두운 밤하늘
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT - GROUND_HEIGHT);

    // 성 그리기
    const castleX = STAGE_WIDTH / 2 - 200 - (backgroundX * 0.3);
    ctx.fillStyle = '#596275';
    ctx.fillRect(castleX, STAGE_HEIGHT - GROUND_HEIGHT - 250, 400, 250);
    // 탑
    ctx.fillRect(castleX - 50, STAGE_HEIGHT - GROUND_HEIGHT - 300, 80, 300);
    ctx.fillRect(castleX + 370, STAGE_HEIGHT - GROUND_HEIGHT - 300, 80, 300);
    // 창문
    ctx.fillStyle = 'yellow';
    for(let i=0; i<4; i++) {
        for(let j=0; j<3; j++) {
            ctx.fillRect(castleX + 20 + i * 100, STAGE_HEIGHT - GROUND_HEIGHT - 220 + j * 70, 20, 30);
        }
    }
    // 땅
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, STAGE_HEIGHT - GROUND_HEIGHT, STAGE_WIDTH, GROUND_HEIGHT);
}

function drawStage3Background() {
    ctx.fillStyle = '#1abc9c'; // 바다색
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    // 파도
    for (let i = 0; i < 2; i++) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + i * 0.1})`;
        ctx.beginPath();
        const waveY = STAGE_HEIGHT - GROUND_HEIGHT - 60 + i * 20;
        ctx.moveTo(0, waveY);
        for (let x = 0; x < STAGE_WIDTH; x++) {
            ctx.lineTo(x, waveY + Math.sin((x + frameCount) * 0.05 + i) * 10);
        }
        ctx.lineTo(STAGE_WIDTH, STAGE_HEIGHT);
        ctx.lineTo(0, STAGE_HEIGHT);
        ctx.closePath();
        ctx.fill();
    }
    ctx.fillStyle = '#f1c40f'; // 모래사장
    ctx.fillRect(0, STAGE_HEIGHT - GROUND_HEIGHT, STAGE_WIDTH, GROUND_HEIGHT);
}

function drawStage5Background() {
    // Dark sky
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT - GROUND_HEIGHT);

    // Distant dark castle silhouette
    const castleX = STAGE_WIDTH / 2 - 300 - (backgroundX * 0.1);
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.moveTo(castleX, STAGE_HEIGHT - GROUND_HEIGHT);
    ctx.lineTo(castleX + 50, STAGE_HEIGHT - GROUND_HEIGHT - 200);
    ctx.lineTo(castleX + 100, STAGE_HEIGHT - GROUND_HEIGHT - 150);
    ctx.lineTo(castleX + 150, STAGE_HEIGHT - GROUND_HEIGHT - 250);
    ctx.lineTo(castleX + 200, STAGE_HEIGHT - GROUND_HEIGHT - 180);
    ctx.lineTo(castleX + 250, STAGE_HEIGHT - GROUND_HEIGHT - 300); // Main tower
    ctx.lineTo(castleX + 300, STAGE_HEIGHT - GROUND_HEIGHT - 180);
    ctx.lineTo(castleX + 350, STAGE_HEIGHT - GROUND_HEIGHT - 250);
    ctx.lineTo(castleX + 400, STAGE_HEIGHT - GROUND_HEIGHT - 150);
    ctx.lineTo(castleX + 450, STAGE_HEIGHT - GROUND_HEIGHT - 200);
    ctx.lineTo(castleX + 500, STAGE_HEIGHT - GROUND_HEIGHT);
    ctx.closePath();
    ctx.fill();
    
    // Ground
    ctx.fillStyle = '#333';
    ctx.fillRect(0, STAGE_HEIGHT - GROUND_HEIGHT, STAGE_WIDTH, GROUND_HEIGHT);
}

function drawStage6Background() {
    // Burning sky
    const skyGradient = ctx.createLinearGradient(0, 0, 0, STAGE_HEIGHT);
    skyGradient.addColorStop(0, '#ff5e00');
    skyGradient.addColorStop(1, '#ffc300');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT - GROUND_HEIGHT);

    // Charred ground
    ctx.fillStyle = '#222';
    ctx.fillRect(0, STAGE_HEIGHT - GROUND_HEIGHT, STAGE_WIDTH, GROUND_HEIGHT);
}

function drawStage7Background() {
    // Final battle background - dark, ominous
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    // Ground
    ctx.fillStyle = '#333';
    ctx.fillRect(0, STAGE_HEIGHT - GROUND_HEIGHT, STAGE_WIDTH, GROUND_HEIGHT);
}

function drawStage8Background() {
    // Diamond world background
    const diamondGradient = ctx.createLinearGradient(0, 0, 0, STAGE_HEIGHT);
    diamondGradient.addColorStop(0, '#b9f2ff');
    diamondGradient.addColorStop(1, '#e0c3fc');
    ctx.fillStyle = diamondGradient;
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

    // Draw diamond shapes
    for(let i=0; i<10; i++) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.2})`;
        ctx.beginPath();
        const x = Math.random() * STAGE_WIDTH;
        const y = Math.random() * STAGE_HEIGHT;
        const size = Math.random() * 50 + 20;
        ctx.moveTo(x, y - size / 2);
        ctx.lineTo(x + size / 2, y);
        ctx.lineTo(x, y + size / 2);
        ctx.lineTo(x - size / 2, y);
        ctx.closePath();
        ctx.fill();
    }

    // Ground
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(0, STAGE_HEIGHT - GROUND_HEIGHT, STAGE_WIDTH, GROUND_HEIGHT);
}

function drawStage9Background() {
    // Ghost Lair
    ctx.fillStyle = '#000020'; // Very dark blue
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

    // Ectoplasm effect
    for(let i=0; i<5; i++) {
        ctx.fillStyle = `rgba(0, 255, 150, ${Math.random() * 0.1 + 0.05})`;
        ctx.beginPath();
        ctx.arc(Math.random() * STAGE_WIDTH, Math.random() * STAGE_HEIGHT, Math.random() * 100 + 50, 0, Math.PI * 2);
        ctx.fill();
    }

    // Ground
    ctx.fillStyle = '#111';
    ctx.fillRect(0, STAGE_HEIGHT - GROUND_HEIGHT, STAGE_WIDTH, GROUND_HEIGHT);
}

function drawStage10Background() {
    // Factory/Lab background
    ctx.fillStyle = '#4a4a4a'; // Dark gray wall
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

    // Pipes
    ctx.fillStyle = '#7a7a7a';
    ctx.fillRect(100, 0, 40, STAGE_HEIGHT - 100);
    ctx.fillRect(500, 100, 40, STAGE_HEIGHT);
    ctx.fillRect(0, 200, 200, 40);

    // Floor
    ctx.fillStyle = '#333';
    ctx.fillRect(0, STAGE_HEIGHT - GROUND_HEIGHT, STAGE_WIDTH, GROUND_HEIGHT);
    // Floor tiles
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    for (let i = 0; i < STAGE_WIDTH; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, STAGE_HEIGHT - GROUND_HEIGHT);
        ctx.lineTo(i, STAGE_HEIGHT);
        ctx.stroke();
    }
}

function drawStage11Background() {
    // Cosmic background
    ctx.fillStyle = '#000010'; // Very dark blue, almost black
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

    // Stars
    for (let i = 0; i < 100; i++) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.8})`;
        ctx.beginPath();
        ctx.arc(Math.random() * STAGE_WIDTH, Math.random() * STAGE_HEIGHT, Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Ground
    ctx.fillStyle = '#200020';
    ctx.fillRect(0, STAGE_HEIGHT - GROUND_HEIGHT, STAGE_WIDTH, GROUND_HEIGHT);
}


// --- UI 그리기 ---
function drawStageUI() {
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText(`HP: ${player.hp}/${player.maxHp}`, 20, 30);
    ctx.fillText(`코인: ${player.coins}`, 20, 60);
    ctx.fillText(`스테이지: ${stage}`, 20, 90);
    ctx.fillText(`포션: ${player.inventory.potions} (P 키)`, 20, 120);

    

    // 보스 HP
    if (isBossFight && boss) {
        ctx.fillStyle = 'gray'; ctx.fillRect(STAGE_WIDTH / 2 - 200, 20, 400, 20);
        ctx.fillStyle = 'red'; ctx.fillRect(STAGE_WIDTH / 2 - 200, 20, (boss.hp / boss.maxHp) * 400, 20);
        ctx.strokeStyle = 'white'; ctx.strokeRect(STAGE_WIDTH / 2 - 200, 20, 400, 20);
    }

    // 스테이지 목표
    const currentStageData = stages[stage - 1];
    if (currentStageData.type === 'kill' && !isBossFight) {
        ctx.font = '24px Arial';
        ctx.fillText(`남은 적: ${currentStageData.killGoal - player.enemyKillCount}`, STAGE_WIDTH / 2 - 80, 60);
    } else if (currentStageData.type === 'survival' && !isBossFight) {
        ctx.font = '24px Arial';
        const timeLeft = Math.max(0, currentStageData.survivalTime - gameTimer).toFixed(1);
        ctx.fillText(`생존 시간: ${timeLeft}`, STAGE_WIDTH / 2 - 80, 60);
    }

    // 마을 가기 버튼
    ctx.fillStyle = '#aaa';
    ctx.fillRect(STAGE_WIDTH - 120, 10, 110, 30);
    ctx.fillStyle = 'black';
    ctx.font = '16px Arial';
    ctx.fillText('마을로 돌아가기', STAGE_WIDTH - 115, 30);
}

// --- 마을 로직 ---
function updateVillageLogic() {
    player.update();
    if (keys.e) {
        if (isColliding(player, npcs.villageChief)) activeUI = 'quest';
        else if (isColliding(player, npcs.merchant)) activeUI = 'shop';
        else if (isColliding(player, npcs.radio)) {
            if (!isFightingHiddenBoss) {
                const answer = prompt("비밀 코드를 입력하십시오.");
                if (answer === "seungjae") {
                    alert("히든 스테이지가 개방됩니다.");
                    goToStage();
                    setTimeout(createHiddenBoss, 1000);
                } else {
                    alert("코드가 틀렸습니다.");
                }
            }
        }
        keys.e = false;
    }
}

function drawVillage() {
    drawVillageBackground();
    player.draw();
    Object.values(npcs).forEach(npc => {
        ctx.fillStyle = npc.color;
        ctx.fillRect(npc.x, npc.y, npc.width, npc.height);
    });

    // UI
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText('마을', STAGE_WIDTH / 2 - 30, 30);

    // 상호작용 텍스트
    if (isColliding(player, npcs.villageChief)) showInteractionText('촌장에게 말을 건다 (E)');
    if (isColliding(player, npcs.merchant)) showInteractionText('상점을 연다 (E)');
    if (isColliding(player, npcs.radio)) showInteractionText('라디오를 조사한다 (E)');

    // 메뉴/스테이지 이동 버튼
    ctx.fillStyle = '#aaa';
    ctx.fillRect(STAGE_WIDTH - 140, 10, 120, 30);
    ctx.fillStyle = 'black';
    ctx.font = '16px Arial';
    ctx.fillText('스테이지 가기', STAGE_WIDTH - 130, 30);
}

function drawVillageBackground() {
    ctx.fillStyle = '#a0d9ef'; // 밝은 하늘
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    // 땅
    ctx.fillStyle = '#79d70f';
    ctx.fillRect(0, STAGE_HEIGHT - GROUND_HEIGHT, STAGE_WIDTH, GROUND_HEIGHT);
    // 집
    ctx.fillStyle = '#d2b48c';
    ctx.fillRect(80, STAGE_HEIGHT - GROUND_HEIGHT - 150, 150, 150);
    ctx.fillStyle = '#8b4513';
    ctx.beginPath();
    ctx.moveTo(60, STAGE_HEIGHT - GROUND_HEIGHT - 150);
    ctx.lineTo(250, STAGE_HEIGHT - GROUND_HEIGHT - 150);
    ctx.lineTo(155, STAGE_HEIGHT - GROUND_HEIGHT - 220);
    ctx.closePath();
    ctx.fill();
}

function showInteractionText(text) {
    ctx.fillStyle = 'black';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, STAGE_WIDTH / 2, STAGE_HEIGHT - 20);
    ctx.textAlign = 'left';
}

// --- 상점/퀘스트 UI ---
function drawShopUI() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    ctx.fillStyle = 'white';
    ctx.font = '30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('상점', STAGE_WIDTH / 2, 80);
    ctx.font = '16px Arial';
    ctx.fillText('아이템을 클릭하여 구매하세요. (E를 눌러 닫기)', STAGE_WIDTH / 2, 120);
    ctx.fillText(`내 코인: ${player.coins}`, STAGE_WIDTH / 2, 150);

    ctx.textAlign = 'left';
    let itemY = 200;

    // 소모품
    ctx.font = '20px Arial';
    ctx.fillText('소모품', 250, itemY);
    itemY += 20;
    const potion = shopConsumables.potion;
    ctx.strokeRect(250, itemY, 300, 30);
    ctx.font = '16px Arial';
    ctx.fillText(`${potion.name} - ${potion.price} 코인`, 260, itemY + 20);
    itemY += 60;

    

    ctx.textAlign = 'center';
}

function drawQuestUI() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    ctx.fillStyle = 'white';
    ctx.font = '30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('퀘스트', STAGE_WIDTH / 2, 150);
    ctx.font = '18px Arial';
    ctx.fillText(quest.title, STAGE_WIDTH / 2, 200);
    ctx.font = '16px Arial';
    ctx.fillText(`보상: ${quest.reward} 코인`, STAGE_WIDTH / 2, 240);

    if (!quest.isActive && !quest.isComplete) {
        ctx.fillStyle = 'lightgreen';
        ctx.fillRect(350, 280, 100, 30);
        ctx.fillStyle = 'black';
        ctx.fillText('수락', 400, 300);
    } else if (quest.isActive) {
        ctx.fillText('진행 중...', STAGE_WIDTH / 2, 300);
    } else { // isComplete
        ctx.fillText('완료!', STAGE_WIDTH / 2, 300);
    }
    ctx.textAlign = 'center';
}

// --- 부활 / 엔딩 화면 ---
function drawRevivalScreen() {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    ctx.fillStyle = 'white';
    ctx.font = '40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('당신은 쓰러졌습니다...', STAGE_WIDTH / 2, STAGE_HEIGHT / 2 - 50);
    ctx.font = '24px Arial';
    ctx.fillText(`마을로 돌아가 힘을 얻으시겠습니까? (${villageVisitCount}번 남음)`, STAGE_WIDTH / 2, STAGE_HEIGHT / 2);
    ctx.font = '20px Arial';
    ctx.fillText('(화면을 클릭하여 계속)', STAGE_WIDTH / 2, STAGE_HEIGHT / 2 + 50);
    ctx.textAlign = 'left';
}

function drawEndingScreen() {
    const endingText = [
        "모든 보스를 물리쳤다!",
        "이제 이 공장은 평화롭게 ai를 만들 수 있을 것이다.",
        "Tode z.m!",
        "승재가 만듬",
        "인기 좋으면 DIC버전이 나온다?!"
    ];

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    ctx.fillStyle = 'white';
    ctx.font = '30px Arial';
    ctx.textAlign = 'center';

    if (endingPage < endingText.length) {
        ctx.fillText(endingText[endingPage], STAGE_WIDTH / 2, STAGE_HEIGHT / 2);
    }

    ctx.font = '16px Arial';
    ctx.fillText('(화면을 터치하여 계속)', STAGE_WIDTH / 2, STAGE_HEIGHT - 50);
    ctx.textAlign = 'left';
}

function createSharkBoss() {
    // This is for stage 8, the diamond world
    boss = {
        x: -100, y: STAGE_HEIGHT - GROUND_HEIGHT - 80, width: 120, height: 60,
        hp: 100, maxHp: 100,
        speed: 8,
        draw() {
            ctx.fillStyle = '#95a5a6';
            ctx.beginPath();
            ctx.moveTo(this.x, this.y + this.height / 2);
            ctx.lineTo(this.x + this.width, this.y);
            ctx.lineTo(this.x + this.width, this.y + this.height);
            ctx.closePath();
            ctx.fill();
            // Fin
            ctx.beginPath();
            ctx.moveTo(this.x + this.width / 2, this.y);
            ctx.lineTo(this.x + this.width / 2 + 20, this.y - 30);
            ctx.lineTo(this.x + this.width / 2 + 40, this.y);
            ctx.closePath();
            ctx.fill();
        },
        update() {
            this.x += this.speed;
            if (this.x > STAGE_WIDTH) {
                this.x = -this.width;
                this.y = STAGE_HEIGHT - GROUND_HEIGHT - (Math.random() * 100 + 60);
            }
        }
    };
}

function createGhostBoss() {
    // This is for stage 9
    boss = {
        x: STAGE_WIDTH / 2 - 50, y: 100, width: 100, height: 150,
        hp: 3000, maxHp: 3000,
        attackCooldown: 90,
        draw() {
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + 50, 50, Math.PI, 0);
            ctx.lineTo(this.x + this.width, this.y + this.height);
            ctx.lineTo(this.x, this.y + this.height);
            ctx.closePath();
            ctx.fill();
            // Eyes
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(this.x + 35, this.y + 50, 10, 0, Math.PI * 2);
            ctx.arc(this.x + 65, this.y + 50, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        },
        update() {
            this.x += Math.sin(frameCount * 0.05) * 5;
            this.y += Math.cos(frameCount * 0.05) * 2;
            this.attackCooldown--;
            if (this.attackCooldown <= 0) {
                this.attackCooldown = 90;
                // Create a wave of obstacles
                for (let i = 0; i < 5; i++) {
                    setTimeout(() => this.createObstacleWave(), i * 500);
                }
            }
        },
        createObstacleWave() {
            if (!boss) return;
            const fromLeft = Math.random() > 0.5;
            obstacles.push({
                x: fromLeft ? -50 : STAGE_WIDTH,
                y: Math.random() * (STAGE_HEIGHT - GROUND_HEIGHT - 100) + 50,
                width: 50, height: 50,
                speed: fromLeft ? 5 : -5,
                draw() {
                    ctx.fillStyle = '#4b0082'; // Indigo
                    ctx.fillRect(this.x, this.y, this.width, this.height);
                },
                update() {
                    this.x += this.speed;
                }
            });
        }
    };
}

function createRodyBoss() {
    boss = {
        x: STAGE_WIDTH / 2 - 75, y: STAGE_HEIGHT - GROUND_HEIGHT - 200, width: 150, height: 200,
        hp: 3500, maxHp: 3500,
        attackCooldown: 120,
        pattern: 0,
        state: 'idle', // idle, dashing, shooting_punch, shooting_laser, pulling
        stateTimer: 0,
        eyeColor: 'yellow',
        eyeFlashTimer: 15,
        dashTargetX: 0,
        dashSpeed: 20,
        isPulling: false,

        draw() {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;

            // Eye color flash
            this.eyeFlashTimer--;
            if (this.eyeFlashTimer <= 0) {
                this.eyeColor = this.eyeColor === 'yellow' ? '#00f' : 'yellow';
                this.eyeFlashTimer = 15;
            }

            // Body
            ctx.fillStyle = '#808080'; // Grey
            ctx.fillRect(this.x, this.y, this.width, this.height - 20);

            // Head
            ctx.fillStyle = '#696969';
            ctx.fillRect(centerX - 40, this.y - 30, 80, 30);

            // Eyes
            ctx.fillStyle = this.eyeColor;
            ctx.beginPath();
            ctx.arc(centerX - 20, this.y - 15, 10, 0, Math.PI * 2);
            ctx.arc(centerX + 20, this.y - 15, 10, 0, Math.PI * 2);
            ctx.fill();

            // Limbs (simple rectangles)
            ctx.fillStyle = '#505050';
            // Arms
            ctx.fillRect(this.x - 20, this.y + 20, 20, 100);
            ctx.fillRect(this.x + this.width, this.y + 20, 20, 100);
            // Legs
            ctx.fillRect(this.x + 20, this.y + this.height - 20, 30, 50);
            ctx.fillRect(this.x + this.width - 50, this.y + this.height - 20, 30, 50);
        },
        update() {
            this.attackCooldown--;
            if (this.attackCooldown <= 0 && this.state === 'idle') {
                this.pattern = Math.floor(Math.random() * 4);
                this.state = 'acting';
                switch (this.pattern) {
                    case 0: // Dash
                        this.stateTimer = 60; // 1 second dash duration
                        this.dashTargetX = player.x;
                        break;
                    case 1: // Rocket Punch
                        this.stateTimer = 120;
                        this.attackCooldown = 180;
                        break;
                    case 2: // Laser
                        this.stateTimer = 180;
                        this.attackCooldown = 240;
                        break;
                    case 3: // Magnet Pull
                        this.stateTimer = 300; // 5 seconds of pulling
                        this.isPulling = true;
                        this.attackCooldown = 360;
                        break;
                }
            }

            if (this.state === 'acting') {
                this.stateTimer--;
                switch (this.pattern) {
                    case 0: // Dashing
                        const direction = this.dashTargetX < this.x ? -1 : 1;
                        this.x += this.dashSpeed * direction;
                        if (isColliding(this, player)) {
                            player.isSlowed = true;
                            player.slowTimer = 180; // 3 seconds
                        }
                        // Stop dash if reached target or edge
                        if ((direction > 0 && this.x >= this.dashTargetX) || (direction < 0 && this.x <= this.dashTargetX) || this.x < 0 || this.x > STAGE_WIDTH - this.width) {
                             this.state = 'idle';
                        }
                        break;
                    case 1: // Rocket Punch
                        if (this.stateTimer % 40 === 0) this.shootRocketPunch();
                        break;
                    case 2: // Laser
                        if (this.stateTimer % 30 === 0) this.shootMultiLaser();
                        break;
                    case 3: // Magnet Pull
                        if (this.isPulling) {
                            const dx = (this.x + this.width / 2) - (player.x + player.width / 2);
                            const dy = (this.y + this.height / 2) - (player.y + player.height / 2);
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            if (distance > 50) { // Don't pull if too close
                                player.x += dx / distance * 3; // Pull force
                            }
                        }
                        break;
                }

                if (this.stateTimer <= 0) {
                    this.state = 'idle';
                    this.isPulling = false; // Make sure to stop pulling
                    this.attackCooldown = 120;
                }
            }
        },
        shootRocketPunch() {
            if (!boss) return;
            const punchY = this.y + 40;
            const fromLeft = player.x < this.x;
            bossProjectiles.push({
                x: fromLeft ? this.x - 20 : this.x + this.width,
                y: punchY,
                width: 40, height: 20,
                speed: 8,
                direction: fromLeft ? 'left' : 'right',
                type: 'punch',
                draw() {
                    ctx.fillStyle = '#333';
                    ctx.fillRect(this.x, this.y, this.width, this.height);
                },
                update() {
                    this.x += this.direction === 'right' ? this.speed : -this.speed;
                }
            });
        },
        shootMultiLaser() {
            if (!boss) return;
            for(let i=0; i<3; i++) {
                const angle = Math.atan2((player.y + player.height/2) - (this.y + 20), (player.x + player.width/2) - (this.x + this.width/2)) + (Math.random() - 0.5);
                bossProjectiles.push({
                    x: this.x + this.width / 2, y: this.y + 20, width: 10, height: 10, speed: 6, angle: angle, type: 'laser',
                    draw() { ctx.fillStyle = 'orange'; ctx.fillRect(this.x, this.y, this.width, this.height); },
                    update(speedMultiplier = 1) { this.x += Math.cos(this.angle) * this.speed * speedMultiplier; this.y += Math.sin(this.angle) * this.speed * speedMultiplier; }
                });
            }
        }
    };
}

function createStage11Boss() {
    boss = {
        x: STAGE_WIDTH / 2 - 75, y: 150, width: 150, height: 150,
        hp: 4000, maxHp: 4000,
        attackCooldown: 120,
        pattern: 0,
        state: 'idle', // idle, laser_barrage, summon_strike, flamethrower
        stateTimer: 0,

        draw() {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;

            // Body
            ctx.fillStyle = '#8A2BE2'; // Purple
            ctx.beginPath();
            ctx.arc(centerX, centerY, this.width / 2, 0, Math.PI * 2);
            ctx.fill();

            // Eyes
            ctx.fillStyle = '#ADFF2F'; // Green-Yellow
            // Left Eye
            ctx.beginPath();
            ctx.arc(centerX - 30, centerY, 20, 0, Math.PI * 2);
            ctx.fill();
            // Right Eye
            ctx.beginPath();
            ctx.arc(centerX + 30, centerY, 20, 0, Math.PI * 2);
            ctx.fill();

            // Pupils
            ctx.fillStyle = 'black';
            // Left Pupil
            ctx.beginPath();
            ctx.arc(centerX - 30, centerY, 8, 0, Math.PI * 2);
            ctx.fill();
            // Right Pupil
            ctx.beginPath();
            ctx.arc(centerX + 30, centerY, 8, 0, Math.PI * 2);
            ctx.fill();
        },
        update() {
            this.attackCooldown--;
            if (this.attackCooldown <= 0 && this.state === 'idle') {
                this.pattern = Math.floor(Math.random() * 3);
                this.state = 'acting';
                switch (this.pattern) {
                    case 0: // Laser Barrage
                        this.stateTimer = 260; // Needs time for all lasers
                        this.attackCooldown = 300;
                        this.shootLaserBarrage();
                        break;
                    case 1: // Summon and Strike
                        this.stateTimer = 120;
                        this.attackCooldown = 240;
                        this.summonAndStrike();
                        break;
                    case 2: // Flamethrower
                        this.stateTimer = 300; // 5 seconds
                        this.attackCooldown = 360;
                        break;
                }
            }

            if (this.state === 'acting') {
                this.stateTimer--;
                if (this.pattern === 2) { // Flamethrower logic
                    this.flamethrower();
                }

                if (this.stateTimer <= 0) {
                    this.state = 'idle';
                    this.attackCooldown = 120;
                }
            }
        },
        shootLaserBarrage() {
            if (!boss) return;
            // 18 horizontal lasers
            for (let i = 0; i < 18; i++) {
                setTimeout(() => {
                    if (!boss) return;
                    bossProjectiles.push({
                        x: 0, y: Math.random() * (STAGE_HEIGHT - GROUND_HEIGHT),
                        width: STAGE_WIDTH, height: 5, timer: 20, type: 'wide_laser',
                        draw() { ctx.fillStyle = `rgba(255, 100, 255, ${0.2 + (this.timer / 20) * 0.6})`; ctx.fillRect(this.x, this.y, this.width, this.height); },
                        update() { this.timer--; if (this.timer <= 0) { const index = bossProjectiles.indexOf(this); if (index > -1) bossProjectiles.splice(index, 1); } }
                    });
                }, i * 100);
            }
            // 8 vertical lasers
            for (let i = 0; i < 8; i++) {
                setTimeout(() => {
                    if (!boss) return;
                    createLightningZone(Math.random() * STAGE_WIDTH);
                }, i * 200 + 500); // Stagger them after horizontal
            }
        },
        summonAndStrike() {
            if (!boss) return;
            // Summon 5 enemies
            for (let i = 0; i < 5; i++) {
                createEnemy();
            }
            // Random lightning
            for (let i = 0; i < 5; i++) {
                setTimeout(() => createLightningZone(Math.random() * STAGE_WIDTH), i * 300);
            }
        },
        flamethrower() {
            if (!boss) return;
            const angleToPlayer = Math.atan2((player.y + player.height / 2) - (this.y + this.height / 2), (player.x + player.width / 2) - (this.x + this.width / 2));
            for (let i = 0; i < 3; i++) {
                const spread = (Math.random() - 0.5) * 0.5;
                particles.push({
                    x: this.x + this.width / 2, y: this.y + this.height / 2,
                    dx: Math.cos(angleToPlayer + spread) * 8,
                    dy: Math.sin(angleToPlayer + spread) * 8,
                    radius: Math.random() * 10 + 5,
                    color: `rgba(255, ${Math.random() * 100}, 0, 0.8)`,
                    life: 40,
                    startLife: 40,
                    isFire: true, // Custom property for collision
                });
            }
        }
    };
}

// ====================================================================
//                         게임 오버 및 다음 스테이지
// ====================================================================
function gameOver() {
    if (villageVisitCount > 0) {
        gameState = 'reviving';
    } else {
        alert('게임 오버!');
        document.location.reload();
    }
}

function nextStage() {
    stage++;
    if (stage > stages.length) {
        gameState = 'ending';
        return;
    }
    resetStage();
    if (stage === 7 || stage === 10 || stage === 11) {
        isBossFight = true;
        stages[stage - 1].createBoss();
    }
}

function resetStage() {
    player.x = 100;
    player.y = STAGE_HEIGHT - GROUND_HEIGHT - player.height;
    player.enemyKillCount = 0;
    enemies.length = 0;
    bossProjectiles.length = 0;
    lightningZones.length = 0;
    residualElectrics.length = 0;
    fires.length = 0;
    bubbles.length = 0;
    obstacles.length = 0;
    boss = null;
    isBossFight = false;
    gameTimer = 0;
    isGroundSlippery = false;
    isFightingHiddenBoss = false;
    isSpawningNextBoss = false;
}

function startDiamondStage() {
    stage = 8;
    resetStage();
}

function goToVillage() {
    gameState = 'village';
    stopBGM();
}



function goToStage() {
    gameState = 'stage';
    resetStage();
    if (stage === 7 || stage === 10 || stage === 11) {
        isBossFight = true;
        stages[stage - 1].createBoss();
    }
    playBGM(stage);
}

function isColliding(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

function buyItem(item, id) {
    if (player.coins >= item.price) {
        player.coins -= item.price;
        if (item.type === 'consumable') {
            if (item.id === 'potion') player.inventory.potions++;
            alert(`${item.name}을(를) 구매했습니다.`);
        }
    } else {
        alert('코인이 부족합니다.');
    }
}

function acceptQuest() {
    if (!quest.isActive && !quest.isComplete) {
        quest.isActive = true;
        alert(`퀘스트 수락: ${quest.title}`);
        activeUI = null;
    }
}

// ====================================================================
//                         게임 루프
// ====================================================================
function gameLoop() {
    updateLogic();
    draw();
    frameCount++;
    requestAnimationFrame(gameLoop);
}

// 게임 시작
checkLoginStatus();