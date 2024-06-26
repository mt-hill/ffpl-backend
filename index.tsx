import express from 'express';
import Expo, { ExpoPushMessage } from 'expo-server-sdk';
import BodyParser from 'body-parser';
import * as postgresService from './postgresService';
import db from './dbCon';
const app = express();
const port = 8000;
const expo = new Expo();
const jsonParser = BodyParser.json();












/////////// SAVES A USERS EXPO TOKEN FOR NOTIFICATIONS /////////// 
app.post('/registerNotifications', jsonParser, async (req, res) => {
  const teamId = Number(req.body.teamId);
  const token = String(req.body.token);
  const notificationEnabled = Boolean(req.body.notificationEnabled);

  await postgresService.saveToken(teamId, token, notificationEnabled);
  res.status(200).json({ message: 'success' });
});
/////////// GETS USERS EXPO TOKEN WHEN VISITING APP /////////// 
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











/////////// CURRENT GAMEWEEK NUMBER /////////// 
app.get('/gameweek', (req, res) => {
  const gameweeknum = postgresService.gameweek;
  res.json(gameweeknum);
});











/////////// GETS LATEST EVENT FROM DATABASE /////////// 
async function getLatestEvent() {
  try {
    const levent = await db.one ('SELECT * FROM events ORDER BY id DESC LIMIT 1');
    
    if (levent.sent === false) {
      const player = await db.one ('SELECT elementid FROM playermap WHERE name = $1',[levent.name]);
      const id = player.elementid;
      const tokens = await postgresService.getExpoPushTokens(id);

      if (tokens.length > 0){
        console.log("tokens received");
        sendNotifications(tokens, levent.name, levent.fixture, levent.event);
        await db.one('UPDATE events SET sent = $1 WHERE id = $2',[true, levent.id]);
      } else {
        console.log("no users with this player");
        await db.one('UPDATE events SET sent = $1 WHERE id = $2',[true, levent.id]);
      };
    };
  } catch (error) {
    //console.log("getLatestEvent()", error);
  };
 }; setInterval(getLatestEvent, 1000);

/////////// SENDS NOTIFICATIONS /////////// 
const sendNotifications = async (tokens: string[], name: string, fixture: string, event: string) => {
  try {
    const maxBatchSize = 100;

    for (let i = 0; i < tokens.length; i += maxBatchSize) {
      const batchTokens = tokens.slice(i, i + maxBatchSize);
      const messages: ExpoPushMessage[] = batchTokens.map(token => ({
        to: token,
        title: fixture,
        body: `${event} for ${name}`,
        priority: 'high',
        sound: 'default',
        channelId: 'default'
      }));
      
      const ticketChunk = await expo.sendPushNotificationsAsync(messages);
      console.log("push notifications sent", ticketChunk);

      await new Promise(resolve => setTimeout(resolve, 200));
    };
  } catch (error) {
    console.error('Error sending push notifications:', error);
  }
};












app.listen(port, () => {
  console.log(`Running on port ${port}`);
});
