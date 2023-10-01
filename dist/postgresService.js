"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExpoPushTokens = exports.CheckAndInsert = exports.getPushTokens = exports.getToken = exports.saveToken = void 0;
const pg_promise_1 = __importDefault(require("pg-promise"));
const axios = require('axios');
const pgp = (0, pg_promise_1.default)();
const db = pgp({
    connectionString: 'postgresql://flashfpldb_user:jFhDJIJJ3C3KzhirjH5FGiCQutwnK3HA@dpg-ck1gvoeru70s73dpd9q0-a.frankfurt-postgres.render.com/flashfpldb',
    ssl: {
        rejectUnauthorized: false,
    },
});
const saveToken = (teamId, token, notificationEnabled) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const existingToken = yield db.oneOrNone('SELECT token FROM users WHERE token = $1', [token]);
        if (existingToken) {
            console.log("token exists, record updated");
            yield db.none('UPDATE users SET team_id = $1, notifications_enabled = $2 WHERE token = $3', [
                teamId,
                notificationEnabled,
                token,
            ]);
        }
        else {
            console.log("token doesnt exist, record added");
            yield db.none('INSERT INTO users (team_id, token, notifications_enabled, player_picks) VALUES ($1, $2, $3, $4)', [
                teamId,
                token,
                notificationEnabled,
                null,
            ]);
        }
    }
    catch (error) {
        console.error('Error saving token:', error);
    }
});
exports.saveToken = saveToken;
const getToken = (expoPushToken) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Querying database for token:', expoPushToken);
        const userData = yield db.manyOrNone('SELECT team_id, notifications_enabled FROM users WHERE token = $1', [expoPushToken]);
        if (userData) {
            console.log('Retrieved user data from database:', userData);
            return userData;
        }
        else {
            throw new Error('User data not found for the provided token');
        }
    }
    catch (error) {
        console.error('Error retrieving user data:', error);
        throw error;
    }
});
exports.getToken = getToken;
const getPushTokens = (team_id) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("received", team_id);
    const matchedUsers = yield db.manyOrNone('SELECT * FROM users WHERE team_id = $1', [team_id]);
    const expoPushTokens = matchedUsers.map(user => user.token);
    console.log("got", expoPushTokens);
    return expoPushTokens;
});
exports.getPushTokens = getPushTokens;
////////////////// EVENT FETCHER \\\\\\\\\\\\\\\\\\
const typeMapping = {
    10: "VAR",
    14: "Goal",
    15: "Own-goal",
    16: "Pen Scored",
    17: "Pen Missed",
    18: "Substitute",
    19: "Yellow Card",
    20: "Red Card",
    21: "Second Yellow (OFF)",
};
const apiUrl = 'https://api.sportmonks.com/v3/football/fixtures/between/2023-10-01/2023-10-02?api_token=GEN2BiwqhnXlX0yb5vF1LKEgylNZv8g8TgYqSP2m3ywdgzda0xjQjmrWBGEw&include=events';
let loggedEventIds = [];
function fetchAndInsertEvents() {
    return __awaiter(this, void 0, void 0, function* () {
        while (true) {
            let counter = 0;
            const response = yield axios.get(apiUrl);
            const eventData = response.data.data;
            for (const event of eventData) {
                const events = event.events;
                for (const subEvent of events) {
                    const { id } = subEvent;
                    if (!loggedEventIds.includes(id)) {
                        console.log("event logged", counter);
                        loggedEventIds.push(id);
                        counter++;
                        setTimeout(() => {
                            checkAPIForId(id);
                        }, 15000);
                        yield new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
            const currentTime = new Date().toLocaleTimeString();
            console.log(`Script running at ${currentTime}`);
            yield new Promise(resolve => setTimeout(resolve, 5000));
        }
    });
}
fetchAndInsertEvents();
function checkAPIForId(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const currentTime = new Date().toLocaleTimeString();
        try {
            const response = yield axios.get(apiUrl);
            const eventData = response.data.data;
            for (const event of eventData) {
                const events = event.events;
                const matchName = event.name;
                if (events) {
                    for (const event of events) {
                        if (event.id === id) {
                            const { type_id, player_name, related_player_name, minute, result, id, addition } = event;
                            const event_name = typeMapping[type_id] || 'Unknown';
                            const match_Name = matchName;
                            (0, exports.CheckAndInsert)(event, event_name, match_Name);
                            yield new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }
            }
        }
        catch (error) {
            console.log(error);
        }
    });
}
const CheckAndInsert = (event, event_name, match_Name) => __awaiter(void 0, void 0, void 0, function* () {
    const eventData = event;
    const currentTime = new Date().toLocaleTimeString();
    if (eventData.player_name === null) {
        setTimeout(() => {
            checkAPIForId(eventData.id);
        }, 10000);
        console.log(eventData.id, "no player identifier, rechecking for data....");
    }
    else {
        const trimmedPlayerName = eventData.player_name.trim();
        const trimmedRelatedPlayerName = eventData.related_player_name ? eventData.related_player_name.trim() : null;
        if (trimmedPlayerName !== null) {
            const playerMap = yield db.oneOrNone('SELECT fpl_id FROM player_map WHERE player_name = $1', trimmedPlayerName);
            var player_id = playerMap ? playerMap.fpl_id : null;
        }
        else {
            player_id = null;
        }
        if (trimmedRelatedPlayerName !== null) {
            const relatedMap = yield db.oneOrNone('SELECT fpl_id FROM player_map WHERE player_name = $1', trimmedRelatedPlayerName);
            var related_id = relatedMap ? relatedMap.fpl_id : null;
        }
        else {
            related_id = null;
        }
        const exists = yield db.oneOrNone('SELECT id FROM events WHERE smid = $1 AND type_id = $2', [eventData.id, eventData.type_id]);
        if (!exists) {
            yield db.none('INSERT INTO events (match_name, type_id, event_name, addition, player_name, player_id, related_player_name, related_id, minute, result, smid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', [match_Name, eventData.type_id, event_name, eventData.addition, trimmedPlayerName, player_id, trimmedRelatedPlayerName, related_id, eventData.minute, eventData.result, eventData.id]);
            console.log("event successfully logged ", currentTime, eventData.id);
            yield new Promise(resolve => setTimeout(resolve, 1000));
        }
        else {
            yield db.oneOrNone('UPDATE events SET match_name = $1, type_id = $2, event_name = $3, addition = $4, player_name = $5, player_id = $6, related_player_name = $7, related_id = $8, minute = $9, result = $10 WHERE smid = $11', [match_Name, eventData.type_id, event_name, eventData.addition, trimmedPlayerName, player_id, trimmedRelatedPlayerName, related_id, eventData.minute, eventData.result, eventData.id]);
            console.log("event successfully updated ", currentTime, eventData.id);
            yield new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
});
exports.CheckAndInsert = CheckAndInsert;
const getExpoPushTokens = (player_id, related_id) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const query = 'SELECT token FROM users WHERE $1 = ANY(player_picks) OR $2 = ANY(player_picks) AND notifications_enabled = true';
        const tokens = yield db.map(query, [player_id, related_id], (row) => row.token);
        return (tokens);
    }
    catch (error) {
        console.error('Error getting Expo Push Tokens:', error);
        return [];
    }
});
exports.getExpoPushTokens = getExpoPushTokens;
