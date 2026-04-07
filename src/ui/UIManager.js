// ==========================================
// 2. UI管理クラス (UIManager)
// ==========================================
export class UIManager {
    constructor() {
        this.connPanel = document.getElementById('connection-panel');
        this.viewMain = document.getElementById('view-main');
        this.viewSingle = document.getElementById('view-single');
        this.viewMulti = document.getElementById('view-multi');
        
        this.btnMenuSingle = document.getElementById('btn-menu-single');
        this.btnMenuMulti = document.getElementById('btn-menu-multi');
        this.btnBacks = document.querySelectorAll('.btn-back');
        
        this.btnStartSingle = document.getElementById('btn-start-single');
        this.selCpuCount = document.getElementById('sel-cpu-count');

        this.btnHost = document.getElementById('btn-host');
        this.btnJoin = document.getElementById('btn-join');
        this.selPlayerCount = document.getElementById('sel-player-count');
        this.inputRoomId = document.getElementById('input-room-id');
        this.hostInfo = document.getElementById('host-info');
        this.roomIdDisplay = document.getElementById('room-id-display');
        this.hostStatus = document.getElementById('host-status');

        this.hud = document.getElementById('hud');
        this.logPanel = document.getElementById('log-panel');
        this.actionPanel = document.getElementById('action-panel');
        this.selFace = document.getElementById('sel-face');
        this.selCount = document.getElementById('sel-count');
        this.btnRaise = document.getElementById('btn-raise');
        this.btnDoubt = document.getElementById('btn-doubt');

        this.uiCenter = document.getElementById('ui');
        this.uiInstruction = document.getElementById('instruction');
        this.uiSub = document.getElementById('sub-instruction');
        this.roleIndicator = document.getElementById('role-indicator');

        this.reconnectModal = document.getElementById('reconnect-modal');
        this.reconnectStatus = document.getElementById('reconnect-status');
        this.bidDisplay = document.getElementById('current-bid-display');
        this.bidTitle = document.getElementById('current-bid-title');
        this.bidValue = document.getElementById('current-bid-value');
        this.resultDisplay = document.getElementById('result-display');
        this.resultTitle = document.getElementById('result-title');
        this.resultDetail = document.getElementById('result-detail');
        this.resultJudgment = document.getElementById('result-judgment');

        this.onStartSingleClick = null;
        this.onHostClick = null;
        this.onJoinClick = null;
        this.onRaiseClick = null;
        this.onDoubtClick = null;

        this._setupEventListeners();
    }

    _setupEventListeners() {
        document.getElementById('btn-help').addEventListener('click', () => { document.getElementById('rule-modal').style.display = 'block'; });
        document.getElementById('btn-close-rule').addEventListener('click', () => { document.getElementById('rule-modal').style.display = 'none'; });

        // メニュー切り替え
        this.btnMenuSingle.addEventListener('click', () => {
            this.viewMain.style.display = 'none';
            this.viewSingle.style.display = 'block';
        });
        this.btnMenuMulti.addEventListener('click', () => {
            this.viewMain.style.display = 'none';
            this.viewMulti.style.display = 'block';
        });
        this.btnBacks.forEach(btn => {
            btn.addEventListener('click', () => {
                this.viewSingle.style.display = 'none';
                this.viewMulti.style.display = 'none';
                this.viewMain.style.display = 'block';
            });
        });

        this.btnStartSingle.addEventListener('click', () => {
            const cpuCount = parseInt(this.selCpuCount.value);
            if (this.onStartSingleClick) this.onStartSingleClick(cpuCount);
        });

        this.btnHost.addEventListener('click', () => {
            const count = parseInt(this.selPlayerCount.value);
            this.btnHost.disabled = true; this.btnJoin.disabled = true; this.inputRoomId.disabled = true; this.selPlayerCount.disabled = true;
            this.btnHost.innerText = "通信サーバーに接続中...";
            if (this.onHostClick) this.onHostClick(count);
        });

        this.btnJoin.addEventListener('click', () => {
            const shortId = this.inputRoomId.value.trim().toUpperCase();
            if (!shortId || shortId.length !== 4) return alert("4桁の部屋IDを正しく入力してください");
            this.btnHost.disabled = true; this.btnJoin.disabled = true; this.inputRoomId.disabled = true;
            this.btnJoin.innerText = "接続中...";
            if (this.onJoinClick) this.onJoinClick(shortId);
        });

        this.btnRaise.addEventListener('click', () => {
            const f = parseInt(this.selFace.value);
            const c = parseInt(this.selCount.value);
            if (this.onRaiseClick) this.onRaiseClick(f, c);
        });

        this.btnDoubt.addEventListener('click', () => {
            if (this.onDoubtClick) this.onDoubtClick();
        });
    }

    showHostInfo(shortId) {
        this.btnHost.innerText = "ホストになる";
        this.hostInfo.style.display = 'block';
        this.roomIdDisplay.innerText = shortId;
    }
    setHostStatus(text) { this.hostStatus.innerText = text; }
    hideConnectionPanel() { this.connPanel.style.display = 'none'; }
    showReconnectModal() { this.reconnectModal.style.display = 'flex'; }
    hideReconnectModal() { this.reconnectModal.style.display = 'none'; }
    setReconnectStatus(text) { this.reconnectStatus.innerText = text; }

    initGameUI(players, myIndex, isSinglePlayer = false) {
        this.hud.style.display = 'flex';
        this.uiCenter.style.display = 'flex';
        this.logPanel.style.display = 'flex';
        
        if (isSinglePlayer) {
            this.roleIndicator.innerText = "【SINGLE PLAYER】";
        } else {
            this.roleIndicator.innerText = (myIndex === 0) ? "【HOST】 Player 1" : `【GUEST】 Player ${myIndex + 1}`;
        }

        this.hud.innerHTML = '';
        players.forEach(p => {
            const div = document.createElement('div');
            div.className = 'player-info';
            div.id = 'hud-' + p.id;
            this.hud.appendChild(div);
        });
    }

    updateHUD(players, myIndex) {
        players.forEach((p, i) => {
            const div = document.getElementById('hud-' + p.id);
            if (div) {
                const nameText = `${p.name}${i === myIndex ? ' (You)' : ''}`;
                let diceIcons = '';
                for(let j = 0; j < p.count; j++) { diceIcons += '<span class="dice-icon">🎲</span>'; }
                div.innerHTML = `<div class="player-name">${nameText}</div><div class="player-dice">${diceIcons}<span class="dice-number">${p.count}</span></div>`;
                div.style.color = '#' + p.colorHex.toString(16).padStart(6, '0');
            }
        });
    }

    setInstruction(mainText, subText = "") {
        this.uiInstruction.innerText = mainText;
        this.uiSub.innerText = subText;
    }

    updateActionOptions(currentBidCount, totalDice) {
        this.selCount.innerHTML = '';
        let minCount = currentBidCount > 0 ? currentBidCount : 1;
        for (let i = minCount; i <= totalDice; i++) {
            const opt = document.createElement('option');
            opt.value = i; opt.innerText = i;
            this.selCount.appendChild(opt);
        }
        this.btnDoubt.disabled = (currentBidCount === 0);
    }

    showActionPanel() { this.actionPanel.style.display = 'flex'; }
    hideActionPanel() { this.actionPanel.style.display = 'none'; }
    hideCenterUI() { this.uiCenter.style.display = 'none'; }
    showCenterUI() { this.uiCenter.style.display = 'flex'; }

    addLog(msg, typeOrHex) {
        const el = document.createElement('div');
        el.className = 'log-entry';
        if (typeOrHex === 'sys') { el.classList.add('log-sys'); }
        else { el.style.borderLeftColor = typeOrHex; }
        el.innerText = msg;
        this.logPanel.appendChild(el);
        this.logPanel.scrollTop = this.logPanel.scrollHeight;
    }

    clearLog() { this.logPanel.innerHTML = ''; }

    updateCurrentBidDisplay(face, count, playerName, colorHex) {
        if (count === 0) { this.bidDisplay.style.display = 'none'; return; }
        this.bidDisplay.style.display = 'flex';
        this.bidDisplay.style.borderColor = '#' + colorHex;
        const r = parseInt(colorHex.substring(0, 2), 16), g = parseInt(colorHex.substring(2, 4), 16), b = parseInt(colorHex.substring(4, 6), 16);
        this.bidDisplay.style.boxShadow = `0 0 20px rgba(${r}, ${g}, ${b}, 0.5)`;
        this.bidTitle.innerText = `${playerName} の宣言`;
        this.bidTitle.style.color = '#' + colorHex;
        this.bidValue.innerHTML = `<span class="bid-face-icon">${face}</span> が ${count} 個以上`;
    }

    hideCurrentBidDisplay() { this.bidDisplay.style.display = 'none'; }
    hideHUD() { this.hud.style.display = 'none'; }
    showHUD() { this.hud.style.display = 'flex'; }

    showResult(bidFace, actualCount, doubterName, isSuccess) {
        this.resultDisplay.style.display = 'flex';
        this.resultDetail.innerHTML = `<span class="bid-face-icon">${bidFace}</span> × ${actualCount}個`;
        if (isSuccess) {
            this.resultDisplay.style.borderColor = "#00f2fe"; this.resultTitle.style.color = "#00f2fe";
            this.resultDisplay.style.boxShadow = "0 0 50px rgba(0, 242, 254, 0.4)";
            this.resultJudgment.innerText = `${doubterName} のダウト成功！`; this.resultJudgment.style.color = "#00f2fe";
        } else {
            this.resultDisplay.style.borderColor = "#ff007f"; this.resultTitle.style.color = "#ff007f";
            this.resultDisplay.style.boxShadow = "0 0 50px rgba(255, 0, 127, 0.4)";
            this.resultJudgment.innerText = `${doubterName} のダウト失敗...`; this.resultJudgment.style.color = "#ff007f";
        }
    }
    hideResult() { this.resultDisplay.style.display = 'none'; }
}