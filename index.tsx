import express from 'express';
import Expo, { ExpoPushMessage } from 'expo-server-sdk';
import BodyParser from 'body-parser';
import * as postgresService from './postgresService';
import db from './dbCon';
const app = express();
const port = 8000;
const expo = new Expo();
const jsonParser = BodyParser.json();

//ROUTE FOR FRONTEND

app.post('/registerNotifications', jsonParser, async (req, res) => {
  const teamId = Number(req.body.teamId);
  const token = String(req.body.token);
  const notificationEnabled = Boolean(req.body.notificationEnabled);

  await postgresService.saveToken(teamId, token, notificationEnabled);
  res.status(200).json({ message: 'success' });
});

app.get('/gameweek', (req, res) => {
  const gameweeknum = postgresService.gameweek;
  res.json(gameweeknum);
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

////// NOTIFICATION FUNCTIONS

async function getLatestEvent() {
  try {
    const levent = await db.one ('SELECT * FROM events ORDER BY id DESC LIMIT 1');
    
    if (levent.sent === false) {
      const id = await db.one ('SELECT elementid FROM playermap WHERE name = $1',[levent.name]);
      const tokens = await postgresService.getExpoPushTokens(id);
      await db.one('UPDATE events SET sent = $4 WHERE fixture = $1 AND name = $2 AND event = $3',[levent.fixture, levent.name, levent.event, true])
      await sendNotifications(tokens, levent);
    };
  } catch (error) {
    //console.log("getLatestEvent()", error);
  };
 }; setInterval(getLatestEvent, 1000);

const sendNotifications = async (tokens: string[], levent: [{name: string, fixture: string, event: string}]) => {
  const maxBatchSize = 100;
  const event = levent[0];

  for (let i = 0; i < tokens.length; i += maxBatchSize) { // NOTIFICATIONS SENT IN BATCHES OF 100 (MAXIMUM EXPO ALLOWS)
    const batchTokens = tokens.slice(i, i + maxBatchSize);
    const messages: ExpoPushMessage[] = batchTokens.map(token => ({
      to: token,
      title: `${event.fixture}`,
      body: `${event.event} for ${event.name}`,
      priority: 'high',
      sound: 'default',
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
