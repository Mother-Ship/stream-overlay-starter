
export const menu = {
    bm: {
        id: 3760958,
        md5: "abcdef1234567890",
        path: {
            folder: "1832244 w_tre - FIONA",
            file: "w_tre - FIONA (Mipha-) [Carefree].osu",
            bg: "bg.jpg"
        }
    }
};

// 模拟 tourney 对象
export const tourney = {
    manager: {
        chat: [
            { time: "00:01", name: "eilander", messageBody: "1", team: "left" },
            { time: "00:02", name: "Namia", messageBody: "2", team: "right" },
            { time: "00:02", name: "Namia", messageBody: "3", team: "right" },
            { time: "00:02", name: "Namia", messageBody: "一朝被美工", team: "right" },
            { time: "00:02", name: "Namia", messageBody: "测试换行测试换行测试换行测试换行测试换行测试换行测试换行测试换行测试换行测试换行测试换行", team: "right" },
            { time: "00:03", name: "BanchoBot", messageBody: "This is a bot message. This is a bot message.", team: "bot" }
        ],
        ipcState: 4, // 模拟游戏结算状态
        bestOF: 13,   // Best of 13 赛制
        stars: {
            left: 5,  // Team A has won 2 rounds
            right: 1  // Team B has won 1 round
        },
        teamName: {
            left: "eilander",
            right: "Namia"
        }
    },
    ipcClients: [
        {
            team: 'left',
            gameplay: {
                score: 1000000,
                accuracy: 96.5
            }
        },
        {
            team: 'right',
            gameplay: {
                score: 200000,
                accuracy: 97.2
            }
        }
    ]
};
