export interface WebSocketV1 {
  settings: {
    showInterface: boolean;
    folders: {
      game: string;
      skin: string;
      songs: string;
    };
  };
  menu: {
    mainMenu: {
      bassDensity: number;
    };
    state: number;
    gameMode: number;
    isChatEnabled: number;
    bm: {
      time: {
        firstObj: number;
        current: number;
        full: number;
        mp3: number;
      };
      id: number;
      set: number;
      md5: string;
      rankedStatus: number;
      metadata: {
        artist: string;
        artistOriginal: string;
        title: string;
        titleOriginal: string;
        mapper: string;
        difficulty: string;
      };
      stats: {
        AR: number;
        CS: number;
        OD: number;
        HP: number;
        SR: number;
        BPM: {
          common: number;
          min: number;
          max: number;
        };
        circles: number;
        sliders: number;
        spinners: number;
        holds: number;
        maxCombo: number;
        fullSR: number;
        memoryAR: number;
        memoryCS: number;
        memoryOD: number;
        memoryHP: number;
      };
      path: {
        full: string;
        folder: string;
        file: string;
        bg: string;
        audio: string;
      };
    };
    mods: {
      num: number;
      str: string;
    };
    pp: {
      95: number;
      96: number;
      97: number;
      98: number;
      99: number;
      100: number;
      strains: number[];
      strainsAll: {
        series: {
          name: string;
          data: number[];
        }[];
        xaxis: number[];
      };
    };
  };
  gameplay: {
    gameMode: number;
    name: string;
    score: number;
    accuracy: number;
    combo: {
      current: number;
      max: number;
    };
    hp: {
      normal: number;
      smooth: number;
    };
    hits: {
      0: number;
      50: number;
      100: number;
      300: number;
      geki: number;
      katu: number;
      sliderBreaks: number;
      grade: {
        current: string;
        maxThisPlay: string;
      };
      unstableRate: number;
      hitErrorArray: any;
    };
    pp: {
      current: number;
      fc: number;
      maxThisPlay: number;
    };
    keyOverlay: {
      k1: {
        isPressed: boolean;
        count: number;
      };
      k2: {
        isPressed: boolean;
        count: number;
      };
      m1: {
        isPressed: boolean;
        count: number;
      };
      m2: {
        isPressed: boolean;
        count: number;
      };
    };
    leaderboard: {
      hasLeaderboard: boolean;
      isVisible: boolean;
      ourplayer: {
        name: string;
        score: number;
        combo: number;
        maxCombo: number;
        mods: string;
        h300: number;
        h100: number;
        h50: number;
        h0: number;
        team: number;
        position: number;
        isPassing: number;
      };
      slots: any;
    };
    _isReplayUiHidden: boolean;
  };
  resultsScreen: {
    0: number;
    50: number;
    100: number;
    300: number;
    name: string;
    score: number;
    maxCombo: number;
    mods: {
      num: number;
      str: string;
    };
    geki: number;
    katu: number;
  };
  userProfile: {
    name: string;
    accuracy: number;
    rankedScore: number;
    id: number;
    level: number;
    playCount: number;
    playMode: number;
    rank: number;
    countryCode: number;
    performancePoints: number;
    isConnected: boolean;
    backgroundColour: string;
  };
  tourney: {
    manager: {
      ipcState: number;
      bestOF: number;
      teamName: {
        left: string;
        right: string;
      };
      stars: {
        left: number;
        right: number;
      };
      bools: {
        scoreVisible: boolean;
        starsVisible: boolean;
      };
      chat: any;
      gameplay: {
        score: {
          left: number;
          right: number;
        };
      };
    };
    ipcClients: {
      team: string;
      spectating: {
        name: string;
        country: string;
        userID: number;
        accuracy: number;
        rankedScore: number;
        playCount: number;
        globalRank: number;
        totalPP: number;
      };
      gameplay: {
        gameMode: number;
        name: string;
        score: number;
        accuracy: number;
        combo: {
          current: number;
          max: number;
        };
        hp: {
          normal: number;
          smooth: number;
        };
        hits: {
          0: number;
          50: number;
          100: number;
          300: number;
          geki: number;
          katu: number;
          sliderBreaks: number;
          grade: {
            current: string;
            maxThisPlay: string;
          };
          unstableRate: number;
          hitErrorArray: any;
        };
        mods: {
          num: number;
          str: string;
        };
      };
    }[];
  };
}
