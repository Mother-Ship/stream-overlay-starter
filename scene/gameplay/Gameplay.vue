<script setup lang="ts">
// // connecting to websocket
import WebSocketManager from '../../lib/websocket-manager.js';

import {
  BracketDataManager
} from "../../util/bracket-data-manager.ts";
import {
  getStoredBeatmapById,
  storeMatchResult
} from "../../util/localstorage-op.js";
import {CountUp} from '../../lib/count-up.min.js';
import OsuParser from '../../util/osu-parser.ts';
import MapMockManager from '../../util/map-mock-manager.ts';
import {__wbg_init} from '../../lib/rosu-pp/rosu-pp.js';
import {ref, reactive, onMounted, watch, computed} from 'vue';

// 如果为true，则使用mock_playing代替tosu传回的数据，但tosu和osu(可以不是比赛端)仍然需要运行，因为需要访问.osu和背景图片
const isDebug = false;

//从URL query获取mode参数
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode') || 'std';

await __wbg_init('../../lib/rosu-pp/rosu_pp_bg.wasm');
const p = new OsuParser();

const mock = new MapMockManager(mode);
await mock.init();

const socket = new WebSocketManager('127.0.0.1:24050');



const teamAScore = new CountUp('team-a-score', 0, {duration: 0.5, useGrouping: true});
const teamBScore = new CountUp('team-b-score', 0, {duration: 0.5, useGrouping: true});
const mapAr = new CountUp('map-ar', 0, {
    duration: 0.5,
    decimalPlaces: 1
  }),
  mapOd = new CountUp('map-od', 0, {
    duration: 0.5,
    decimalPlaces: 1
  }),
  mapCs = new CountUp('map-cs', 0, {
    duration: 0.5,
    decimalPlaces: 1
  }),
  mapHp = new CountUp('map-hp', 0, {
    duration: 0.5,
    decimalPlaces: 1
  }),
  mapBpm = new CountUp('map-bpm', 0, {
    duration: 0.5,
  }),
  mapStar = new CountUp('map-star', 0, {
    duration: 0.5,
    decimalPlaces: 2,
    suffix: '*',
  }),
  mapLengthMinutes = new CountUp('map-length-minutes', 0, {
    duration: 0.5,
    formattingFn: x => x.toString().padStart(2, "0"),
  }),
  mapLengthSeconds = new CountUp('map-length-seconds', 0, {
    duration: 0.5,
    formattingFn: x => x.toString().padStart(2, "0"),
  }),
  teamAScoreLead = new CountUp('team-a-score-lead', 0, {duration: 0.5, useGrouping: true}),
  teamBScoreLead = new CountUp('team-b-score-lead', 0, {duration: 0.5, useGrouping: true});


const cache = {
  state: 0,
  stateTimer: null,

  leftTeamName: "",
  rightTeamName: "",

  leftScore: 0,
  rightScore: 0,

  bestOF: 0,

  leftStar: 0,
  rightStar: 0,

  chat: [],
  md5: "",
  mapChoosed: false,
};
// 响应式状态
const teamAScoreValue = ref(0);
const teamBScoreValue = ref(0);
const mapArValue = ref(0);
const mapOdValue = ref(0);
const mapCsValue = ref(0);
const mapHpValue = ref(0);
const mapBpmValue = ref(0);
const mapStarValue = ref(0);
const mapLengthMinutesValue = ref(0);
const mapLengthSecondsValue = ref(0);
const teamAScoreLeadValue = ref(0);
const teamBScoreLeadValue = ref(0);

// 团队信息
const teamA = reactive({
  name: "",
  avatar: "",
  score: 0,
  star: 0,
  scoreBarWidth: 1920,
  scoreLeadVisible: false
});

const teamB = reactive({
  name: "",
  avatar: "",
  score: 0,
  star: 0,
  scoreBarWidth: 1920,
  scoreLeadVisible: false
});

// 地图信息
const mapInfo = reactive({
  title: "",
  diff: "",
  mapper: "",
  cover: "",
  ar: 0,
  od: 0,
  cs: 0,
  hp: 0,
  bpm: 0,
  star: 0,
  lengthMinutes: 0,
  lengthSeconds: 0,
  picker: ""
});

// 控制面板状态
const matchRound = ref("");
const isChatVisible = ref(false);
const isRecordingNotificationVisible = ref(false);
const isRecordingAckButtonVisible = ref(false);

function initPage() {
  document.addEventListener('selectstart', function (e) {
    e.preventDefault();
  })

  let currentMatchRound = localStorage.getItem('currentMatchRound' + mode);
  if (currentMatchRound !== null) {
    matchRound.value = currentMatchRound;
  }

  // obs-browser feature checks
  if (window.obsstudio) {
    console.log('OBS Browser Source detected, version:', window.obsstudio.pluginVersion);
    console.log('Feature checks..');
    window.obsstudio.getControlLevel(function (level) {
      console.log(`OBS browser control level: ${level}`);

      if (level < 1) {
        // READ_OBS not available
        console.log('READ_OBS not available');
        isRecordingAckButtonVisible.value = true;
      } else {
        // We can read status, so show notification only when not recording
        isRecordingNotificationVisible.value = true;
        window.obsstudio.getStatus(function (status) {
          if (status.recording) {
            isRecordingAckButtonVisible.value = false;
          }

          window.addEventListener('obsRecordingStarted', () => {
            isRecordingAckButtonVisible.value = false;
          });
          window.addEventListener('obsRecordingStopped', () => {
            isRecordingAckButtonVisible.value = true;
          });
        })
      }
    });
  } else {
    console.log('Not OBS Browser or OBS control features not supported');
    isRecordingAckButtonVisible.value = true;
  }
}

onMounted(() => {
  initPage();
});


function handleIpcStateChange(state) {
  // tosu IPC states:
// 1: Idle
// 2: ?
// 3: Playing
// 4: Ranking
  if (state === cache.state) return;
  cache.state = state;
  switch (state) {
    case 1:
      // Enter idle state, show chat
      toggleChat(true);
      break;
    case 3:
      // Enter playing state, hide chat
      toggleChat(false);
      break;
    case 4:
      // Enter ranking state, show chat after 10s, similar to how Lazer works
      if (cache.stateTimer) clearTimeout(cache.stateTimer);
      cache.stateTimer = setTimeout(() => {
        toggleChat(true);
      }, 10000);
      break;
  }
}

function toggleChat(enable) {
  isChatVisible.value = enable;
}



document.getElementById('button-chat-toggle').addEventListener('click', () => {
  toggleChat(!document.getElementById('chat').style.opacity || document.getElementById('chat').style.opacity === "0");
});

document.getElementById('button-record-ack').addEventListener('click', () => {
  document.getElementById('notify-record').style.display = 'none';
  document.getElementById('button-record-ack').style.display = 'none';
})

// 添加标题滚动检测函数
function setupTitleScrolling() {
  document.getElementById('map-title').classList.remove('marquee');

  // 如果#map-title的宽度超过#map-title-scroll-container的宽度
  if (document.getElementById('map-title').offsetWidth >
    document.getElementById('map-title-scrolling-content').clientWidth) {
    document.getElementById('map-title').classList.add('marquee');
    console.log('start scroll')
  }
}

function storeMatchResultIfNeed(tourney, bid) {
  if (cache.state === 4) {

    const leftClients = tourney.ipcClients.filter(client => client.team === 'left');
    const rightClients = tourney.ipcClients.filter(client => client.team === 'right');

    const scores = {
      left: {
        score: (leftClients.map(client => client.gameplay.score)).reduce((acc, score) => acc + score, 0),
        accuracy: (leftClients.map(client => client.gameplay.accuracy)).reduce((acc, accuracy) => acc + accuracy, 0),
      },
      right: {
        score: (rightClients.map(client => client.gameplay.score)).reduce((acc, score) => acc + score, 0),
        accuracy: (rightClients.map(client => client.gameplay.accuracy)).reduce((acc, accuracy) => acc + accuracy, 0),
      },
      beatmapId: bid,
    }

    storeMatchResult(scores, mode);
  }
}

async function handleWebSocket(menu, tourney) {
  try {
    // 歌曲信息
    var md5 = menu.bm.md5;
    if (md5 !== cache.md5) {
      mapInfo.cover = "http://localhost:24050/Songs/" + encodeURIComponent(menu.bm.path.folder) + "/" + encodeURIComponent(menu.bm.path.bg);
      cache.md5 = md5;

      cache.mapChoosed = false;
      mapInfo.picker = "";

      let parsed = await p.parse(`http://${location.host}/Songs/${encodeURIComponent(menu.bm.path.folder)}/${encodeURIComponent(menu.bm.path.file)}`);

      let modNameAndIndex = await getModNameAndIndexById(parsed.metadata.bid, mode);
      parsed.mod = modNameAndIndex.modName;
      parsed.index = modNameAndIndex.index;

      let mods = getModEnumFromModString(parsed.mod);
      parsed.modded = p.getModded(parsed, mods);

      mapInfo.title = parsed.modded.metadata.artist + " - " + parsed.modded.metadata.title;


      setupTitleScrolling();

      mapInfo.diff = parsed.modded.metadata.diff;
      mapInfo.mapper = parsed.modded.metadata.creator;

      mapAr.update(parseFloat(parsed.modded.difficulty.ar).toFixed(1));
      mapCs.update(parseFloat(parsed.modded.difficulty.cs).toFixed(1));
      mapOd.update(parseFloat(parsed.modded.difficulty.od).toFixed(1));
      mapHp.update(parseFloat(parsed.modded.difficulty.hp).toFixed(1));

      mapLengthMinutes.update(Math.trunc(parsed.modded.beatmap.length / 60000));
      mapLengthSeconds.update(Math.trunc(parsed.modded.beatmap.length % 60000 / 1000));

      mapBpm.update(parsed.modded.beatmap.bpm.mostly);
      mapStar.update(parsed.modded.difficulty.sr.toFixed(2));
    }


    // 双边队名 旗帜
    const leftTeamName = tourney.manager.teamName.left;
    if (leftTeamName !== cache.leftTeamName) {
      cache.leftTeamName = leftTeamName;
      getTeamFullInfoByName(leftTeamName, mode).then(
        (leftTeam) => {
          // 设置队伍头像、名称
          document.getElementById("team-a-name").innerText = leftTeam.FullName;
          setLeftTeamAvatar(leftTeam.Acronym);
        }
      )
    }
    const rightTeamName = tourney.manager.teamName.right;
    if (rightTeamName !== cache.rightTeamName) {
      cache.rightTeamName = rightTeamName;
      getTeamFullInfoByName(rightTeamName, mode).then(
        (rightTeam) => {
          document.getElementById("team-b-name").innerText = rightTeam.FullName;
          setRightTeamAvatar(rightTeam.Acronym);
        }
      )
    }

    // 选图信息
    var bid = menu.bm.id;


    let operation = getStoredBeatmapById(bid.toString(), mode);

    if (operation !== null) {
      cache.mapChoosed = true;
      let modNameAndIndex = await getModNameAndIndexById(bid, mode);

      if (operation.type === "Pick") {
        if (operation.team === "left") {
          mapInfo.picker = modNameAndIndex.modName + String(modNameAndIndex.index) + " picked by " + cache.leftTeamName;

        }
        if (operation.team === "right") {
          mapInfo.picker = modNameAndIndex.modName + String(modNameAndIndex.index) + " picked by " + cache.rightTeamName;
        }
      }


      // 聊天
      const chat = tourney.manager.chat;
      if (chat.length !== cache.chat.length) {
        cache.chat = chat;
        const chatHtml = chat.map(item => {
          switch (item.team) {
            case 'left':
              return `<p><span class="time chat-item">${item.time}&nbsp;</span> <span class="player-a-name-chat chat-item">${item.name}:&nbsp;</span><span class="chat-item">${item.messageBody}</span></p>`
            case 'right':
              return `<p><span class="time chat-item">${item.time}&nbsp;</span> <span class="player-b-name-chat chat-item">${item.name}:&nbsp;</span><span class="chat-item">${item.messageBody}</span></p>`
            case 'bot':
            case 'unknown':
              return `<p><span class="time chat-item">${item.time}&nbsp;</span> <span class="unknown-chat chat-item">${item.name}:&nbsp;</span><span class="chat-item">${item.messageBody}</span></p>`

          }
        }).join('');
        document.getElementById("chat-content").innerHTML = chatHtml;
        var element = document.getElementById("chat-content");
        element.scrollTop = element.scrollHeight;
      }
      handleIpcStateChange(tourney.manager.ipcState || 0);

      // 双边分数
      setScoreBars(tourney);

      storeMatchResultIfNeed(tourney, bid);

      // 双边星星槽位
      const bestOF = tourney.manager.bestOF;
      if (bestOF !== cache.bestOF) {

        cache.bestOF = bestOF;
        const max = bestOF / 2 + 1;
        // 清空原有星星
        document.getElementById("team-a-star-container").innerHTML = "";

        for (let i = 0; i < max; i++) {
          const star = document.createElement("div");
          star.className = "team-a-star-slot";
          document.getElementById("team-a-star-container").appendChild(star);
        }

        // 清空原有星星
        document.getElementById("team-b-star-container").innerHTML = "";

        for (let i = 0; i < max; i++) {
          const star = document.createElement("div");
          star.className = "team-b-star-slot";
          document.getElementById("team-b-star-container").appendChild(star);
        }
      }

      // 双边星星
      const leftStar = tourney.manager.stars.left
      if (leftStar !== cache.leftStar) {
        cache.leftStar = leftStar;


        const max = cache.bestOF / 2 + 1
        for (let i = 0; i < max; i++) {
          document.getElementById("team-a-star-container").children[i].className = "team-a-star-slot";
        }
        for (let i = 0; i < leftStar; i++) {
          const childElement = document.getElementById("team-a-star-container").children[i];
          childElement.className = "team-a-star";
        }

      }
      const rightStar = tourney.manager.stars.right
      if (rightStar !== cache.rightStar) {
        cache.rightStar = rightStar;

        const max = cache.bestOF / 2 + 1

        for (let i = 0; i < max; i++) {
          document.getElementById("team-b-star-container").children[i].className = "team-b-star-slot";
        }
        // 从右到左替换样式
        for (let i = 0; i < rightStar; i++) {
          const childElement = document.getElementById("team-b-star-container").children[max - i - 1];
          childElement.className = "team-b-star";
        }
      }


    }
  } catch
    (error) {
    console.log(error);
  }
}


if (isDebug) {
  handleWebSocket(menu, tourney);
} else {
  socket.api_v1(async ({menu, tourney}) => {
    await handleWebSocket(menu, tourney);
  });
}

function setLeftTeamAvatar(acronym) {
  const basePath = "https://a.ppy.sh/" + acronym + "?.jpeg";
  const imgElement = document.getElementById("team-a-avatar");
  imgElement.src = basePath;
}

function setRightTeamAvatar(acronym) {
  var basePath = "https://a.ppy.sh/" + acronym + "?.jpeg";
  var imgElement = document.getElementById("team-b-avatar");
  imgElement.src = basePath;
}

// 控制台逻辑

// 点击button-match-qf和button-match-gf时，点亮自身，熄灭round-control-buttons内其他按钮，修改match-round的文本为按钮文本
const matchRound = document.getElementById("match-round");

function storeMatchRound() {
  localStorage.setItem('currentMatchRound' + mode, matchRound.innerText);
}

function activateButton(buttonId) {
  document.getElementById(buttonId).classList.remove("button-inactive", "button-active");
  document.getElementById(buttonId).classList.add("button-active");
}

function deactivateButtons(...buttonIds) {
  buttonIds.forEach(buttonId => {
    document.getElementById(buttonId).classList.remove("button-inactive", "button-active");
    document.getElementById(buttonId).classList.add("button-inactive");
  });
}

function handleButtonClick(buttonId, roundText, buttonsToDeactivate) {
  matchRound.innerText = roundText;
  activateButton(buttonId);
  deactivateButtons(...buttonsToDeactivate);
  storeMatchRound();
}

document.getElementById("button-match-16").addEventListener("click", () => {
  handleButtonClick("button-match-16", "Round of 16",
    ["button-match-qf", "button-match-sf", "button-match-f"]);
});

document.getElementById("button-match-qf").addEventListener("click", () => {
  handleButtonClick("button-match-qf", "QuarterFinals",
    ["button-match-16", "button-match-sf", "button-match-f"]);
});

document.getElementById("button-match-sf").addEventListener("click", () => {
  handleButtonClick("button-match-sf", "SemiFinals",
    ["button-match-16", "button-match-qf", "button-match-f"]);
});

document.getElementById("button-match-3rd").addEventListener("click", () => {
  handleButtonClick("button-match-3rd", "3rd Place",
    ["button-match-16", "button-match-qf", "button-match-sf", "button-match-f"]);
});

document.getElementById("button-match-f").addEventListener("click", () => {
  handleButtonClick("button-match-f", "Final",
    ["button-match-16", "button-match-qf", "button-match-sf", "button-match-3rd"]);
});


document.addEventListener('contextmenu', function (event) {
  event.preventDefault();
})

function setScoreBars(tourney) {
  const scores = {
    left: {
      score: 0,
    },
    right: {
      score: 0,
    },
    bar: -1,
  }

  const leftClients = tourney.ipcClients.filter(client => client.team === 'left');
  const rightClients = tourney.ipcClients.filter(client => client.team === 'right');
  let scoreDiff = 0;


  scores.left.score = (leftClients.map(client => client.gameplay.score)).reduce((acc, score) => acc + score, 0);
  scores.right.score = (rightClients.map(client => client.gameplay.score)).reduce((acc, score) => acc + score, 0);
  scoreDiff = Math.abs(scores.left.score - scores.right.score);
  // 随scoreDiff从0增大到100w，X从0先陡再缓慢增大到0.4
  let X = (Math.min(0.4, Math.pow(scoreDiff / 1500000, 0.5) / 2));
  // 将X换算到0-1
  let Y = 2.5 * X;
  // 根据X计算出短边分数条的长度，从1920缓慢缩减到615
  scores.bar = 1920 - (1920 - 615) * Y;

  if (scores.left.score !== cache.leftScore || scores.right.score !== cache.rightScore) {
    cache.leftScore = scores.left.score;
    cache.rightScore = scores.right.score;

    const leftScore = scores.left.score;
    const rightScore = scores.right.score;
    const scoreDiff = Math.abs(leftScore - rightScore);

    // 分数条，狂抄Lazer https://github.com/ppy/osu/blob/master/osu.Game/Screens/Play/HUD/MatchScoreDisplay.cs#L145
    if (leftScore === rightScore) {
      document.getElementById('team-a-score-bar').style.width = 1920 + "px";
      document.getElementById('team-b-score-bar').style.width = 1920 + "px";
      document.getElementById('team-a-score-lead').style.visibility = 'hidden';
      document.getElementById('team-b-score-lead').style.visibility = 'hidden';
    } else if (leftScore > rightScore) {
      document.getElementById('team-a-score-bar').style.width = (3840 - scores.bar) + "px";
      document.getElementById('team-b-score-bar').style.width = scores.bar + "px";

      document.getElementById('team-a-score-lead').style.visibility = 'visible';
      document.getElementById('team-a-score-lead').style.visibility = 'visible';

      document.getElementById('team-b-score-lead').style.visibility = 'hidden';
    } else {
      document.getElementById('team-b-score-bar').style.width = (3840 - scores.bar) + "px";
      document.getElementById('team-a-score-bar').style.width = scores.bar + "px";

      document.getElementById('team-a-score-lead').style.visibility = 'hidden';
      document.getElementById('team-b-score-lead').style.visibility = 'visible';
    }

    // 分数文字
    teamAScore.update(leftScore);
    teamBScore.update(rightScore);

    teamAScoreLead.update(scoreDiff);
    teamBScoreLead.update(scoreDiff);
  }
}

</script>

<template>
  <div class="container">
    <div id="background-video">
      <video autoplay muted loop id="bg-video">
        <source src="../../assets/CL_loop_1_compressed.mp4" type="video/mp4">
        Your browser does not support the video tag.
      </video>
    </div>

    <div id="match-name-container">
      <span id="match-name">CHINA LAN</span>
    </div>
    <div id="match-round-container">
      <span id="match-round"></span>
    </div>


    <div id="team-a-container">
      <div id="team-a-name-container">
        <img id="team-a-avatar">
        <span id=team-a-name></span>
      </div>

      <div id="team-a-star-container">

      </div>

      <div id="team-a-score-bar" style="width: 100px;">
        <span id="team-a-score-lead" style="visibility: hidden"></span>
      </div>

      <span id="team-a-score"></span>
    </div>

    <div id="team-b-container">
      <div id="team-b-name-container">
        <img id="team-b-avatar">
        <span id=team-b-name></span>
      </div>

      <div id="team-b-star-container">

      </div>

      <div id="team-b-score-bar" style="width: 100px;">
        <span id="team-b-score-lead" style="visibility: hidden"></span>
      </div>

      <span id="team-b-score"></span>
    </div>
    <div id="chat">
      <div id="chat-content">

      </div>
    </div>

    <div id="danmaku">
      <!--      <iframe id="danmaku-iframe"-->
      <!--              allowTransparency="true"-->
      <!--              src="https://vercel.blive.chat/room/BQVLQJXMWFEO8?roomKeyType=2&lang=zh&templateUrl=http%3A%2F%2F127.0.0.1%3A24050%2Fclan2025%2Flib%2Fdanmaku_template%2Fyoutube%2Findex.html"-->
      <!--      ></iframe>-->
    </div>


    <div id="map-info-container">
      <img id="map-cover">
      <div id="map-picker-container">
        <span id="map-picker"></span>
      </div>

      <div id="map-title-scroll-container" class="scroll-container">
        <div id="map-title-scrolling-content">
          <p id="map-title" class="map-title"></p>
        </div>
      </div>

      <span id="map-diff"></span>
      <span id="map-mapper-label">mapped by </span>
      <span id="map-mapper"></span>
      <div id="map-data-container">
        <span class="map-data-label">BPM&nbsp;</span><span id="map-bpm"
                                                           class="map-data-text"></span>
        <span class="map-data-label">LENGTH&nbsp;</span><span id="map-length-minutes"
                                                              class="map-data-text"></span><span
        class="map-data-text">:</span><span id="map-length-seconds" class="map-data-text"></span>
        <br>
        <span class="map-data-label">CS&nbsp;</span><span id="map-cs" class="map-data-text"></span>
        <span class="map-data-label">AR&nbsp;</span><span id="map-ar" class="map-data-text"></span>
        <span class="map-data-label">OD&nbsp;</span><span id="map-od" class="map-data-text"></span>
        <span class="map-data-label">SR&nbsp;</span><span id="map-star"
                                                          class="map-data-text"></span>
      </div>

    </div>

    <div class="control-panel">
      <span class="panel-title">Control Panel</span>
      <div class="panel-buttons">

        <div class="round-control">
          <div class="panel-label"><span>Pick Match Round</span></div>

          <div class="round-control-buttons">

            <button id="button-match-16" class="button-inactive">RO16</button>
            <button id="button-match-qf" class="button-inactive">QuaterFinal</button>

            <button id="button-match-sf" class="button-inactive">SemiFinal</button>
            <button id="button-match-3rd" class="button-inactive">3rd Place</button>

            <button id="button-match-f" class="button-inactive">Final</button>


          </div>

        </div>

        <!-- [TODO] Refactor these to at lease put styles into CSS, or even better, use Flexbox -->
        <div class="chat-control" style="position: absolute; left: 500px; top: 75px; width: 100px;">
          <div class="round-control-buttons">
            <button id="button-chat-toggle" class="button-active">Toggle Chat</button>
          </div>
        </div>

        <div class="chat-control" style="position: absolute; left: 650px; top: 40px; width: 500px;">
          <h1 style="color: white" id="notify-record">DO NOT FORGET START RECORDING!</h1>
          <button id="button-record-ack" class="button-active" style="display: none">OK</button>
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
  /*8像素用三角函数计算出来之后的结果*/
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
  /*8像素用三角函数计算出来之后的结果*/
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
  /* 防止文本换行 */
  white-space: nowrap;
  /* 隐藏超出容器的内容 */
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
  /*右对齐*/
  text-align: right;
  /* 防止文本换行 */
  white-space: nowrap;
  /* 隐藏超出容器的内容 */
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

/*聊天框的渐变*/
.fade-in {
  transition: opacity 0.5s ease; /* 透明度过渡0.5秒，效果平滑 */
}

.fade-out {
  transition: opacity 0.5s ease; /* 透明度过渡0.5秒，效果平滑 */
  opacity: 0; /* 淡出至完全透明 */
}

#chat {
  position: absolute;
  width: 825px;
  height: 255px;
  top: 1905px;
  left: 2400px;
  opacity: 0;
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

#chat-content p {
  font-family: YEFONTYSH, sans-serif;
  font-size: 33px;
  margin: 0px;
  color: #1D1D1D;
  white-space: normal; /* 允许自动换行 */
  overflow-wrap: break-word; /* 长单词换行 */
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

.picked-by-team-a #map-cover {
  border-bottom: 62px solid #AF3232;
  box-sizing: border-box;
}

.picked-by-team-b #map-cover {
  border-bottom: 62px solid #1D1D1D;
  box-sizing: border-box;
}


.team-a-map-mod-container {
  width: 109px;
  height: 39px;
  position: absolute;
  right: 0px;
  bottom: 0px;
  display: flex;
  /*水平垂直居中*/
  justify-content: center;
  align-content: center;

  /*用#AF3232填充这个div*/
  background-color: #AF3232;
  border-radius: 21px 0px 21px 0px;
  z-index: 2;
}


.tiebreaker-map-mod-container {
  width: 109px;
  height: 39px;
  position: absolute;
  right: 0px;
  bottom: 0px;
  display: flex;
  /*水平垂直居中*/
  justify-content: center;
  align-content: center;

  /*用#9bdb22填充这个div*/
  background-color: #9bdb22;
  border-radius: 21px 0px 21px 0px;
  z-index: 2;
}

.tiebreaker-map-mod {
  width: 58px;
  height: 24px;
  font-family: TorusNotched-Regular, sans-serif;
  font-size: 29px;
  font-weight: normal;
  font-stretch: normal;
  letter-spacing: 0px;
  color: #ffffff;
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
  object-fit: cover; /* 保持图片的宽高比并填充容器 */
  overflow: hidden; /* 隐藏超出容器的内容 */
}


#map-diff {
  position: absolute;
  width: 940px;
  font-family: MontserratBlack, sans-serif;
  font-size: 50px;
  color: #1D1D1D;
  left: 1460px;
  top: 88px;
  /* 防止文本换行 */
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 1; /* 设置为1倍字体大小 */
}

#map-mapper-label {

  position: absolute;
  width: 310px;
  font-family: MontserratBlack, sans-serif;
  font-size: 50px;
  color: #1D1D1D;
  left: 1460px;
  top: 142px;
  /* 防止文本换行 */
  white-space: nowrap;
  line-height: 1; /* 设置为1倍字体大小 */
}

#map-mapper {
  position: absolute;
  width: 622px;
  font-family: MontserratBlack, sans-serif;
  font-size: 50px;
  color: #AF3232;

  left: 1778px;
  top: 142px;
  /* 防止文本换行 */
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 1; /* 设置为1倍字体大小 */
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
  line-height: 1; /* 设置为1倍字体大小 */
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
  line-height: 1; /* 设置为1倍字体大小 */
}

.map-data-label {
  color: #1D1D1D;
  font-size: 50px;
  font-family: MontserratBlack, sans-serif;
  line-height: 1; /* 设置为1倍字体大小 */
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

.team-a-player-list,
.team-b-player-list {
  display: flex;
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
  z-index: -1; /* 确保视频在所有内容后面 */
}
</style>
