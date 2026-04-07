import { GameManager } from './core/GameManager.js';

window.onerror = function (msg, url, line) {
    console.error("エラーが発生しました: " + msg + "\n行: " + line);
};

// ゲームの起動
document.addEventListener('DOMContentLoaded', () => {
    const app = new GameManager();
});