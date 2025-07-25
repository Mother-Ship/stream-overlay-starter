<script setup lang="ts">
import {BracketDataManager} from "../../util/bracket-data-manager.ts";
import {
  getStoredBeatmapById, storeMatchResult
} from "../../util/localstorage-op.js";
import OsuParser from '../../util/osu-parser.ts';
import MapMockManager from '../../util/map-mock-manager.ts';
import type {WebSocketV1} from '../../util/types/websocket-v1-models';

// @ts-ignore
import {CountUp} from '../../lib/count-up.min.js';
// @ts-ignore
import {__wbg_init} from '../../lib/rosu-pp/rosu-pp.js';
// @ts-ignore
import WebSocketManager from '../../lib/websocket-manager.js';

import {ref, reactive, onMounted, watch, computed, nextTick} from 'vue';

// 从URL query获取mode参数
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode') || 'std';

// 响应式状态定义
const gameState = ref(0); // IPC状态
const isRecordingNotificationVisible = ref(false);
const isRecordingAckButtonVisible = ref(false);

// 队伍信息
const teamA = reactive({
  name: "",
  fullName: "",
  avatar: "",
  score: 0,
  star: 0,
  scoreBarWidth: 1920,
  scoreLeadVisible: false,
  scoreLeadValue: 0
});

const teamB = reactive({
  name: "",
  fullName: "",
  avatar: "",
  score: 0,
  star: 0,
  scoreBarWidth: 1920,
  scoreLeadVisible: false,
  scoreLeadValue: 0
});

// 地图信息
const mapInfo = reactive({
  title: "",
  diff: "",
  mapper: "",
  cover: "",
  picker: "",
  needsScrolling: false
});

// 比赛设置
const matchSettings = reactive({
  round: "",
  bestOf: 0,
  maxStars: 0
});

// 聊天系统
const chat = reactive({
  visible: false,
  messages: [] as Array<{
    time: string;
    name: string;
    messageBody: string;
    team: 'left' | 'right' | 'bot' | 'unknown';
  }>
});

// 比赛轮次按钮状态
const roundButtons = reactive({
  'button-match-16': {active: false, text: 'RO16', roundText: 'Round of 16'},
  'button-match-qf': {active: false, text: 'QuaterFinal', roundText: 'QuarterFinals'},
  'button-match-sf': {active: false, text: 'SemiFinal', roundText: 'SemiFinals'},
  'button-match-3rd': {active: false, text: '3rd Place', roundText: '3rd Place'},
  'button-match-f': {active: false, text: 'Final', roundText: 'Final'}
});

// CountUp实例（用于数字动画）
let countUpInstances: { [key: string]: any } = {};

// 缓存状态（用于比较变化）
const cache = reactive({
  state: 0,
  stateTimer: null as any,
  leftTeamName: "",
  rightTeamName: "",
  leftScore: 0,
  rightScore: 0,
  bestOF: 0,
  leftStar: 0,
  rightStar: 0,
  chatLength: 0,
  md5: "",
  mapChosen: false,
});

// 计算属性
const teamAStars = computed(() => {
  const stars = [];
  for (let i = 0; i < matchSettings.maxStars; i++) {
    stars.push({
      filled: i < teamA.star,
      class: i < teamA.star ? 'team-a-star' : 'team-a-star-slot'
    });
  }
  return stars;
});

const teamBStars = computed(() => {
  const stars = [];
  for (let i = 0; i < matchSettings.maxStars; i++) {
    stars.push({
      filled: (matchSettings.maxStars - i - 1) < teamB.star,
      class: (matchSettings.maxStars - i - 1) < teamB.star ? 'team-b-star' : 'team-b-star-slot'
    });
  }
  return stars;
});

const chatMessagesHtml = computed(() => {
  return chat.messages.map(item => {
    const teamClass = {
      'left': 'player-a-name-chat',
      'right': 'player-b-name-chat',
      'bot': 'unknown-chat',
      'unknown': 'unknown-chat'
    }[item.team];

    return
    `<p>
<span class="time chat-item">${item.time}&nbsp;</span>
<span class="${teamClass} chat-item">${item.name}:&nbsp;</span>
<span class="chat-item">${item.messageBody}</span>
</p>`;
  }).join('');
});

// 全局工具对象
let osuParser: any = null;
let mapMockManager: any = null;
let bracketManager: any = null;

onMounted(async () => {

  // 初始化CountUp实例
  initCountUpInstances();

  // 禁用上下文菜单和文本选择
  setupPreventHandlers();

  // 初始化解析器和mock管理器
  await initializeParsers();

  // 从localStorage恢复比赛轮次
  restoreMatchRound();

  // OBS录制检查
  checkObsRecording();

  // 启动WebSocket连接
  await startWebSocketConnection();
});

// 监听器
watch(() => gameState.value, (newState) => {
  handleIpcStateChange(newState);
});

watch(() => mapInfo.title, async () => {
  await nextTick();
  checkTitleScrolling();
});

watch(() => matchSettings.bestOf, (newBestOf) => {
  if (newBestOf > 0) {
    matchSettings.maxStars = Math.floor(newBestOf / 2) + 1;
  }
});

watch(() => chat.messages, () => {
  nextTick(() => {
    scrollChatToBottom();
  });
});

// 初始化函数
function initCountUpInstances() {
  countUpInstances = {
    teamAScore: new CountUp('team-a-score', 0, {duration: 0.5, useGrouping: true}),
    teamBScore: new CountUp('team-b-score', 0, {duration: 0.5, useGrouping: true}),
    mapAr: new CountUp('map-ar', 0, {duration: 0.5, decimalPlaces: 1}),
    mapOd: new CountUp('map-od', 0, {duration: 0.5, decimalPlaces: 1}),
    mapCs: new CountUp('map-cs', 0, {duration: 0.5, decimalPlaces: 1}),
    mapHp: new CountUp('map-hp', 0, {duration: 0.5, decimalPlaces: 1}),
    mapBpm: new CountUp('map-bpm', 0, {duration: 0.5}),
    mapStar: new CountUp('map-star', 0, {duration: 0.5, decimalPlaces: 2, suffix: '*'}),
    teamAScoreLead: new CountUp('team-a-score-lead', 0, {duration: 0.5, useGrouping: true}),
    teamBScoreLead: new CountUp('team-b-score-lead', 0, {duration: 0.5, useGrouping: true})
  };
}

function setupPreventHandlers() {
  const preventHandler = (event: Event) => {
    event.preventDefault();
  };
  document.addEventListener('contextmenu', preventHandler);
  document.addEventListener('selectstart', preventHandler);
}

async function initializeParsers() {
  await __wbg_init('../../lib/rosu-pp/rosu_pp_bg.wasm');
  osuParser = new OsuParser();

  mapMockManager = MapMockManager.getInstance(mode);
  await mapMockManager.init();
  bracketManager = BracketDataManager.getInstance(mode);
  await bracketManager.init();
}

function restoreMatchRound() {
  const currentMatchRound = localStorage.getItem('currentMatchRound' + mode);
  if (currentMatchRound) {
    matchSettings.round = currentMatchRound;
    // 激活对应按钮
    Object.entries(roundButtons).forEach(([key, button]) => {
      if (button.roundText === currentMatchRound) {
        button.active = true;
      } else {
        button.active = false;
      }
    });
  }
}

async function startWebSocketConnection() {
  if (import.meta.env.VITE_TOSU_DATA_MOCK === 'true') {
    const {menu, tourney} = await import(
      /* @vite-ignore */
    '../../debug/ws-mock/mock-playing-' + mode + '.js'
      );
    await handleWebSocket(menu, tourney);
  } else {
    const socket = new WebSocketManager('127.0.0.1:24050');
    socket.api_v1(async ({menu, tourney}: WebSocketV1) => {
      await handleWebSocket(menu, tourney);
    });
  }
}

// 核心处理函数
async function handleWebSocket(menu: any, tourney: any) {
  try {
    await updateMapInfo(menu);
    await updateTeamInfo(tourney);
    updatePickerInfo(menu.bm.id);
    updateChat(tourney.manager.chat);
    updateGameState(tourney.manager.ipcState || 0);
    updateScores(tourney);
    updateStars(tourney);
    storeMatchResultIfNeed(tourney, menu.bm.id);
  } catch (error) {
    console.error('WebSocket处理错误:', error);
  }
}

async function updateMapInfo(menu: any) {
  const md5 = menu.bm.md5;
  if (md5 !== cache.md5) {
    cache.md5 = md5;
    cache.mapChosen = false;
    mapInfo.picker = "";

    // 更新封面
    mapInfo.cover = `http://localhost:24050/Songs/${encodeURIComponent(menu.bm.path.folder)}/${encodeURIComponent(menu.bm.path.bg)}`;

    // 解析beatmap
    const parsed = await osuParser.parse(`http://localhost:24050/Songs/${encodeURIComponent(menu.bm.path.folder)}/${encodeURIComponent(menu.bm.path.file)}`);

    const modNameAndIndex = await bracketManager.getModNameAndIndexById(parsed.metadata.bid, mode);
    parsed.mod = modNameAndIndex.modName;
    parsed.index = modNameAndIndex.index;

    const mods = OsuParser.getModEnumFromModString(parsed.mod);
    parsed.modded = osuParser.getModded(parsed, mods);

    // 更新地图信息
    mapInfo.title = `${parsed.modded.metadata.artist} - ${parsed.modded.metadata.title}`;
    mapInfo.diff = parsed.modded.metadata.diff;
    mapInfo.mapper = parsed.modded.metadata.creator;

    // 更新数值（使用CountUp动画）
    countUpInstances.mapAr.update(parseFloat(parsed.modded.difficulty.ar).toFixed(1));
    countUpInstances.mapCs.update(parseFloat(parsed.modded.difficulty.cs).toFixed(1));
    countUpInstances.mapOd.update(parseFloat(parsed.modded.difficulty.od).toFixed(1));
    countUpInstances.mapHp.update(parseFloat(parsed.modded.difficulty.hp).toFixed(1));
    countUpInstances.mapBpm.update(parsed.modded.beatmap.bpm.mostly);
    countUpInstances.mapStar.update(parseFloat(parsed.modded.difficulty.sr).toFixed(2));
  }
}

async function updateTeamInfo(tourney: any) {
  const leftTeamName = tourney.manager.teamName.left;
  const rightTeamName = tourney.manager.teamName.right;

  if (leftTeamName !== cache.leftTeamName) {
    cache.leftTeamName = leftTeamName;
    teamA.name = leftTeamName;

    try {
      const leftTeam = await bracketManager.getTeamFullInfoByName(leftTeamName);
      teamA.fullName = leftTeam.FullName;
      teamA.avatar = `https://a.ppy.sh/${leftTeam.Acronym}?.jpeg`;
    } catch (error) {
      console.error('获取左队信息失败:', error);
    }
  }

  if (rightTeamName !== cache.rightTeamName) {
    cache.rightTeamName = rightTeamName;
    teamB.name = rightTeamName;

    try {
      const rightTeam = await bracketManager.getTeamFullInfoByName(rightTeamName);
      teamB.fullName = rightTeam.FullName;
      teamB.avatar = `https://a.ppy.sh/${rightTeam.Acronym}?.jpeg`;
    } catch (error) {
      console.error('获取右队信息失败:', error);
    }
  }
}

function updatePickerInfo(bid: number) {
  const operation = getStoredBeatmapById(bid.toString(), mode);

  if (operation !== null && !cache.mapChosen) {
    cache.mapChosen = true;

    bracketManager.getModNameAndIndexById(bid).then(modNameAndIndex => {
      if (operation.type === "Pick") {
        const teamName = operation.team === "left" ? cache.leftTeamName : cache.rightTeamName;
        mapInfo.picker = `${modNameAndIndex.modName}${modNameAndIndex.index} picked by ${teamName}`;
      }
    });
  }
}

function updateChat(newChat: any[]) {
  if (newChat.length !== cache.chatLength) {
    cache.chatLength = newChat.length;
    chat.messages = [...newChat];
  }
}

function updateGameState(newState: number) {
  gameState.value = newState;
}

function updateScores(tourney: any) {
  const leftClients = tourney.ipcClients.filter((client: any) => client.team === 'left');
  const rightClients = tourney.ipcClients.filter((client: any) => client.team === 'right');

  const leftScore = leftClients.reduce((acc: number, client: any) => acc + client.gameplay.score, 0);
  const rightScore = rightClients.reduce((acc: number, client: any) => acc + client.gameplay.score, 0);

  if (leftScore !== cache.leftScore || rightScore !== cache.rightScore) {
    cache.leftScore = leftScore;
    cache.rightScore = rightScore;

    teamA.score = leftScore;
    teamB.score = rightScore;

    // 计算分数条宽度
    const scoreDiff = Math.abs(leftScore - rightScore);
    const X = Math.min(0.4, Math.pow(scoreDiff / 1500000, 0.5) / 2);
    const Y = 2.5 * X;
    const shortBarWidth = 1920 - (1920 - 615) * Y;

    if (leftScore === rightScore) {
      teamA.scoreBarWidth = 1920;
      teamB.scoreBarWidth = 1920;
      teamA.scoreLeadVisible = false;
      teamB.scoreLeadVisible = false;
    } else if (leftScore > rightScore) {
      teamA.scoreBarWidth = 3840 - shortBarWidth;
      teamB.scoreBarWidth = shortBarWidth;
      teamA.scoreLeadVisible = true;
      teamB.scoreLeadVisible = false;
      teamA.scoreLeadValue = scoreDiff;
    } else {
      teamB.scoreBarWidth = 3840 - shortBarWidth;
      teamA.scoreBarWidth = shortBarWidth;
      teamA.scoreLeadVisible = false;
      teamB.scoreLeadVisible = true;
      teamB.scoreLeadValue = scoreDiff;
    }

    // 更新CountUp动画
    countUpInstances.teamAScore.update(leftScore);
    countUpInstances.teamBScore.update(rightScore);
    countUpInstances.teamAScoreLead.update(scoreDiff);
    countUpInstances.teamBScoreLead.update(scoreDiff);
  }
}

function updateStars(tourney: any) {
  const bestOf = tourney.manager.bestOF;
  const leftStar = tourney.manager.stars.left;
  const rightStar = tourney.manager.stars.right;

  if (bestOf !== cache.bestOF) {
    cache.bestOF = bestOf;
    matchSettings.bestOf = bestOf;
  }

  if (leftStar !== cache.leftStar) {
    cache.leftStar = leftStar;
    teamA.star = leftStar;
  }

  if (rightStar !== cache.rightStar) {
    cache.rightStar = rightStar;
    teamB.star = rightStar;
  }
}

// 辅助函数
function handleIpcStateChange(state: number) {
  if (state === cache.state) return;
  cache.state = state;

  switch (state) {
    case 1: // Idle
      toggleChat(true);
      break;
    case 3: // Playing
      toggleChat(false);
      break;
    case 4: // Ranking
      if (cache.stateTimer) clearTimeout(cache.stateTimer);
      cache.stateTimer = setTimeout(() => {
        toggleChat(true);
      }, 10000);
      break;
  }
}

function toggleChat(enable: boolean) {
  chat.visible = enable;
}

function checkTitleScrolling() {
  const titleElement = document.getElementById('map-title');
  const containerElement = document.getElementById('map-title-scrolling-content');

  if (titleElement && containerElement) {
    mapInfo.needsScrolling = titleElement.offsetWidth > containerElement.clientWidth;
  }
}

function scrollChatToBottom() {
  const chatContent = document.getElementById("chat-content");
  if (chatContent) {
    chatContent.scrollTop = chatContent.scrollHeight;
  }
}

function checkObsRecording() {
  // @ts-ignore
  if (window.obsstudio) {
    console.log('OBS Browser Source detected, version:', (window as any).obsstudio.pluginVersion);
    (window as any).obsstudio.getControlLevel((level: number) => {
      if (level < 1) {
        isRecordingAckButtonVisible.value = true;
      } else {
        isRecordingNotificationVisible.value = true;
        (window as any).obsstudio.getStatus((status: any) => {
          isRecordingAckButtonVisible.value = !status.recording;

          window.addEventListener('obsRecordingStarted', () => {
            isRecordingAckButtonVisible.value = false;
          });
          window.addEventListener('obsRecordingStopped', () => {
            isRecordingAckButtonVisible.value = true;
          });
        });
      }
    });
  } else {
    isRecordingAckButtonVisible.value = true;
  }
}

function storeMatchResultIfNeed(tourney: any, bid: number) {
  if (cache.state === 4) {
    const leftClients = tourney.ipcClients.filter((client: any) => client.team === 'left');
    const rightClients = tourney.ipcClients.filter((client: any) => client.team === 'right');

    const scores = {
      left: {
        score: leftClients.reduce((acc: number, client: any) => acc + client.gameplay.score, 0),
        accuracy: leftClients.reduce((acc: number, client: any) => acc + client.gameplay.accuracy, 0),
      },
      right: {
        score: rightClients.reduce((acc: number, client: any) => acc + client.gameplay.score, 0),
        accuracy: rightClients.reduce((acc: number, client: any) => acc + client.gameplay.accuracy, 0),
      },
      beatmapId: bid,
    };

    storeMatchResult(scores, mode);
  }
}

// 事件处理器
function handleRoundButtonClick(buttonId: keyof typeof roundButtons) {
  // 重置所有按钮状态
  Object.keys(roundButtons).forEach(key => {
    roundButtons[key as keyof typeof roundButtons].active = false;
  });

  // 激活选中的按钮
  roundButtons[buttonId].active = true;
  matchSettings.round = roundButtons[buttonId].roundText;

  // 保存到localStorage
  localStorage.setItem('currentMatchRound' + mode, matchSettings.round);
}

function handleChatToggle() {
  toggleChat(!chat.visible);
}

function handleRecordAck() {
  isRecordingNotificationVisible.value = false;
  isRecordingAckButtonVisible.value = false;
}
</script>

<template>
  <div class="container">
    <!-- 背景视频 -->
    <div id="background-video">
      <video autoplay muted loop id="bg-video">
        <source src="../../assets/CL_loop_1_compressed.mp4" type="video/mp4">
        Your browser does not support the video tag.
      </video>
    </div>

    <!-- 比赛标题 -->
    <div id="match-name-container">
      <span id="match-name">CHINA LAN</span>
    </div>

    <!-- 比赛轮次 -->
    <div id="match-round-container">
      <span id="match-round">{{ matchSettings.round }}</span>
    </div>

    <!-- 队伍A -->
    <div id="team-a-container">
      <div id="team-a-name-container">
        <img id="team-a-avatar" :src="teamA.avatar" alt="Team A Avatar">
        <span id="team-a-name">{{ teamA.fullName }}</span>
      </div>

      <div id="team-a-star-container">
        <div
          v-for="(star, index) in teamAStars"
          :key="`team-a-star-${index}`"
          :class="star.class"
        ></div>
      </div>

      <div
        id="team-a-score-bar"
        :style="{ width: teamA.scoreBarWidth + 'px' }"
      >
        <span
          id="team-a-score-lead"
          :style="{ visibility: teamA.scoreLeadVisible ? 'visible' : 'hidden' }"
        >{{ teamA.scoreLeadValue.toLocaleString() }}</span>
      </div>

      <span id="team-a-score">{{ teamA.score.toLocaleString() }}</span>
    </div>

    <!-- 队伍B -->
    <div id="team-b-container">
      <div id="team-b-name-container">
        <img id="team-b-avatar" :src="teamB.avatar" alt="Team B Avatar">
        <span id="team-b-name">{{ teamB.fullName }}</span>
      </div>

      <div id="team-b-star-container">
        <div
          v-for="(star, index) in teamBStars"
          :key="`team-b-star-${index}`"
          :class="star.class"
        ></div>
      </div>

      <div
        id="team-b-score-bar"
        :style="{ width: teamB.scoreBarWidth + 'px' }"
      >
        <span
          id="team-b-score-lead"
          :style="{ visibility: teamB.scoreLeadVisible ? 'visible' : 'hidden' }"
        >{{ teamB.scoreLeadValue.toLocaleString() }}</span>
      </div>

      <span id="team-b-score">{{ teamB.score.toLocaleString() }}</span>
    </div>

    <!-- 聊天框 -->
    <div id="chat" :style="{ opacity: chat.visible ? 1 : 0 }">
      <div id="chat-content" v-html="chatMessagesHtml"></div>
    </div>

    <!-- 弹幕 -->
    <div id="danmaku">
      <!-- 弹幕iframe可以在这里添加 -->
    </div>

    <!-- 地图信息 -->
    <div id="map-info-container">
      <img id="map-cover" :src="mapInfo.cover" alt="Map Cover">

      <div id="map-picker-container">
        <span id="map-picker">{{ mapInfo.picker }}</span>
      </div>

      <div id="map-title-scroll-container" class="scroll-container">
        <div id="map-title-scrolling-content">
          <osu-parser
            id="map-title"
            :class="{ 'map-title': true, 'marquee': mapInfo.needsScrolling }"
          >{{ mapInfo.title }}</osu-parser>
        </div>
      </div>

      <span id="map-diff">{{ mapInfo.diff }}</span>
      <span id="map-mapper-label">mapped by </span>
      <span id="map-mapper">{{ mapInfo.mapper }}</span>

      <div id="map-data-container">
        <span class="map-data-label">BPM&nbsp;</span>
        <span id="map-bpm" class="map-data-text"></span>

        <span class="map-data-label">LENGTH&nbsp;</span>
        <span id="map-length-minutes" class="map-data-text"></span>
        <span class="map-data-text">:</span>
        <span id="map-length-seconds" class="map-data-text"></span>

        <br>
        <span class="map-data-label">CS&nbsp;</span>
        <span id="map-cs" class="map-data-text"></span>
        <span class="map-data-label">AR&nbsp;</span>
        <span id="map-ar" class="map-data-text"></span>
        <span class="map-data-label">OD&nbsp;</span>
        <span id="map-od" class="map-data-text"></span>
        <span class="map-data-label">SR&nbsp;</span>
        <span id="map-star" class="map-data-text"></span>
      </div>
    </div>

    <!-- 控制面板 -->
    <div class="control-panel">
      <span class="panel-title">Control Panel</span>
      <div class="panel-buttons">
        <div class="round-control">
          <div class="panel-label"><span>Pick Match Round</span></div>
          <div class="round-control-buttons">
            <button
              v-for="(button, buttonId) in roundButtons"
              :key="buttonId"
              :class="button.active ? 'button-active' : 'button-inactive'"
              @click="handleRoundButtonClick(buttonId as keyof typeof roundButtons)"
            >
              {{ button.text }}
            </button>
          </div>
        </div>

        <div class="chat-control" style="position: absolute; left: 500px; top: 75px; width: 100px;">
          <div class="round-control-buttons">
            <button
              id="button-chat-toggle"
              class="button-active"
              @click="handleChatToggle"
            >
              Toggle Chat
            </button>
          </div>
        </div>

        <div class="chat-control" style="position: absolute; left: 650px; top: 40px; width: 500px;">
          <h1
            v-show="isRecordingNotificationVisible"
            style="color: white"
            id="notify-record"
          >
            DO NOT FORGET START RECORDING!
          </h1>
          <button
            v-show="isRecordingAckButtonVisible"
            id="button-record-ack"
            class="button-active"
            @click="handleRecordAck"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@font-face {
  font-family: "HYXingHeJianDui";
  src: url('../../assets/fonts/HYXingHeJianDui-105U-2.ttf');
}

@font-face {
  font-family: "YEFONTYSH";
  src: url('../../assets/fonts/YeZiGongChangYunShiHei-2.ttf');
}

@font-face {
  font-family: "AkiraExpanded";
  src: url('../../assets/fonts/AkiraExpanded.otf');
}

@font-face {
  font-family: 'MontserratBlack';
  src: url('../../assets/fonts/Montserrat-Black.ttf') format('opentype');
}

@font-face {
  font-family: 'MontserratBlackItalic';
  src: url('../../assets/fonts/Montserrat-BlackItalic.ttf') format('opentype');
}

@font-face {
  font-family: 'DouyinSansBold.ttf';
  src: url('../../assets/fonts/DouyinSansBold.ttf') format('opentype');
}

body {
  margin: 0;
  padding: 0;
}

.container {
  position: absolute;
  width: 3840px;
  height: calc(2160px + 250px);
}

#match-name-container {
  position: absolute;
  top: 38px;
  width: 3840px;
  height: 140px;
  display: flex;
  justify-content: center;
}

#match-name {
  font-family: "MontserratBlackItalic", sans-serif;
  color: #1D1D1D;
  font-size: 200px;
  filter: drop-shadow(4.93px 6.30px 0px rgba(0, 0, 0, 0.14));
  line-height: 140px;
}

#match-round-container {
  position: absolute;
  top: 196px;
  width: 3840px;
  height: 108px;
  display: flex;
  justify-content: center;
}

#match-round {
  font-family: "MontserratBlackItalic", sans-serif;
  color: #1D1D1D;
  font-size: 108px;
  filter: drop-shadow(4.93px 6.30px 0px rgba(0, 0, 0, 0.14));
  line-height: 108px;
}

#team-a-container {
  position: absolute;
  height: 230px;
  width: 1920px;
}

#team-a-name-container {
  position: absolute;
  height: 135px;
}

#team-a-avatar {
  position: absolute;
  width: 188px;
  height: 188px;
  top: 36px;
  left: 36px;
  object-fit: contain;
  border: solid 7px #AF3232;
}

#team-a-name {
  font-family: "AkiraExpanded", sans-serif;
  font-size: 83px;
  position: absolute;
  left: 263px;
  top: 158px;
  color: #AF3232;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#team-a-star-container {
  position: absolute;
  left: 262px;
  top: 36px;
  display: flex;
  gap: 22px;
}

.team-a-star {
  width: 108px;
  height: 108px;
  background-color: #AF3232;
}

.team-a-star-slot {
  width: 108px;
  height: 108px;
  border: solid 10px #AF3232;
  box-sizing: border-box;
}

#team-a-score-bar {
  position: absolute;
  top: 1755px;
  height: 62px;
  background-color: #AF3232;
  transition: width 0.5s;
}

#team-a-score {
  position: absolute;
  left: 32px;
  top: 1755px;
  font-size: 50px;
  color: #ffffff;
  font-family: 'YEFONTYSH', sans-serif;
}

#team-a-score-lead {
  position: absolute;
  right: 20px;
  text-align: left;
  font-size: 31px;
  color: #ffffff;
  font-family: 'YEFONTYSH', sans-serif;
  transform: translateY(-50%);
  top: 50%;
}

#team-b-score-lead {
  position: absolute;
  left: 20px;
  text-align: right;
  font-size: 31px;
  color: #ffffff;
  font-family: 'YEFONTYSH', sans-serif;
  transform: translateY(-50%);
  top: 50%;
}

#team-b-container {
  position: absolute;
  height: 230px;
  width: 1920px;
  right: 0;
}

#team-b-name-container {
  position: absolute;
  right: 0;
  height: 135px;
}

#team-b-star-container {
  position: absolute;
  right: 262px;
  top: 36px;
  display: flex;
  gap: 22px;
}

.team-b-star {
  width: 108px;
  height: 108px;
  background-color: #1D1D1D;
}

.team-b-star-slot {
  width: 108px;
  height: 108px;
  border: solid 10px #1D1D1D;
  box-sizing: border-box;
}

#team-b-avatar {
  position: absolute;
  right: 36px;
  top: 36px;
  width: 188px;
  height: 188px;
  object-fit: contain;
  border: solid 7px #1D1D1D;
}

#team-b-name {
  font-family: "AkiraExpanded", sans-serif;
  font-size: 83px;
  position: absolute;
  right: 263px;
  top: 158px;
  color: #1D1D1D;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#team-b-score-bar {
  position: absolute;
  top: 1755px;
  right: 0;
  height: 62px;
  background-color: #1D1D1D;
  transition: width 0.5s;
}

#team-b-score {
  position: absolute;
  right: 32px;
  top: 1755px;
  text-align: right;
  font-size: 50px;
  color: #ffffff;
  font-family: 'YEFONTYSH', sans-serif;
}

@keyframes wordsLoop {
  0% {
    transform: translateX(100%);
  }
  100% {
    transform: translateX(-100%);
  }
}

/* 聊天框的渐变 */
#chat {
  position: absolute;
  width: 825px;
  height: 255px;
  top: 1905px;
  left: 2400px;
  transition: opacity 0.5s ease;
}

#danmaku {
  position: absolute;
  width: 825px;
  height: 255px;
  top: 1905px;
  left: 2400px;
  overflow: hidden;
}

#danmaku-iframe {
  transform: scale(2, 2);
  width: 50%;
  height: 50%;
  transform-origin: left top;
  border: none;
}

#chat-content {
  position: absolute;
  width: 820px;
  height: 255px;
  z-index: 4;
  overflow-y: auto;
  box-sizing: border-box;
}

/* 滚动槽 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.06);
  -webkit-box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.08);
}

/* 滚动条滑块 */
::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.12);
  -webkit-box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.2);
}

#chat-content osu-parser {
  font-family: YEFONTYSH, sans-serif;
  font-size: 33px;
  margin: 0px;
  color: #1D1D1D;
  white-space: normal;
  overflow-wrap: break-word;
}

.time {
  color: #1D1D1D;
}

.player-a-name-chat {
  color: #ea5455;
}

.unknown-chat {
  color: #AFAFAF;
}

.player-b-name-chat {
  color: #32afaf;
}

#map-info-container {
  position: absolute;
  top: 1817px;
  width: 3840px;
  height: 343px;
}

#map-picker-container {
  position: absolute;
  top: 281px;
  left: 615px;
  width: 825px;
  height: 62px;
  display: flex;
  justify-content: center;
  align-items: center;
}

#map-picker {
  font-family: MontserratBlack, sans-serif;
  font-size: 38px;
  color: #ffffff;
}

#map-cover {
  position: absolute;
  width: 825px;
  left: 615px;
  top: -62px;
  height: 405px;
  z-index: -1;
  object-fit: cover;
  overflow: hidden;
}

#map-diff {
  position: absolute;
  width: 940px;
  font-family: MontserratBlack, sans-serif;
  font-size: 50px;
  color: #1D1D1D;
  left: 1460px;
  top: 88px;
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 1;
}

#map-mapper-label {
  position: absolute;
  width: 310px;
  font-family: MontserratBlack, sans-serif;
  font-size: 50px;
  color: #1D1D1D;
  left: 1460px;
  top: 142px;
  white-space: nowrap;
  line-height: 1;
}

#map-mapper {
  position: absolute;
  width: 622px;
  font-family: MontserratBlack, sans-serif;
  font-size: 50px;
  color: #AF3232;
  left: 1778px;
  top: 142px;
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 1;
}

#map-title-scroll-container {
  width: 1764px;
  left: 1460px;
  top: 13px;
  height: 92px;
  position: absolute;
  overflow: hidden;
}

.marquee {
  animation: scrollText 20s linear infinite;
  padding-left: 100%;
}

.map-title {
  overflow: hidden;
  white-space: nowrap;
  color: #1D1D1D;
  font-family: MontserratBlack, sans-serif;
  font-size: 75px;
  width: max-content;
  box-sizing: content-box;
  margin: 0;
  animation-delay: -10s;
  line-height: 1;
}

@keyframes scrollText {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-100%);
  }
}

#map-data-container {
  position: absolute;
  top: 239px;
  left: 1460px;
  width: 832px;
}

.map-data-text {
  color: #AF3232;
  font-size: 50px;
  font-family: MontserratBlack, sans-serif;
  padding-right: 10px;
  line-height: 1;
}

.map-data-label {
  color: #1D1D1D;
  font-size: 50px;
  font-family: MontserratBlack, sans-serif;
  line-height: 1;
}

.control-panel {
  background: #363636;
  width: 3840px;
  height: 250px;
  position: absolute;
  top: 2160px;
}

.panel-title {
  font-family: 'TorusNotched-Regular', sans-serif;
  font-size: 30px;
  color: #FFFFFF;
  position: absolute;
  top: 3px;
  left: 10px;
}

.panel-buttons {
  position: relative;
}

.panel-label {
  font-family: 'TorusNotched-Regular', sans-serif;
  font-size: 25px;
  color: #FFFFFF;
}

.button-inactive {
  background-color: #1d536e;
  border-radius: 8px;
  width: 100px;
  height: 48px;
  font-family: 'TorusNotched-Regular', sans-serif;
  font-size: 20px;
  color: #808080;
  border: none;
  cursor: pointer;
}

.button-active {
  background-color: #44aadd;
  border-radius: 8px;
  width: 100px;
  height: 48px;
  font-family: 'TorusNotched-Regular', sans-serif;
  font-size: 20px;
  color: #FFFFFF;
  border: none;
  cursor: pointer;
}

.button-active:hover {
  background-color: #64cafd;
}

.button-inactive:hover {
  background-color: #2b617c;
}

.round-control {
  position: absolute;
  width: 480px;
  top: 40px;
}

.round-control-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20px;
}

#background-video {
  z-index: -100;
  position: fixed;
  width: 3840px;
  height: 2160px;
}

#bg-video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: -1;
}
</style>
