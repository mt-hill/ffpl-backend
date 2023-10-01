"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const express_1 = __importDefault(require("express"));
const expo_server_sdk_1 = __importDefault(require("expo-server-sdk"));
const body_parser_1 = __importDefault(require("body-parser"));
const postgresService = __importStar(require("./postgresService"));
const app = (0, express_1.default)();
const port = 8000;
const expo = new expo_server_sdk_1.default();
const jsonParser = body_parser_1.default.json();
const pgPromises = require('pg-promise');
const pgps = pgPromises();
const dbs = pgps({
    connectionString: 'postgresql://flashfpldb_user:jFhDJIJJ3C3KzhirjH5FGiCQutwnK3HA@dpg-ck1gvoeru70s73dpd9q0-a.frankfurt-postgres.render.com/flashfpldb',
    ssl: {
        rejectUnauthorized: false,
    },
});
app.post('/registerNotifications', jsonParser, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const teamId = Number(req.body.teamId);
    const token = String(req.body.token);
    const notificationEnabled = Boolean(req.body.notificationEnabled);
    yield postgresService.saveToken(teamId, token, notificationEnabled);
    res.status(200).json({ message: 'success' });
}));
app.post('/getToken', jsonParser, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const expoPushToken = String(req.body.expoPushToken);
    try {
        const userData = yield postgresService.getToken(expoPushToken);
        if (userData) {
            res.status(200).json(userData);
        }
        else {
            res.status(404).json({ message: 'User data not found' });
        }
    }
    catch (error) {
        res.status(500).json({ message: 'Error retrieving user data' });
    }
}));
const sendNotifications = (tokens, latestEvent) => __awaiter(void 0, void 0, void 0, function* () {
    const maxBatchSize = 100;
    const event = latestEvent[0];
    if (!event || typeof event !== 'object') {
        console.log("Invalid event data.");
        return;
    }
    const { match_name, minute, type_id, event_name, player_name, smid, addition, related_player_name, result } = event;
    const notificationMappings = {
        10: {
            title: `${match_name} - (${minute}' min)`,
            body: `${event_name} - ${addition} (${player_name})`,
        },
        14: {
            title: `${match_name} - (${minute}' min)`,
            body: related_player_name
                ? `GOAL for ${player_name} (ASSIST: ${related_player_name})`
                : `GOAL for ${player_name}`,
        },
        15: {
            title: `${match_name} - (${minute}' min)`,
            body: `${event_name} for ${player_name}`,
        },
        16: {
            title: `${match_name} - (${minute}' min)`,
            body: `${event_name} by ${player_name}`,
        },
        17: {
            title: `${match_name} - (${minute}' min)`,
            body: `${event_name} by ${player_name}`,
        },
        18: {
            title: `${match_name} - Subsitute (${minute}' min)`,
            body: `${player_name} ON - ${related_player_name} OFF`,
        },
        19: {
            title: `${match_name} - (${minute}' min)`,
            body: `${event_name} for ${player_name}`,
        },
        20: {
            title: `${match_name} - (${minute}' min)`,
            body: `${event_name} for ${player_name}`,
        },
        21: {
            title: `${match_name} - (${minute}' min)`,
            body: `${event_name} for ${player_name}`,
        }
    };
    const { title: notificationTitle, body: notificationBody } = notificationMappings[type_id] || {
        title: `${match_name} - (${minute}' min)`,
        body: `Unknown event for ${player_name}`,
    };
    for (let i = 0; i < tokens.length; i += maxBatchSize) {
        const batchTokens = tokens.slice(i, i + maxBatchSize);
        const messages = batchTokens.map(token => ({
            to: token,
            title: notificationTitle,
            body: notificationBody,
        }));
        try {
            const ticketChunk = yield expo.sendPushNotificationsAsync(messages);
            console.log("push notifications sent", ticketChunk);
        }
        catch (error) {
            console.error('Error sending push notifications:', error);
        }
    }
});
let counterid = 0;
function queryDatabaseAndPerformActions() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const latestEvent = yield dbs.any('SELECT * FROM events ORDER BY id DESC LIMIT 1');
            if (latestEvent && latestEvent.length > 0) {
                const id = latestEvent[0].id;
                if (id > counterid) {
                    const player_id = latestEvent[0].player_id;
                    const related_id = latestEvent[0].related_id;
                    const tokens = yield postgresService.getExpoPushTokens(player_id, related_id);
                    counterid = id;
                    sendNotifications(tokens, latestEvent);
                }
                else {
                }
            }
            else {
                console.log("empty database");
            }
        }
        catch (error) {
            console.error('Error querying the database:', error);
        }
    });
}
setInterval(queryDatabaseAndPerformActions, 490);
app.listen(port, () => {
    console.log(`Running on port ${port}`);
});
