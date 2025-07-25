// 公共函数
function getStoredMap(key) {
    const storedData = localStorage.getItem(key);
    return storedData && JSON.parse(storedData).length > 0 ? new Map(JSON.parse(storedData)) : null;
}

function updateStoredMap(key, updater) {
    let map = getStoredMap(key) || new Map();
    updater(map);
    localStorage.setItem(key, JSON.stringify(Array.from(map.entries())));
}

export function clearAllStoredData(mode) {
    localStorage.removeItem(`beatmap_selection_${mode}`);
    localStorage.removeItem(`beatmap_protection`);
    localStorage.removeItem(`current_match_round_${mode}`);
    localStorage.removeItem(`match_result_${mode}`);
}


// 选图操作
export function storeBeatmapSelection(item, mode) {
    updateStoredMap(`beatmap_selection_${mode}`, (map) => {
        map.set(item.beatmapId, item);
    });
}

export function getStoredBeatmapById(beatmapID, mode) {
    const map = getStoredMap(`beatmap_selection_${mode}`);
    return map?.has(beatmapID) ? map.get(beatmapID) : null;
}

export function getStoredBeatmap(mode) {
    return getStoredMap(`beatmap_selection_${mode}`);
}

export function deleteBeatmapSelectionById(beatmapID, mode) {
    const key = `beatmap_selection_${mode}`;
    const map = getStoredMap(key);
    if (map?.has(beatmapID)) {
        map.delete(beatmapID);
        localStorage.setItem(key, JSON.stringify(Array.from(map.entries())));
    }
}


// 保图操作（mania专属，因此不带mode）
export function storeBeatmapProtection(item) {
    updateStoredMap(`beatmap_protection`, (map) => {
        map.set(item.beatmapId, item);
    });
}
export function getStoredBeatmapProtectionById(beatmapID) {
    const map = getStoredMap(`beatmap_protection`);
    return map?.has(beatmapID) ? map.get(beatmapID) : null;
}

export function getStoredBeatmapProtection() {
    return getStoredMap(`beatmap_protection`);
}

export function deleteBeatmapProtectionById(beatmapID) {
    const key = `beatmap_protection`;
    const map = getStoredMap(key);
    if (map?.has(beatmapID)) {
        map.delete(beatmapID);
        localStorage.setItem(key, JSON.stringify(Array.from(map.entries())));
    }
}



// 每场结果操作
export function storeMatchResult(scores, mode) {
    updateStoredMap(`match_result_${mode}`, (map) => {
        map.set(scores.beatmapId, scores);
    });
}

export function getStoredMatchResult(mode) {
    return getStoredMap(`match_result_${mode}`);
}

export function getStoredMatchResultById(beatmapID, mode) {
    const map = getStoredMap(`match_result_${mode}`);
    return map?.has(Number(beatmapID)) ? map.get(Number(beatmapID)) : null;
}

export function deleteMatchResultById(beatmapID, mode) {
    const key = `match_result_${mode}`;
    const map = getStoredMap(key);
    if (map?.has(beatmapID)) {
        map.delete(beatmapID);
        localStorage.setItem(key, JSON.stringify(Array.from(map.entries())));
    }
}
