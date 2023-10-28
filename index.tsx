import express from 'express';
import Expo from 'expo-server-sdk';
import BodyParser from 'body-parser';
import * as postgresService from './postgresService'

const app = express();
const port = 8000;
const expo = new Expo();
const jsonParser = BodyParser.json();
const connectionString = process.env.DB_CONNECTION_STRING

const pgPromises = require ('pg-promise')
const pgps = pgPromises();
const dbs = pgps({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

app.post('/registerNotifications', jsonParser, async (req, res) => {
  const teamId = Number(req.body.teamId);
  const token = String(req.body.token);
  const notificationEnabled = Boolean(req.body.notificationEnabled);

  await postgresService.saveToken(teamId, token, notificationEnabled);
  res.status(200).json({ message: 'success' });
});

app.post('/gameweek', async (req, res) => {
  try {
    const gameweekData = await dbs.any('SELECT * from gameweek'); // Modify this query according to your data structure
    const gw = gameweekData.gameweek;
    res.json({ gameweek: gw });
  } catch (error) {
    console.error('Error fetching gameweek data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/getToken', jsonParser, async (req, res) => {
  const expoPushToken = String(req.body.expoPushToken);
  try {
    const userData = await postgresService.getToken(expoPushToken);
    if (userData) {
      res.status(200).json(userData);
    } else {
      res.status(404).json({ message: 'User data not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving user data' });
  }
});

////// events notifications scripts \\\\\\

const processedEventIDs = new Set();
let isProcessing = false;

async function queryDatabase() {
  try {
    if (isProcessing) {
      console.log("Querying already......");
      return;
    };
    isProcessing = true;
    const latestEvent = await dbs.any ('SELECT * FROM events ORDER BY id DESC LIMIT 1');
    const id = latestEvent[0].id;

    if (id && !processedEventIDs.has(id)) {
      const player_id = latestEvent[0].player_id;
      const related_id = latestEvent[0].related_id;
      const tokens = await postgresService.getExpoPushTokens(player_id, related_id);

      sendNotifications(tokens, latestEvent);
      processedEventIDs.add(id);
    } else {
    }
  } catch (error) {
    console.log(error);
  } finally {
    isProcessing = false;
  }
 } setInterval(queryDatabase, 1000);

const sendNotifications = async (tokens: string[], latestEvent: string []) => {
  const maxBatchSize = 100;
  const event = latestEvent[0]; 

  if (!event || typeof event !== 'object') {
    console.log("Invalid event data.");
    return;
  }
  const { match_name, minute, type_id, event_name, player_name, smid, addition, related_player_name, result} 
  = event;

  const notificationMappings = {
    10: {
      title: `[VAR] ${match_name} (${minute}' min)`,
      body: ` ${addition} (${player_name})`,
      priority: 'high',
      sound: 'default'
    },
    11: {
      title: ` ${match_name} (${minute}' min)`,
      body: `[Correction] Assist awarded to - ${player_name}`,
      priority: 'high',
      sound: 'default'
    },
    12: {
      title: `${match_name} (${minute}' min)`,
      body: `[Correction] ${event_name} - ${player_name}`,
      priority: 'high',
      sound: 'default'
    },
    14: {
      title: `[${result}] ${match_name} (${minute}' min)`,
      body: related_player_name
        ? `Scorer - ${player_name} (Assist - ${related_player_name})`
        : `Scorer - ${player_name}`,
      priority: 'high',
      sound: 'default'
    },
    15: {
      title: `${match_name} (${minute}' min)`,
      body: `${event_name} - ${player_name}`,
      priority: 'high',
      sound: 'default'
    },
    16: {
      title: `[${result}] ${match_name} (${minute}' min)`,
      body: `${event_name} - ${player_name}`,
      priority: 'high',
      sound: 'default'
    },
    17: {
      title: `${match_name} (${minute}' min)`,
      body: `${event_name} - ${player_name}`,
      priority: 'high',
      sound: 'default'
    },
    18: {
      title: `${match_name} - SUB (${minute}' min)`,
      body: `On: ${player_name} | Off: ${related_player_name}`,
      priority: 'high',
      sound: 'default'
    },
    19: {
      title: `${match_name} (${minute}' min)`,
      body: `${event_name} - ${player_name}`,
      priority: 'high',
      sound: 'default'
    },
    20: {
      title: `${match_name} (${minute}' min)`,
      body: `${event_name} - ${player_name}`,
      priority: 'high',
      sound: 'default'
    },
    21: {
      title: `${match_name} (${minute}' min)`,
      body: `${event_name}: ${player_name}`,
      priority: 'high',
      sound: 'default'
    },
  };
  
  const { title: notificationTitle, body: notificationBody, priority: notificationPriority, sound: notificationSound } =
    notificationMappings[type_id] || {
      title: `${match_name} - (${minute}' min)`,
      body: `Unknown event for ${player_name}`,
      priority: 'high',
      sound: 'default',

    };


  for (let i = 0; i < tokens.length; i += maxBatchSize) { // NOTIFICATIONS SENT IN BATCHES OF 100 (MAXIMUM EXPO ALLOWS)
    const batchTokens = tokens.slice(i, i + maxBatchSize);
    const messages = batchTokens.map(token => ({
      to: token,
      title: notificationTitle,
      body: notificationBody,
      priority: notificationPriority,
      sound: notificationSound,
      channelId: 'default'
    }));
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(messages);
      console.log("push notifications sent", ticketChunk);
    } catch (error) {
      console.error('Error sending push notifications:', error);
    }
    await new Promise(resolve => setTimeout(resolve, 200)); // 200ms timeout to prevent sending over 600 in a second (MAXIMUM EXPO ALLOWS)
  };
};


app.listen(port, () => {
  console.log(`Running on port ${port}`);
});
