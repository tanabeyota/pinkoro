// ==========================================
// 1. 通信管理クラス (NetworkManager)
// ==========================================
export class NetworkManager {
    constructor() {
        this.peer = null;
        this.isHost = false;
        this.conns = [];
        this.lastRoomId = null;

        this.onRoomCreated = null;
        this.onConnected = null;
        this.onGuestJoined = null;
        this.onMessageReceived = null;
        this.onError = null;
        this.onDisconnected = null;
        
        this.peerConfig = {
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun.cloudflare.com:3478' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        };
    }

    hostRoom() {
        this.isHost = true;
        const shortId = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.lastRoomId = shortId;
        const roomId = '5dice-' + shortId;

        try {
            this.peer = new Peer(roomId, this.peerConfig);
            this.peer.on('open', () => { if (this.onRoomCreated) this.onRoomCreated(shortId); });

            this.peer.on('connection', (connection) => {
                connection.on('open', () => {
                    this.conns.push(connection);
                    this._setupConnection(connection);
                    if (this.onGuestJoined) this.onGuestJoined(connection);
                });
            });

            this.peer.on('error', (err) => { if (this.onError) this.onError(err); });
        } catch (e) {
            if (this.onError) this.onError(e);
        }
    }

    joinRoom(shortId) {
        this.isHost = false;
        this.lastRoomId = shortId;
        try {
            this.peer = new Peer(this.peerConfig);
            this.peer.on('open', () => {
                const targetId = '5dice-' + shortId;
                const connection = this.peer.connect(targetId);
                this.conns.push(connection);

                connection.on('open', () => { this._setupConnection(connection); });
                connection.on('error', (err) => { if (this.onError) this.onError(err); });
            });
            this.peer.on('error', (err) => { if (this.onError) this.onError(err); });
        } catch (e) {
            if (this.onError) this.onError(e);
        }
    }

    reconnect(gameDataStore) {
        if (this.isHost) {
            this.hostRoom();
        } else {
            if (this.lastRoomId) {
                this.joinRoom(this.lastRoomId);
                setTimeout(() => this.send('RECONNECT_REQUEST', {}), 1500);
            }
        }
    }

    send(type, data = {}) {
        this.conns.forEach(c => {
            if (c && c.open) c.send({ type, ...data });
        });
    }

    _setupConnection(connection) {
        connection.on('data', (msg) => {
            if (this.isHost && msg.type !== 'RECONNECT_REQUEST') {
                this.conns.forEach(c => {
                    if (c !== connection && c.open) c.send(msg);
                });
            }
            if (this.onMessageReceived) this.onMessageReceived(msg);
        });

        connection.on('close', () => {
            this.conns = this.conns.filter(c => c !== connection);
            if (this.onDisconnected) this.onDisconnected();
        });

        if (this.onConnected) this.onConnected();
    }
}