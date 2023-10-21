import pgPromise from "pg-promise";
const axios = require('axios');
const pgp = pgPromise();
const connectionString = process.env.DB_CONNECTION_STRING
const apiConnectionString = process.env.API_CONNECTION_STRING
const db = pgp({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const saveToken = async (teamId: Number, token: string, notificationEnabled: Boolean) => {
  try {
    const existingToken = await db.oneOrNone('SELECT token FROM users WHERE token = $1', [token]);

    if (existingToken) {
      console.log("token exists, record updated")
      await db.none('UPDATE users SET team_id = $1, notifications_enabled = $2 WHERE token = $3', [
        teamId,
        notificationEnabled,
        token,
      ]);
    } else {
     // const elements = await fetchPlayerPicksAndSave(teamId);
      //if (elements !== null) {
        await db.none('INSERT INTO users (team_id, token, notifications_enabled, player_picks) VALUES ($1, $2, $3, $4)', [
          teamId,
          token,
          notificationEnabled,
          null
        ]);
        console.log("token doesnt exist, all record added");
      //} else {
       // await db.none('INSERT INTO users (team_id, token, notifications_enabled, player_picks) VALUES ($1, $2, $3, $4)', [
       //   teamId,
       //   token,
       //   notificationEnabled,
       //   null 
       // ]);
       // console.log("token doesnt exist, record added without player picks");
      //}
    }
  } catch (error) {
    console.error('Error saving token:', error);
  }
};

const fetchPlayerPicksAndSave = async (teamId: Number) => {
    const apiUrl = `https://fantasy.premierleague.com/api/entry/${teamId}/event/9/picks/`;
    try {
      const response = await axios.get(apiUrl);

      if (response.status === 200) {
          const picks = response.data.picks;
          const elements = picks.map((pick: { element: any; }) => pick.element);
          
          return elements
      } else {
          return null;
      }
  } catch (error) {
      return null;
  }
};

export const getToken = async (expoPushToken: string) => {
  try {
    console.log('Querying database for token:', expoPushToken); 
    const userData = await db.manyOrNone('SELECT team_id, notifications_enabled FROM users WHERE token = $1', [expoPushToken]);
    
    if (userData) {
      console.log('Retrieved user data from database:', userData);
      return userData;
    } else {
      throw new Error('User data not found for the provided token');
    }
  } catch (error) {
    console.error('Error retrieving user data:', error);
    throw error;
  }
};

export const getPushTokens = async (team_id: Number) => {
  console.log("received", team_id)
  const matchedUsers = await db.manyOrNone('SELECT * FROM users WHERE team_id = $1', [team_id]);
  const expoPushTokens = matchedUsers.map(user => user.token);
  console.log("got", expoPushTokens);
  return expoPushTokens;
} 

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
}

interface EventData {
  id: number;
  type_id: number;
  player_name: string | null;
  related_player_name: string | null;
  minute: number;
  result: string;
  addition: string;
}

const apiUrl = apiConnectionString;
let loggedEventIds: number[] = [];

async function fetchAndInsertEvents() {
  while(true) {
      let counter = 0;

      const response = await axios.get(apiUrl);
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
                  }, 45000);
                  await new Promise(resolve => setTimeout(resolve, 1000));
              } 
          }
      }
      const currentTime = new Date().toLocaleTimeString();
      console.log(`Script running at ${currentTime}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
  } 
} fetchAndInsertEvents();

async function checkAPIForId(id: number) {
  try {
      const response = await axios.get(apiUrl);
      const eventData = response.data.data;

      for (const event of eventData) {
          const events = event.events;
          const matchName = event.name;

          if (events) {
              for (const event of events) {
                  if (event.id === id) {
                      const {
                          type_id,
                      } = event;
                      const event_name = (typeMapping as any)[type_id] || 'Unknown';
                      const match_Name = matchName

                      CheckAndInsert(event, event_name, match_Name);
                      await new Promise(resolve => setTimeout(resolve, 1000));
                  }
              }
          } 
      } 
  } catch (error) {
      console.log(error)
  }
}

export const CheckAndInsert = async (event: EventData, event_name: string, match_Name: string) => {
  const eventData = event;
  const currentTime = new Date().toLocaleTimeString();

  if (eventData.player_name === null) {
      setTimeout (() => {
          checkAPIForId(eventData.id)
      }, 10000);
      console.log (eventData.id, "no player identifier, rechecking for data....");
  } else {
      const trimmedPlayerName = eventData.player_name.trim();
      const trimmedRelatedPlayerName = eventData.related_player_name ? eventData.related_player_name.trim() : null;
      
      if (trimmedPlayerName !==null){
          const playerMap = await db.oneOrNone('SELECT fpl_id FROM player_map WHERE player_name = $1', trimmedPlayerName);
          var player_id = playerMap ? playerMap.fpl_id : null;
      } else {
          player_id = null;
      }
      if (trimmedRelatedPlayerName !== null) {
          const relatedMap = await db.oneOrNone('SELECT fpl_id FROM player_map WHERE player_name = $1', trimmedRelatedPlayerName);
          var related_id = relatedMap ? relatedMap.fpl_id : null;
      } else {
          related_id = null;
      } 

      const exists = await db.oneOrNone('SELECT id FROM events WHERE smid = $1 AND type_id = $2', [eventData.id, eventData.type_id]);

      if (!exists) {
          await db.none(
              'INSERT INTO events (match_name, type_id, event_name, addition, player_name, player_id, related_player_name, related_id, minute, result, smid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
              [match_Name, eventData.type_id, event_name, eventData.addition, trimmedPlayerName, player_id, trimmedRelatedPlayerName, related_id, eventData.minute, eventData.result, eventData.id]
          );
          console.log("event successfully logged ", currentTime, eventData.id);
          await new Promise(resolve => setTimeout(resolve, 1000));
      } 
      else {
          await db.oneOrNone(
              'UPDATE events SET match_name = $1, type_id = $2, event_name = $3, addition = $4, player_name = $5, player_id = $6, related_player_name = $7, related_id = $8, minute = $9, result = $10 WHERE smid = $11',
              [match_Name, eventData.type_id, event_name, "Updated Event", trimmedPlayerName, player_id, trimmedRelatedPlayerName, related_id, eventData.minute, eventData.result, eventData.id]
          );
          console.log("event successfully updated ", currentTime, eventData.id);
          await new Promise(resolve => setTimeout(resolve, 1000));
      }
  }
}

export const getExpoPushTokens = async (player_id: number, related_id: number) => {
  try {
    const query = 'SELECT token FROM users WHERE $1 = ANY(player_picks) OR $2 = ANY(player_picks) AND notifications_enabled = true';
    const tokens = await db.map(query, [player_id, related_id], (row) => row.token);
    return(tokens)
  } catch (error) {
    console.error('Error getting Expo Push Tokens:', error);
    return [];
  }
};