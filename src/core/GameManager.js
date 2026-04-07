import * as THREE from 'three';
import { SoundManager } from '../audio/SoundManager.js';
import { NetworkManager } from '../network/NetworkManager.js';
import { UIManager } from '../ui/UIManager.js';
import { GraphicsEngine } from '../graphics/GraphicsEngine.js';

// ==========================================
// 4. ゲーム進行管理クラス (GameManager)
// ==========================================
export class GameManager {
    constructor() {
        this.network = new NetworkManager();
        this.ui = new UIManager();
        this.graphics = new GraphicsEngine('canvas-container');
        this.sound = new SoundManager();

        this.state = 'INITIALIZING';
        this.isHost = false;
        this.isSinglePlayer = false;
        this.myIndex = 0;

        this.playerCount = 0;
        this.players = [];
        this.connectedGuests = 0;

        this.cupTargetY = {};
        this.cupTargetRotX = {};
        this.turnIndex = 0;
        this.currentBid = { face: 0, count: 0, playerId: null };
        
        this.finalDiceData = null;
        this.isMouseDown = false;

        this._setupEvents();
        document.addEventListener('click', () => this.sound.resume(), { once: true });
    }

    initPlayers(count) {
        this.playerCount = count;
        this.players = [];
        this.cupTargetY = {};
        this.cupTargetRotX = {};

        for (let i = 0; i < this.playerCount; i++) {
            const id = 'player' + i;
            const hue = i / this.playerCount;
            const color = new THREE.Color().setHSL(hue, 1.0, 0.6).getHex();
            this.players.push({
                id: id, count: 5, meshes: [], bodies: [], cupGroup: null,
                name: 'Player ' + (i + 1), colorHex: color, angle: 0, cx: 0, cz: 0
            });
            this.cupTargetY[id] = 0;
            this.cupTargetRotX[id] = 0;
        }
    }

    _getFullState() {
        return { state: this.state, turnIndex: this.turnIndex, currentBid: this.currentBid, playerCounts: this.players.map(p => p.count), finalDiceData: this.finalDiceData };
    }

    _restoreFullState(stateData) {
        this.state = stateData.state; this.turnIndex = stateData.turnIndex; this.currentBid = stateData.currentBid;
        stateData.playerCounts.forEach((count, i) => { this.players[i].count = count; });
        this.ui.updateHUD(this.players, this.myIndex);
        this.graphics.recreateDice(this.players);
        
        if (stateData.finalDiceData) {
            this.finalDiceData = stateData.finalDiceData;
            setTimeout(() => this.graphics.snapDice(this.players, this.finalDiceData), 100);
        }

        if (this.currentBid && this.currentBid.count > 0) {
            const cp = this.players.find(p => p.id === this.currentBid.playerId);
            if (cp) this.ui.updateCurrentBidDisplay(this.currentBid.face, this.currentBid.count, cp.name, cp.colorHex.toString(16).padStart(6, '0'));
        } else {
            this.ui.hideCurrentBidDisplay();
        }

        if (this.state === 'PLAYING') { this.proceedTurnLocal(this.turnIndex); } 
        else if (this.state === 'IDLE' || this.state === 'ROLLING') { this.ui.setInstruction("通信が復帰しました。進行をお待ちください"); }
        this.ui.hideReconnectModal();
    }

    _resetCupHold() {
        if (this.isMouseDown) { this.isMouseDown = false; document.getElementById('canvas-container').style.cursor = 'pointer'; }
    }

    _setupEvents() {
        this.ui.onStartSingleClick = (cpuCount) => {
            this.isSinglePlayer = true;
            this.isHost = true;
            this.myIndex = 0;
            this.initPlayers(cpuCount + 1);
            
            for(let i=1; i < this.players.length; i++) {
                this.players[i].name = `CPU ${i}`;
            }

            this.ui.hideConnectionPanel();
            this.ui.initGameUI(this.players, this.myIndex, true);
            this.ui.updateHUD(this.players, this.myIndex);
            this.graphics.init(this.players, true, this.myIndex);
            this.animate();
            this.sound.playClick();

            setTimeout(() => { this.startRoundLocal(); }, 1000);
        };

        this.ui.onHostClick = (count) => {
            this.isHost = true; this.isSinglePlayer = false; this.myIndex = 0;
            this.initPlayers(count); this.network.hostRoom(); this.sound.playClick();
        };

        this.ui.onJoinClick = (shortId) => {
            this.isHost = false; this.isSinglePlayer = false;
            this.network.joinRoom(shortId); this.sound.playClick();
        };

        this.ui.onRaiseClick = (face, count) => {
            if (this.state !== 'PLAYING' || this.turnIndex !== this.myIndex) return;
            if (this.validateBid(face, count)) {
                this.sound.playClick();
                if (!this.isSinglePlayer) this.network.send('ACTION_RAISE', { playerId: this.players[this.myIndex].id, face: face, count: count });
                this.submitBidLocal(this.players[this.myIndex], face, count);
            } else alert("宣言が無効です。");
        };

        this.ui.onDoubtClick = () => {
            if (this.state !== 'PLAYING' || this.turnIndex !== this.myIndex) return;
            this.sound.playClick();
            if (!this.isSinglePlayer) this.network.send('ACTION_DOUBT', { playerId: this.players[this.myIndex].id });
            this.resolveDoubtLocal(this.players[this.myIndex]);
        };

        const handleHoldStart = () => {
            if (this.state === 'INITIALIZING' && this.isHost && !this.isSinglePlayer && this.connectedGuests === this.playerCount - 1) {
                return this.startRoundHost();
            }
            if (this.state === 'PLAYING') {
                this.isMouseDown = true; 
                document.getElementById('canvas-container').style.cursor = 'grabbing';
                const myId = this.players[this.myIndex].id;
                this.cupTargetY[myId] = 0; this.cupTargetRotX[myId] = -Math.PI * 0.3;
                if (!this.isSinglePlayer) this.network.send('CUP_MOVE', { playerId: myId, isUp: true });
            }
        };

        const handleHoldEnd = () => {
            if (this.isMouseDown && this.state === 'PLAYING') {
                this.isMouseDown = false; 
                document.getElementById('canvas-container').style.cursor = 'pointer';
                const myId = this.players[this.myIndex].id;
                this.cupTargetY[myId] = 0; this.cupTargetRotX[myId] = 0;
                if (!this.isSinglePlayer) this.network.send('CUP_MOVE', { playerId: myId, isUp: false });
            }
        };

        document.getElementById('canvas-container').addEventListener('mousedown', (e) => { if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') handleHoldStart(); });
        window.addEventListener('mouseup', handleHoldEnd);
        document.getElementById('canvas-container').addEventListener('touchstart', (e) => { if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') handleHoldStart(); }, { passive: false });
        document.getElementById('canvas-container').addEventListener('touchend', handleHoldEnd);

        this.network.onDisconnected = () => {
            if (this.state === 'GAME_OVER' || this.isSinglePlayer) return;
            if (this.isHost) { this.ui.addLog("プレイヤーとの通信が切断されました", "sys"); return; }
            this.ui.showReconnectModal(); setTimeout(() => { this.network.reconnect(); }, 3000);
        };

        this.network.onRoomCreated = (shortId) => { this.ui.showHostInfo(shortId); };

        this.network.onGuestJoined = (conn) => {
            this.connectedGuests++;
            conn.__assignedIndex = this.connectedGuests;
            conn.send({ type: 'ASSIGN_INDEX', index: this.connectedGuests });
            this.ui.setHostStatus(`参加者を待っています... (${this.connectedGuests + 1}/${this.playerCount})`);

            if (this.connectedGuests === this.playerCount - 1) {
                this.ui.setHostStatus("全員揃いました！ゲームを開始します...");
                setTimeout(() => {
                    this.network.conns.forEach(c => {
                        if (c && c.open) {
                            c.send({
                                type: 'GAME_INIT',
                                myIndex: c.__assignedIndex,
                                playerCount: this.playerCount
                            });
                        }
                    });
                    this.ui.hideConnectionPanel();
                    this.ui.initGameUI(this.players, this.myIndex);
                    this.ui.updateHUD(this.players, this.myIndex);
                    this.graphics.init(this.players, this.isHost, this.myIndex);
                    this.animate();
                }, 1500);
            }
        };

        this.network.onMessageReceived = (msg) => {
            if (msg.type === 'ASSIGN_INDEX' && !this.isHost) { this.myIndex = msg.index; this.ui.setHostStatus("ホストからの開始合図を待っています..."); return; }
            if (msg.type === 'GAME_INIT' && !this.isHost) {
                this.myIndex = msg.myIndex; this.initPlayers(msg.playerCount);
                this.ui.hideConnectionPanel(); this.ui.initGameUI(this.players, this.myIndex);
                this.ui.updateHUD(this.players, this.myIndex); this.graphics.init(this.players, this.isHost, this.myIndex);
                this.animate(); return;
            }
            if (msg.type === 'RECONNECT_REQUEST' && this.isHost) { this.network.send('STATE_RESTORE', this._getFullState()); }
            if (msg.type === 'STATE_RESTORE' && !this.isHost) { this._restoreFullState(msg); }
            if (msg.type === 'STATE_START_ROUND') { this.graphics.recreateDice(this.players); this.startRoundLocal(); }
            else if (msg.type === 'STATE_DICE_STOPPED') {
                this.finalDiceData = msg.diceData; this.graphics.snapDice(this.players, this.finalDiceData);
                this.state = 'IDLE'; Object.keys(this.cupTargetY).forEach(k => this.cupTargetY[k] = 0);
            }
            else if (msg.type === 'STATE_PROCEED_TURN') { this.proceedTurnLocal(msg.turnIndex); }
            else if (msg.type === 'ACTION_RAISE') { this.submitBidLocal(this.players.find(p => p.id === msg.playerId), msg.face, msg.count); }
            else if (msg.type === 'ACTION_DOUBT') { this.resolveDoubtLocal(this.players.find(p => p.id === msg.playerId)); }
            else if (msg.type === 'CUP_MOVE') { this.cupTargetY[msg.playerId] = 0; this.cupTargetRotX[msg.playerId] = msg.isUp ? -Math.PI * 0.3 : 0; }
        };

        this.graphics.onDiceStopped = () => {
            this.finalDiceData = this.players.map(p => p.bodies.map(b => ({ p: b.position.toArray(), q: b.quaternion.toArray() })));
            if (!this.isSinglePlayer) this.network.send('STATE_DICE_STOPPED', { diceData: this.finalDiceData });
            
            this.state = 'IDLE';
            Object.keys(this.cupTargetY).forEach(k => this.cupTargetY[k] = 0);
            setTimeout(() => { 
                if (this.isSinglePlayer) { this.proceedTurnLocal(this.turnIndex); }
                else { this.proceedTurnHost(); }
            }, 500);
        };
    }

    validateBid(face, count) {
        if (this.currentBid.count === 0) return true;
        if (count > this.currentBid.count) return true;
        if (count === this.currentBid.count && face > this.currentBid.face) return true;
        return false;
    }

    submitBidLocal(player, face, count) {
        this.currentBid = { face, count, playerId: player.id };
        const colorStr = player.colorHex.toString(16).padStart(6, '0');
        this.ui.addLog(`${player.name} : ${face}が ${count}個以上！`, '#' + colorStr);
        this.ui.hideActionPanel(); this.ui.setInstruction("");
        this.ui.updateCurrentBidDisplay(face, count, player.name, colorStr);

        if (this.isHost) {
            do { this.turnIndex = (this.turnIndex + 1) % this.playerCount; } while (this.players[this.turnIndex].count <= 0);
            if (this.isSinglePlayer) { this.proceedTurnLocal(this.turnIndex); }
            else { this.proceedTurnHost(); }
        }
    }

    proceedTurnHost() {
        this.network.send('STATE_PROCEED_TURN', { turnIndex: this.turnIndex });
        this.proceedTurnLocal(this.turnIndex);
    }

    proceedTurnLocal(turnIdx) {
        this.state = 'PLAYING';
        this.turnIndex = turnIdx;
        if (this.turnIndex === this.myIndex) {
            this.sound.playTurn(); this.ui.setInstruction("あなたのターン");
            let totalDice = 0; this.players.forEach(p => totalDice += p.count);
            this.ui.updateActionOptions(this.currentBid.count, totalDice);
            this.ui.showActionPanel();
        } else {
            const currentPlayerName = this.players[this.turnIndex] ? this.players[this.turnIndex].name : '...';
            this.ui.setInstruction(`${currentPlayerName} のターン...`);
            this.ui.hideActionPanel();
            
            if (this.isSinglePlayer) { this.playCPUTurn(); }
        }
    }

    playCPUTurn() {
        const cpu = this.players[this.turnIndex];
        
        setTimeout(() => {
            if (this.state !== 'PLAYING') return;
            let totalDice = 0; this.players.forEach(p => totalDice += p.count);
            const currentBid = this.currentBid;

            let myCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
            for (let i = 0; i < cpu.count; i++) {
                const q = cpu.meshes[i].quaternion.clone().invert();
                const upVector = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
                const aX = Math.abs(upVector.x), aY = Math.abs(upVector.y), aZ = Math.abs(upVector.z);
                let face = 0;
                if (aX > aY && aX > aZ) face = upVector.x > 0 ? 1 : 6;
                else if (aY > aX && aY > aZ) face = upVector.y > 0 ? 2 : 5;
                else face = upVector.z > 0 ? 3 : 4;
                myCounts[face]++;
            }

            let shouldDoubt = false;
            let nextFace = currentBid.face;
            let nextCount = currentBid.count;

            if (currentBid.count === 0) {
                nextFace = Math.floor(Math.random() * 5) + 2; 
                let maxCount = 0;
                for(let f=2; f<=6; f++) { if(myCounts[f] > maxCount) { maxCount = myCounts[f]; nextFace = f; } }
                nextCount = maxCount > 0 ? maxCount : 1;
            } else {
                const expectedOthers = (totalDice - cpu.count) / 3;
                const myTargetCount = myCounts[currentBid.face] + myCounts[1];
                const expectedTotal = expectedOthers + myTargetCount;

                if (currentBid.count > expectedTotal + 0.5) {
                    shouldDoubt = true;
                } else {
                    if (Math.random() < 0.4 && nextFace < 6) { nextFace++; } 
                    else { nextCount++; }
                }
            }

            if (shouldDoubt) { this.resolveDoubtLocal(cpu); } 
            else { this.submitBidLocal(cpu, nextFace, nextCount); }
        }, 1500 + Math.random() * 1500);
    }

    async resolveDoubtLocal(doubtingPlayer) {
        this.state = 'RESOLVE'; this._resetCupHold();
        this.ui.hideActionPanel(); this.ui.hideCurrentBidDisplay(); this.ui.hideHUD();
        this.ui.addLog(`${doubtingPlayer.name} : ダウト！！`, '#' + doubtingPlayer.colorHex.toString(16).padStart(6, '0'));
        this.ui.setInstruction("ダウト！！ 判定中...");

        this.graphics.setCameraMode('resolve', this.players, this.myIndex);
        this.players.forEach(p => p.meshes.forEach(m => m.visible = true));
        this.ui.hideCenterUI();

        Object.keys(this.cupTargetY).forEach(k => { this.cupTargetY[k] = 60; this.cupTargetRotX[k] = 0; });

        await new Promise(r => setTimeout(r, 1500));

        const counts = this.graphics.countAllDice(this.players);
        const bidF = this.currentBid.face, bidC = this.currentBid.count;
        const onesCount = counts[1] || 0;
        const actualC = (bidF === 1) ? onesCount : ((counts[bidF] || 0) + onesCount);

        let logMsg = `【判定】 ${bidF}の目は全部で ${actualC}個 `;
        if (bidF !== 1 && onesCount > 0) logMsg += `(ワイルドの1が ${onesCount}個) `;
        this.ui.addLog(logMsg + `でした！`, 'sys');

        this.graphics.highlightDice(this.players, bidF);

        await new Promise(r => setTimeout(r, 1500));

        const declaringPlayer = this.players.find(p => p.id === this.currentBid.playerId);
        let isMyWin = false, isSuccess = false;

        if (actualC >= bidC) {
            this.ui.addLog(`${doubtingPlayer.name} のダウト失敗！`, 'sys');
            doubtingPlayer.count -= 1;
            if (declaringPlayer.id === this.players[this.myIndex].id) isMyWin = true;
        } else {
            this.ui.addLog(`${doubtingPlayer.name} のダウト成功！`, 'sys');
            declaringPlayer.count -= 1;
            if (doubtingPlayer.id === this.players[this.myIndex].id) isMyWin = true;
            isSuccess = true;
        }

        this.ui.showResult(bidF, actualC, doubtingPlayer.name, isSuccess);

        if (isMyWin) { this.sound.playWin(); this.graphics.emitConfetti(); } 
        else { this.sound.playLose(); }

        this.ui.updateHUD(this.players, this.myIndex);

        const alivePlayers = this.players.filter(p => p.count > 0);
        if (alivePlayers.length <= 1) {
            this.ui.showCenterUI();
            const winnerText = alivePlayers[0].id === this.players[this.myIndex].id ? "YOU WIN!!" : "GAME OVER...";
            this.ui.setInstruction(winnerText);
            this.ui.addLog(`ゲーム終了！`, 'sys');
            this.state = 'GAME_OVER';
        } else {
            await new Promise(r => setTimeout(r, 4000));
            if (this.isHost) {
                this.graphics.recreateDice(this.players);
                this.turnIndex = this.players.findIndex(p => p.id === (actualC >= bidC ? doubtingPlayer.id : declaringPlayer.id));
                if (this.isSinglePlayer) { this.startRoundLocal(); } 
                else { this.startRoundHost(); }
            }
        }
    }

    startRoundHost() {
        this.network.send('STATE_START_ROUND');
        this.startRoundLocal();
    }

    startRoundLocal() {
        this.state = 'ROLLING'; this.graphics.startRoll(this.players);
        this.currentBid = { face: 0, count: 0, playerId: null };

        this.ui.hideActionPanel(); this.ui.hideCurrentBidDisplay(); this.ui.hideResult();
        this.ui.showHUD(); this.ui.showCenterUI();
        this.ui.setInstruction("ガラガラガラ...", "画面長押しで自分のサイコロを確認できます");
        this.ui.clearLog(); this.ui.addLog("--- ラウンド開始 ---", "sys");

        this.graphics.resetDiceHighlight(this.players);
        this.graphics.setCameraMode('normal', this.players, this.myIndex);

        Object.keys(this.cupTargetY).forEach(k => { this.cupTargetY[k] = 22; this.cupTargetRotX[k] = 0; });
        this.players.forEach((p, idx) => { p.meshes.forEach(m => m.visible = (idx === this.myIndex)); });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const gameData = { state: this.state, players: this.players, cupTargetY: this.cupTargetY, cupTargetRotX: this.cupTargetRotX };
        this.graphics.update(gameData);
        if (this.state === 'ROLLING') { if (Math.random() < 0.25) { this.sound.playDiceHit(0.01 + Math.random() * 0.03); } }
    }
}