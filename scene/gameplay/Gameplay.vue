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

// 计算属性：根据游戏模式获取对应的弹幕地址
const danmakuSrc = computed(() => {
  switch (mode) {
    case 'taiko':
      return import.meta.env.VITE_DANMAKU_SRC_TAIKO || '';
    case 'ctb':
      return import.meta.env.VITE_DANMAKU_SRC_CTB || '';
    case 'mania':
      return import.meta.env.VITE_DANMAKU_SRC_MANIA || '';
    default:
      return import.meta.env.VITE_DANMAKU_SRC_STD || '';
  }
});

// 响应式状态定义
const gameState = ref(0); // IPC状态
const isRecordingNotificationVisible = ref(false);
const isRecordingAckButtonVisible = ref(false);
const matchName = ref(import.meta.env.VITE_MATCH_NAME || '');

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

// 谱面信息
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
//TODO 读取Bracket
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

    return`<p>
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

// 背景视频配置
const isBackgroundVideoEnabled = import.meta.env.VITE_BACKGROUND_VIDEO_ENABLED;
const backgroundVideoPath = import.meta.env.VITE_BACKGROUND_VIDEO_PATH;

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
    teamBScoreLead: new CountUp('team-b-score-lead', 0, {duration: 0.5, useGrouping: true}),
    mapLengthMinutes: new CountUp('map-length-minutes', 0, {
      duration: 0.5,
      formattingFn: (x: number) => x.toString().padStart(2, "0"),
    }),
    mapLengthSeconds: new CountUp('map-length-seconds', 0, {
      duration: 0.5,
      formattingFn: (x: number) => x.toString().padStart(2, "0"),
    }),
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

    // 更新谱面信息
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
    countUpInstances.mapLengthMinutes.update(Math.trunc(parsed.modded.beatmap.length / 60000));
    countUpInstances.mapLengthSeconds.update(Math.trunc(parsed.modded.beatmap.length % 60000 / 1000));
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
    // 抄袭Lazer，随scoreDiff从0增大到100w，X从0先陡再缓慢增大到0.4
    const X = Math.min(0.4, Math.pow(scoreDiff / 1500000, 0.5) / 2);
    const Y = 2.5 * X;
    const shortBarWidth = 1920 - (1920 - 615) * Y;

    if (leftScore === rightScore) {
      teamA.scoreBarWidth = teamB.scoreBarWidth = 1920;
      teamA.scoreLeadVisible = teamB.scoreLeadVisible = false;
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
  if (!window.obsstudio) {
    console.log('OBS Browser Source not detected');
    return;
  }

  console.log('OBS Browser Source detected, version:', (window as any).obsstudio.pluginVersion);
  (window as any).obsstudio.getControlLevel((level: number) => {
    console.log(`OBS browser control level: ${level}`);

    if (level < 1) {
      console.log('READ_OBS not available');
      return;
    }

    (window as any).obsstudio.getStatus((status: any) => {
      isRecordingAckButtonVisible.value = !status.recording;
      isRecordingNotificationVisible.value = !status.recording;

      window.addEventListener('obsRecordingStarted', () => {
        isRecordingAckButtonVisible.value = false;
        isRecordingNotificationVisible.value = false;
      });
      window.addEventListener('obsRecordingStopped', () => {
        isRecordingAckButtonVisible.value = true;
        isRecordingNotificationVisible.value = true;
      });
    });

  });

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
    <div v-if="isBackgroundVideoEnabled" id="background-video">
      <video autoplay muted loop id="bg-video">
        <source :src="backgroundVideoPath" type="video/mp4">
        Your browser does not support the video tag.
      </video>
    </div>

    <!-- 比赛标题 -->
    <div id="match-name-container">
      <span id="match-name">{{ matchName }}</span>
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
      <iframe id="danmaku-iframe"
              allowTransparency="true"
              :src="danmakuSrc"
      ></iframe>
    </div>

    <!-- 谱面信息 -->
    <div id="map-info-container">
      <img id="map-cover" :src="mapInfo.cover" alt="Map Cover">

      <div id="map-picker-container">
        <span id="map-picker">{{ mapInfo.picker }}</span>
      </div>

      <div id="map-title-scroll-container" class="scroll-container">
        <div id="map-title-scrolling-content">
          <p
            id="map-title"
            :class="{ 'map-title': true, 'marquee': mapInfo.needsScrolling }"
          >{{ mapInfo.title }}
          </p>
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
<style>
/* 字体声明 */
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

/* CSS变量 */
:root {
  --team-a-color: #AF3232;
  --team-b-color: #1D1D1D;
  --base-text-color: #1D1D1D;
  --background-color: #363636;
  --white-color: #FFFFFF;
  --light-gray: #AFAFAF;
  --team-a-light: #ea5455;
  --team-b-light: #32afaf;
  --control-panel-bg: #363636;
  --button-inactive-bg: #1d536e;
  --button-active-bg: #44aadd;
  --button-active-hover: #64cafd;
  --button-inactive-hover: #2b617c;
  --button-text-inactive: #808080;
  --button-text-active: #FFFFFF;
  --scrollbar-track: rgba(0, 0, 0, 0.06);
  --scrollbar-thumb: rgba(0, 0, 0, 0.12);
}

/* 基础样式 */
body {
  margin: 0;
  padding: 0;
}

.container {
  position: absolute;
  width: 3840px;
  height: calc(2160px + 250px);
}

/* 比赛信息区域 */
#match-name-container,
#match-round-container {
  position: absolute;
  width: 3840px;
  display: flex;
  justify-content: center;
}

#match-name-container {
  top: 38px;
  height: 140px;
}

#match-round-container {
  top: 196px;
  height: 108px;
}

#match-name {
  font-family: "MontserratBlackItalic", sans-serif;
  color: var(--base-text-color);
  font-size: 200px;
  filter: drop-shadow(4.93px 6.30px 0px rgba(0, 0, 0, 0.14));
  line-height: 140px;
}

#match-round {
  font-family: "MontserratBlackItalic", sans-serif;
  color: var(--base-text-color);
  font-size: 108px;
  filter: drop-shadow(4.93px 6.30px 0px rgba(0, 0, 0, 0.14));
  line-height: 108px;
}

/* 队伍容器通用样式 */
#team-a-container,
#team-b-container {
  position: absolute;
  height: 230px;
  width: 1920px;
}

#team-b-container {
  right: 0;
}

#team-a-name-container,
#team-b-name-container {
  position: absolute;
  height: 135px;
}

#team-b-name-container {
  right: 0;
}

/* 队伍头像样式 */
#team-a-avatar,
#team-b-avatar {
  position: absolute;
  width: 188px;
  height: 188px;
  top: 36px;
  object-fit: contain;
  border-width: 7px;
  border-style: solid;
}

#team-a-avatar {
  left: 36px;
  border-color: var(--team-a-color);
}

#team-b-avatar {
  right: 36px;
  border-color: var(--team-b-color);
}

/* 队伍名称样式 */
#team-a-name,
#team-b-name {
  font-family: "AkiraExpanded", sans-serif;
  font-size: 83px;
  position: absolute;
  top: 158px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#team-a-name {
  left: 263px;
  color: var(--team-a-color);
}

#team-b-name {
  right: 263px;
  color: var(--team-b-color);
  text-align: right;
}

/* 比分容器样式 */
#team-a-star-container,
#team-b-star-container {
  position: absolute;
  top: 36px;
  display: flex;
  gap: 22px;
}

#team-a-star-container {
  left: 262px;
}

#team-b-star-container {
  right: 262px;
}

/* 比分样式 */
.team-a-star,
.team-b-star {
  width: 108px;
  height: 108px;
}

.team-a-star {
  background-color: var(--team-a-color);
}

.team-b-star {
  background-color: var(--team-b-color);
}

.team-a-star-slot,
.team-b-star-slot {
  width: 108px;
  height: 108px;
  border-width: 10px;
  border-style: solid;
  box-sizing: border-box;
}

.team-a-star-slot {
  border-color: var(--team-a-color);
}

.team-b-star-slot {
  border-color: var(--team-b-color);
}

/* 分数条样式 */
#team-a-score-bar,
#team-b-score-bar {
  position: absolute;
  top: 1755px;
  height: 62px;
  transition: width 0.5s;
}

#team-a-score-bar {
  background-color: var(--team-a-color);
}

#team-b-score-bar {
  right: 0;
  background-color: var(--team-b-color);
}

/* 分数文字样式 */
#team-a-score,
#team-b-score {
  position: absolute;
  top: 1755px;
  font-size: 50px;
  color: var(--white-color);
  font-family: 'YEFONTYSH', sans-serif;
}

#team-a-score {
  left: 32px;
}

#team-b-score {
  right: 32px;
  text-align: right;
}

/* 领先分数显示 */
#team-a-score-lead,
#team-b-score-lead {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 31px;
  color: var(--white-color);
  font-family: 'YEFONTYSH', sans-serif;
}

#team-a-score-lead {
  right: 20px;
  text-align: left;
}

#team-b-score-lead {
  left: 20px;
  text-align: right;
}

/* 聊天和弹幕区域 */
#chat,
#danmaku {
  position: absolute;
  width: 825px;
  top: 1905px;
  left: 2400px;
}

#chat {
  height: 253px;
  transition: opacity 0.5s ease;
}

#danmaku {
  height: 253px;
  overflow: hidden;
}

#danmaku-iframe {
  transform: scale(2);
  transform-origin: left top;
  width: 50%;
  height: 50%;
  border: none;
}

#chat-content {
  position: absolute;
  width: 820px;
  height: 253px;
  z-index: 4;
  overflow-y: auto;
  box-sizing: border-box;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  border-radius: 3px;
  background: var(--scrollbar-track);
  -webkit-box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.08);
}

::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: var(--scrollbar-thumb);
  -webkit-box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.2);
}

/* 聊天内容样式 */
#chat-content p {
  font-family: YEFONTYSH, sans-serif;
  font-size: 33px;
  margin: 0;
  color: var(--base-text-color);
  white-space: normal;
  overflow-wrap: break-word;
}

/* 聊天样式类 */
.time {
  color: var(--base-text-color);
}

.player-a-name-chat {
  color: var(--team-a-light);
}

.unknown-chat {
  color: var(--light-gray);
}

.player-b-name-chat {
  color: var(--team-b-light);
}

/* 谱面信息区域 */
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
  color: var(--white-color);
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

/* 谱面详细信息 */
#map-diff,
#map-mapper-label,
#map-mapper {
  position: absolute;
  font-family: MontserratBlack, sans-serif;
  font-size: 50px;
  left: 1460px;
  white-space: nowrap;
  line-height: 1;
}

#map-diff {
  width: 940px;
  color: var(--base-text-color);
  top: 88px;
  text-overflow: ellipsis;
}

#map-mapper-label {
  width: 310px;
  color: var(--base-text-color);
  top: 142px;
}

#map-mapper {
  width: 622px;
  color: var(--team-a-color);
  left: 1778px;
  top: 142px;
  text-overflow: ellipsis;
}

/* 谱面标题滚动 */
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
  color: var(--base-text-color);
  font-family: MontserratBlack, sans-serif;
  font-size: 75px;
  width: max-content;
  box-sizing: content-box;
  margin: 0;
  animation-delay: -10s;
  line-height: 1;
}

/* 谱面数据容器 */
#map-data-container {
  position: absolute;
  top: 239px;
  left: 1460px;
  width: 832px;
}

.map-data-text,
.map-data-label {
  font-size: 50px;
  font-family: MontserratBlack, sans-serif;
  line-height: 1;
}

.map-data-text {
  color: var(--team-a-color);
  padding-right: 10px;
}

.map-data-label {
  color: var(--base-text-color);
}

/* 控制面板 */
.control-panel {
  background: var(--control-panel-bg);
  width: 3840px;
  height: 250px;
  position: absolute;
  top: 2160px;
}

.panel-title {
  font-family: 'TorusNotched-Regular', sans-serif;
  font-size: 30px;
  color: var(--white-color);
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
  color: var(--white-color);
}

/* 按钮样式 */
.button-inactive,
.button-active {
  border-radius: 8px;
  width: 100px;
  height: 48px;
  font-family: 'TorusNotched-Regular', sans-serif;
  font-size: 20px;
  border: none;
  cursor: pointer;
}

.button-inactive {
  background-color: var(--button-inactive-bg);
  color: var(--button-text-inactive);
}

.button-active {
  background-color: var(--button-active-bg);
  color: var(--button-text-active);
}

.button-active:hover {
  background-color: var(--button-active-hover);
}

.button-inactive:hover {
  background-color: var(--button-inactive-hover);
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

/* 背景视频 */
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


@keyframes scrollText {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-100%);
  }
}
</style>
