import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as CANNON from 'cannon-es';

// ==========================================
// 3. 3D描画・物理演算クラス (GraphicsEngine)
// ==========================================
export class GraphicsEngine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.diceSize = 2.5;
        this.cupRadius = 9.0;
        this.cupHeight = 12;
        this.circleRadius = 15;
        this.particles = [];

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050507);
        this.scene.fog = new THREE.FogExp2(0x050507, 0.015);

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.targetCameraPos = new THREE.Vector3();
        this.currentLookAt = new THREE.Vector3();
        this.targetLookAt = new THREE.Vector3();

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        this._setupLighting();

        this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -50, 0) });
        this.world.allowSleep = true;
        
        this.floorPhysMat = new CANNON.Material();
        this.dicePhysMat = new CANNON.Material();
        this.world.addContactMaterial(new CANNON.ContactMaterial(this.floorPhysMat, this.dicePhysMat, { friction: 0.01, restitution: 0.6 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(this.dicePhysMat, this.dicePhysMat, { friction: 0.001, restitution: 0.5 }));

        this.onDiceStopped = null;

        window.addEventListener('resize', () => this._onWindowResize(), false);
    }

    _onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    _setupLighting() {
        this.scene.add(new THREE.AmbientLight(0x202545, 1.8));
        const spotLight = new THREE.SpotLight(0xffeebb, 5.0);
        spotLight.position.set(5, 35, 10);
        this.scene.add(spotLight);
        const topLight = new THREE.DirectionalLight(0xaaccff, 1.5);
        topLight.position.set(-10, 30, -10); this.scene.add(topLight);
    }

    init(players, isHost, myIndex) {
        this.isHost = isHost;
        this.circleRadius = Math.max(15, players.length * 3.5);

        const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(100, 64), new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.1 }));
        floorMesh.rotation.x = -Math.PI / 2; this.scene.add(floorMesh);

        const floorBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: this.floorPhysMat });
        floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); this.world.addBody(floorBody);
        const ceilingBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: this.floorPhysMat });
        ceilingBody.quaternion.setFromEuler(Math.PI / 2, 0, 0); ceilingBody.position.set(0, 15, 0); this.world.addBody(ceilingBody);

        players.forEach((p, i) => {
            p.angle = (i / players.length) * Math.PI * 2;
            p.cx = Math.sin(p.angle) * this.circleRadius;
            p.cz = Math.cos(p.angle) * this.circleRadius;

            this._createTray(p);
            p.cupGroup = this._createCup(p);
        });

        this.recreateDice(players);
        this.setCameraMode('normal', players, myIndex);
        this.camera.position.copy(this.targetCameraPos);
        this.currentLookAt.copy(this.targetLookAt);
        this.camera.lookAt(this.currentLookAt);
    }

    emitConfetti() {
        const colors = [0x00f2fe, 0xff007f, 0xf1c40f, 0x00ff00, 0xff00ff];
        const geo = new THREE.PlaneGeometry(1.5, 1.5);
        for (let i = 0; i < 150; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: colors[Math.floor(Math.random() * colors.length)], side: THREE.DoubleSide });
            const p = new THREE.Mesh(geo, mat);
            p.position.set((Math.random() - 0.5) * 30, 40 + Math.random() * 10, (Math.random() - 0.5) * 30);
            p.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 15, Math.random() * 10, (Math.random() - 0.5) * 15);
            p.userData.rotVel = new THREE.Vector3(Math.random() * 0.2, Math.random() * 0.2, Math.random() * 0.2);
            this.scene.add(p);
            this.particles.push(p);
        }
    }

    setCameraMode(mode, players, myIndex) {
        const me = players[myIndex];
        const extraRadius = Math.max(0, this.circleRadius - 15);

        if (mode === 'resolve') {
            const offset = 1.0;
            const height = 60 + extraRadius * 2;
            this.targetCameraPos.set(Math.sin(me.angle) * offset, height, Math.cos(me.angle) * offset);
            this.targetLookAt.set(0, 0, 0);
        } else {
            const dist = 38 + extraRadius * 2;
            const height = 32 + extraRadius * 1.5;
            this.targetCameraPos.set(Math.sin(me.angle) * dist, height, Math.cos(me.angle) * dist);
            
            const lookDist = 10 + extraRadius * 0.5;
            this.targetLookAt.set(Math.sin(me.angle) * lookDist, 0, Math.cos(me.angle) * lookDist);
        }
    }

    _createTray(p) {
        const trayGroup = new THREE.Group();
        trayGroup.position.set(p.cx, 0, p.cz);
        trayGroup.rotation.y = p.angle;

        const wallRadius = this.cupRadius * 0.9;
        const trayRimMesh = new THREE.Mesh(new THREE.RingGeometry(wallRadius, wallRadius + 0.2, 64), new THREE.MeshStandardMaterial({ color: p.colorHex, emissive: p.colorHex, emissiveIntensity: 0.8, side: THREE.DoubleSide }));
        trayRimMesh.rotation.x = -Math.PI / 2; trayRimMesh.position.y = 0.02;
        trayGroup.add(trayRimMesh);
        this.scene.add(trayGroup);

        const numWallSegments = 32; const segmentWidth = (2 * Math.PI * wallRadius) / numWallSegments;
        for (let i = 0; i < numWallSegments; i++) {
            const localAngle = (i / numWallSegments) * Math.PI * 2;
            const adjustedRadius = wallRadius + 5;
            const wallBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(5, 10, segmentWidth / 2 + 0.1)), material: this.floorPhysMat });
            const lx = Math.cos(localAngle) * adjustedRadius;
            const lz = Math.sin(localAngle) * adjustedRadius;
            wallBody.position.set(p.cx + lx, 10, p.cz + lz);
            wallBody.quaternion.setFromEuler(0, -localAngle, 0);
            this.world.addBody(wallBody);
        }
    }

    _createCup(p) {
        const cupPoints = []; cupPoints.push(new THREE.Vector2(0, this.cupHeight));
        for (let i = 0; i <= 5; i++) cupPoints.push(new THREE.Vector2((this.cupRadius * 0.9 - 0.4) + Math.cos(Math.PI / 2 - (Math.PI / 2) * (i / 5)) * 0.4, (this.cupHeight - 0.4) + Math.sin(Math.PI / 2 - (Math.PI / 2) * (i / 5)) * 0.4));
        for (let i = 0; i <= 10; i++) cupPoints.push(new THREE.Vector2((this.cupRadius - 0.4) + Math.cos(0 - Math.PI * (i / 10)) * 0.4, 0.4 + Math.sin(0 - Math.PI * (i / 10)) * 0.4));
        cupPoints.push(new THREE.Vector2(this.cupRadius * 0.9 - 0.8, this.cupHeight - 0.8)); cupPoints.push(new THREE.Vector2(0, this.cupHeight - 0.8));

        const cupGeo = new THREE.LatheGeometry(cupPoints, 64);
        const cupMat = new THREE.MeshPhysicalMaterial({ color: 0x0f1118, metalness: 0.7, roughness: 0.15, clearcoat: 1.0, side: THREE.DoubleSide });

        const cMesh = new THREE.Mesh(cupGeo, cupMat); cMesh.castShadow = true;
        cMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(cupGeo, 25), new THREE.LineBasicMaterial({ color: p.colorHex, transparent: true, opacity: 0.35 })));
        cMesh.position.z = this.cupRadius;

        const pivot = new THREE.Group();
        pivot.rotation.order = 'YXZ';
        const pivotX = p.cx - Math.sin(p.angle) * this.cupRadius;
        const pivotZ = p.cz - Math.cos(p.angle) * this.cupRadius;

        pivot.position.set(pivotX, 26, pivotZ);
        pivot.rotation.y = p.angle;
        pivot.add(cMesh);

        this.scene.add(pivot);
        return pivot;
    }

    _createDiceTexture(number) {
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f8f8f8'; ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 8; ctx.strokeRect(0, 0, 256, 256);
        const drawDot = (x, y, color) => { ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); };
        const color = (number === 1) ? '#ff3333' : '#222222';
        if (number === 1 || number === 3 || number === 5) drawDot(128, 128, color);
        if (number !== 1) { drawDot(64, 64, color); drawDot(192, 192, color); }
        if (number === 4 || number === 5 || number === 6) { drawDot(192, 64, color); drawDot(64, 192, color); }
        if (number === 6) { drawDot(64, 128, color); drawDot(192, 128, color); }
        const texture = new THREE.CanvasTexture(canvas); texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        return texture;
    }

    recreateDice(players) {
        const diceGeo = new RoundedBoxGeometry(this.diceSize, this.diceSize, this.diceSize, 6, 0.25);
        const halfExtents = new CANNON.Vec3(this.diceSize / 2, this.diceSize / 2, this.diceSize / 2);

        players.forEach(p => {
            if (p.meshes) p.meshes.forEach(m => this.scene.remove(m));
            if (p.bodies) p.bodies.forEach(b => this.world.removeBody(b));

            p.meshes = []; p.bodies = [];

            for (let i = 0; i < p.count; i++) {
                const diceMaterials = [1, 6, 2, 5, 3, 4].map(n => new THREE.MeshStandardMaterial({ 
                    map: this._createDiceTexture(n), roughness: 0.15, metalness: 0.1, emissive: 0x000000 
                }));
                const mesh = new THREE.Mesh(diceGeo, diceMaterials);
                mesh.userData.diceMats = diceMaterials;

                mesh.castShadow = true; mesh.receiveShadow = true; mesh.visible = false;
                const startY = 2 + (i * 2.5);
                mesh.position.set(p.cx, startY, p.cz);

                this.scene.add(mesh); p.meshes.push(mesh);
                
                const body = new CANNON.Body({ mass: 1, shape: new CANNON.Box(halfExtents), material: this.dicePhysMat });
                body.allowSleep = true;
                body.sleepSpeedLimit = 0.5;
                body.sleepTimeLimit = 0.5;
                
                body.position.set(p.cx, startY, p.cz);
                this.world.addBody(body); p.bodies.push(body);
            }
        });
    }

    highlightDice(players, targetFace) {
        players.forEach(p => {
            for (let i = 0; i < p.count; i++) {
                const mesh = p.meshes[i];
                const q = mesh.quaternion.clone().invert();
                const upVector = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
                const absX = Math.abs(upVector.x); const absY = Math.abs(upVector.y); const absZ = Math.abs(upVector.z);
                let face = 0;
                if (absX > absY && absX > absZ) face = upVector.x > 0 ? 1 : 6;
                else if (absY > absX && absY > absZ) face = upVector.y > 0 ? 2 : 5;
                else face = upVector.z > 0 ? 3 : 4;

                if (face === targetFace || face === 1) {
                    mesh.userData.diceMats.forEach(m => {
                        m.emissive.setHex(0x00aaff);
                        m.emissiveIntensity = 1.5;
                        m.color.setHex(0xddf4ff);
                    });
                    mesh.scale.set(1.2, 1.2, 1.2);
                    mesh.userData.isTarget = true;
                    mesh.userData.baseY = mesh.position.y;
                    mesh.userData.timeOffset = Math.random() * Math.PI * 2;
                } else {
                    mesh.userData.diceMats.forEach(m => {
                        m.emissive.setHex(0x000000);
                        m.color.setHex(0xffffff);
                    });
                    mesh.scale.set(1.0, 1.0, 1.0);
                    mesh.userData.isTarget = false;
                }
            }
        });
    }

    resetDiceHighlight(players) {
        players.forEach(p => {
            for (let i = 0; i < p.count; i++) {
                const mesh = p.meshes[i];
                mesh.scale.set(1, 1, 1);
                mesh.userData.isTarget = false;
                mesh.userData.diceMats.forEach(m => {
                    m.emissive.setHex(0x000000);
                    m.color.setHex(0xffffff);
                });
            }
        });
    }

    startRoll(players) {
        players.forEach(p => {
            for (let i = 0; i < p.count; i++) {
                const body = p.bodies[i];
                body.wakeUp();
                
                const rx = (Math.random() - 0.5) * 4;
                const rz = (Math.random() - 0.5) * 4;
                body.position.set(p.cx + rx, 15 + i * 1.5, p.cz + rz);
                body.velocity.set(0, 0, 0); body.angularVelocity.set(0, 0, 0);
                body.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, 0);
                body.applyImpulse(new CANNON.Vec3((Math.random() - 0.5) * 15, 0, (Math.random() - 0.5) * 15), new CANNON.Vec3(0, this.diceSize / 2, 0));
                body.angularVelocity.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
            }
        });
    }

    snapDice(players, data) {
        if (!data) return;
        players.forEach((p, pIdx) => {
            p.bodies.forEach((b, mIdx) => {
                if (data[pIdx] && data[pIdx][mIdx]) {
                    b.position.set(data[pIdx][mIdx].p[0], data[pIdx][mIdx].p[1], data[pIdx][mIdx].p[2]);
                    b.quaternion.set(data[pIdx][mIdx].q[0], data[pIdx][mIdx].q[1], data[pIdx][mIdx].q[2], data[pIdx][mIdx].q[3]);
                    b.velocity.set(0, 0, 0);
                    b.angularVelocity.set(0, 0, 0);
                    p.meshes[mIdx].position.copy(b.position);
                    p.meshes[mIdx].quaternion.copy(b.quaternion);
                }
            });
        });
    }

    countAllDice(players) {
        let counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        players.forEach(p => {
            for (let i = 0; i < p.count; i++) {
                const q = p.meshes[i].quaternion.clone().invert();
                const upVector = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
                const absX = Math.abs(upVector.x); const absY = Math.abs(upVector.y); const absZ = Math.abs(upVector.z);
                let face = 0;
                if (absX > absY && absX > absZ) face = upVector.x > 0 ? 1 : 6;
                else if (absY > absX && absY > absZ) face = upVector.y > 0 ? 2 : 5;
                else face = upVector.z > 0 ? 3 : 4;
                counts[face]++;
            }
        });
        return counts;
    }

    update(gameData) {
        if (!this.scene) return;

        let allStopped = true;

        if (gameData.state === 'ROLLING') {
            this.world.step(1 / 60);

            gameData.players.forEach(p => {
                for (let i = 0; i < p.count; i++) {
                    const body = p.bodies[i];
                    const mesh = p.meshes[i];

                    if (body.sleepState !== CANNON.Body.SLEEPING) {
                        mesh.position.copy(body.position);
                        mesh.quaternion.copy(body.quaternion);
                        allStopped = false;

                        if (Math.random() < 0.05) {
                            const vSq = body.velocity.lengthSquared(); 
                            const avSq = body.angularVelocity.lengthSquared();
                            if (vSq < 0.5 && avSq < 0.5 && body.position.y > (this.diceSize / 2 + 0.5)) {
                                body.applyImpulse(new CANNON.Vec3((Math.random() - 0.5) * 5, -2, (Math.random() - 0.5) * 5), new CANNON.Vec3(0, this.diceSize / 2, 0));
                            }
                        }
                    }
                }
            });

            if (this.isHost && allStopped) {
                if (this.onDiceStopped) this.onDiceStopped();
            }
        }

        if (this.particles.length > 0) {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.position.addScaledVector(p.userData.velocity, 1 / 60);
                p.userData.velocity.y -= 15 * (1 / 60);
                p.rotation.x += p.userData.rotVel.x;
                p.rotation.y += p.userData.rotVel.y;
                if (p.position.y < -10) {
                    this.scene.remove(p);
                    this.particles.splice(i, 1);
                }
            }
        }

        const time = Date.now() * 0.005;

        gameData.players.forEach(p => {
            if (p.cupGroup) {
                p.cupGroup.position.y = THREE.MathUtils.lerp(p.cupGroup.position.y, gameData.cupTargetY[p.id], 0.1);
                p.cupGroup.rotation.x = THREE.MathUtils.lerp(p.cupGroup.rotation.x, gameData.cupTargetRotX[p.id], 0.15);
            }

            if (gameData.state === 'RESOLVE' || gameData.state === 'GAME_OVER') {
                for (let i = 0; i < p.count; i++) {
                    const m = p.meshes[i];
                    if (m.userData.isTarget) {
                        m.position.y = (m.userData.baseY || 0) + 1.5 + Math.sin(time + m.userData.timeOffset) * 0.5;
                        m.rotation.y += 0.05;
                    }
                }
            }
        });

        this.camera.position.lerp(this.targetCameraPos, 0.05);
        this.currentLookAt.lerp(this.targetLookAt, 0.05);
        this.camera.lookAt(this.currentLookAt);

        this.renderer.render(this.scene, this.camera);
    }
}