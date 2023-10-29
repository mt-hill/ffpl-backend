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

////////////////// TOKEN QUERIES START \\\\\\\\\\\\\\\\\\
//save new user token
export const saveToken = async (teamId: Number, token: string, notificationEnabled: Boolean) => {
  try {
    const existingToken = await db.oneOrNone('SELECT token FROM users WHERE token = $1', [token]);
    const elements = await fetchPlayerPicksAndSave(teamId)

    if (existingToken) {
      console.log("token exists, record updated")
      await db.none('UPDATE users SET team_id = $1, notifications_enabled = $2, player_picks = $3 WHERE token = $4', [
        teamId,
        notificationEnabled,
        elements,
        token,
      ]);
    } else {
      if (elements !== null) {
          await db.none('INSERT INTO users (team_id, token, notifications_enabled, player_picks) VALUES ($1, $2, $3, $4)', [
          teamId,
          token,
          notificationEnabled,
          elements
        ]);
        console.log("token doesnt exist, all record added");
      } else {
          await db.none('INSERT INTO users (team_id, token, notifications_enabled, player_picks) VALUES ($1, $2, $3, $4)', [
          teamId,
          token,
          notificationEnabled,
          null 
        ]);
        console.log("token doesnt exist, record added without player picks");
      }
    }
  } catch (error) {
    console.error('Error saving token:', error);
  }
};
//fetch new user player_picks and return to function above
const fetchPlayerPicksAndSave = async (teamId: Number) => {
    const apiUrl = `https://fantasy.premierleague.com/api/entry/${teamId}/event/10/picks/`;
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
//query database for existing user
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
//gets tokens for notifications******
export const getPushTokens = async (team_id: Number) => {
  console.log("received", team_id)
  const matchedUsers = await db.manyOrNone('SELECT * FROM users WHERE team_id = $1', [team_id]);
  const expoPushTokens = matchedUsers.map(user => user.token);
  console.log("got", expoPushTokens);
  return expoPushTokens;
} 
//fetch and return tokens to index for notifications
export const getExpoPushTokens = async (player_id: number, related_id: number) => {
  try {
    const query = 'SELECT token FROM users WHERE ($1 = ANY(player_picks) OR $2 = ANY(player_picks)) AND notifications_enabled = true';
    const tokens = await db.map(query, [player_id, related_id], (row) => row.token);
    return(tokens)
  } catch (error) {
    console.error('Error getting Expo Push Tokens:', error);
    return [];
  }
};

//\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\ TOKEN QUERIES END \/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/
//\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\ EVENT FETCHER START \/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/


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
// STEP 1. SCAN API FOR EVENTS
/////////  SEND EVENT TO NEXT FUNCTION AND LOG THE ID
const apiUrl = apiConnectionString;
let loggedEventIds: number[] = [];

async function fetchAndInsertEvents() {
  while(true) {
      const response = await axios.get(apiUrl);
      const eventData = response.data.data;

      for (const event of eventData) {
          const events = event.events;

          for (const subEvent of events) {
              const id = subEvent.id;

              if (!loggedEventIds.includes(id)) {
                  console.log("event logged", id);
                  loggedEventIds.push(id);

                  setTimeout(() => {
                      checkAPIForId(id);
                  }, 35000);
                  await new Promise(resolve => setTimeout(resolve, 1000));
              } 
          }
      }
      const currentTime = new Date().toLocaleTimeString();
      console.log(`Script running at ${currentTime}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
  } 
} fetchAndInsertEvents();

// STEP 2. RESCANS API FOR EVENT, GETS LATEST/UPDATED DATA
/////////  SEND EVENT TO NEXT FUNCTION AND LOG THE ID
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
// STEP 3. PROCESSING AND INSERTING TO DATABASE
///////// CHECKS FOR PLAYER NAME, IF IT DOESNT EXIST, SENDS IT BACK UNTIL NAME IS ADDED
///////// TRIMS PLAYER/RELATED PLAYERS NAMES
///////// QUERIES DATABASE FOR DUPLICATE DATA. IF DUPLICATE, IGNORES. ELSE ADDS TO DB


async function CheckAndInsert(event: EventData, event_name: string, match_Name: string) {
  const eventData = event;
  const currentTime = new Date().toLocaleTimeString();

  const lastcorrection = await db.oneOrNone('SELECT smid FROM events WHERE addition = $1 ORDER BY id DESC LIMIT 1', ['CORRECTION']);
  let correctionid = !lastcorrection ? 10000 : lastcorrection.smid + 1;

  if (eventData.player_name === null) { //send data back to recheck for player name
      setTimeout (() => {
          checkAPIForId(eventData.id)
      }, 10000);
      console.log (eventData.id, "no player identifier, rechecking for data....");

  } else { // if its got a player name, process
    // STEP 1. Trim names and find ID
    const trimmedPlayerName = eventData.player_name.trim();
    const trimmedRelatedPlayerName = eventData.related_player_name ? eventData.related_player_name.trim() : null;
    let player_id = null;
    let related_id = null;
    try {
      if (trimmedPlayerName !== null) {
          const playerMap = await db.oneOrNone('SELECT fpl_id FROM player_map WHERE player_name = $1', trimmedPlayerName);
          player_id = playerMap ? playerMap.fpl_id : null;
      }
      if (trimmedRelatedPlayerName !== null) {
          const relatedMap = await db.oneOrNone('SELECT fpl_id FROM player_map WHERE player_name = $1', trimmedRelatedPlayerName);
          related_id = relatedMap ? relatedMap.fpl_id : null;
      }
      // STEP 2. CHECK FOR STATUS
      const duplicate = await db.oneOrNone('SELECT id FROM events WHERE match_name = $1 AND type_id = $2 AND event_name = $3 AND addition = $4 AND player_name = $5 AND player_id = $6 AND related_player_name = $7 AND related_id = $8 AND minute = $9',
          [
              match_Name, 
              eventData.type_id, 
              event_name, 
              eventData.addition,
              trimmedPlayerName, 
              player_id, 
              trimmedRelatedPlayerName, 
              related_id, 
              eventData.minute
          ]);
      const correction = await db.oneOrNone('SELECT * from events WHERE smid = $1', [eventData.id]);

      // STEP 3. INSERT OR IGNORE RELEVENT EVENTS
      if (duplicate == null && correction == null) { // check to see if its not a dupe or correction
         // then check to see if its not a sub === standard insert
          await db.none(
              'INSERT INTO events (match_name, type_id, event_name, addition, player_name, player_id, related_player_name, related_id, minute, result, smid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
              [match_Name, eventData.type_id, event_name, eventData.addition, trimmedPlayerName, player_id, trimmedRelatedPlayerName, related_id, eventData.minute, eventData.result, eventData.id]
          );
          console.log("event successfully logged ", currentTime, eventData.id);
          await new Promise(resolve => setTimeout(resolve, 1000)); 
      } else if (correction !== null) { // if it exists and goal type, fix assist
          if (correction.related_player_name == null && correction.related_player_name !== trimmedRelatedPlayerName) { // null to player
              await db.none(
              'INSERT INTO events (match_name, type_id, event_name, addition, player_name, player_id, related_player_name, related_id, minute, result, smid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
              [match_Name, 14, event_name, "CORRECTION", trimmedPlayerName, null, trimmedRelatedPlayerName, related_id, eventData.minute, eventData.result, correctionid]
              );
              console.log("assist added (previously null)", currentTime, correctionid);
              correctionid += 1;
              await new Promise(resolve => setTimeout(resolve, 1000));     
          } else if (trimmedRelatedPlayerName !== correction.related_player_name && correction.related_player_name !== null) { //  player to different player
              await db.none(
                  'INSERT INTO events (match_name, type_id, event_name, addition, player_name, player_id, related_player_name, related_id, minute, result, smid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
                  [match_Name, 11, event_name, "CORRECTION", trimmedRelatedPlayerName, related_id, correction.related_player_name, correction.related_id, eventData.minute, eventData.result, correctionid]
                );
              console.log("assist corrected (wrong player)", currentTime, correctionid);
              correctionid += 1;
              await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
              // do nothing here. add more instances of potential corrections
          };
      } else if (duplicate) { // if its a duplicate, ignore
          console.log(currentTime, "// duplicate event, ignored - ",  eventData.id);
          await new Promise(resolve => setTimeout(resolve, 1000));
      } else { };
  } catch (error) {
      console.log(error)
  }
  }
}

////////////////// EVENT FETCHER END \\\\\\\\\\\\\\\\\\
////////////////// CORRECTION SECTION START \\\\\\\\\\\\\\\\\\
// STEP 1. GETS ALL EVENTS FROM API
async function apiEvents() {
  const response = await axios.get(apiUrl);
  const eventData = response.data.data;

  const data = [];
  for (const event of eventData) {
      const events = event.events;

      for (const ee of events) {
          data.push(ee);
      }
  } 
  return data;
}
// STEP 2. GETS EVENT DATA FROM DATA
async function dbEvents (dbid: number) {
  try {        
      const events = await db.one(
          'SELECT * FROM events WHERE smid = $1;', 
          [dbid]
      );
      return events;
  } catch {}
}
// MAIN LOOP, CALLS BOTH PREVIOUS FUNCTIONS
// IF A CORRECTION IS REQUIRED, INSERTS INTO DB
let loggedCorrected: number[] = [];
async function compareData () {
  while (true) {
    try {
        const apiData  = await apiEvents();
        for(const apie of apiData) {
            const id = apie.id;
            const dbe = await dbEvents(id);

            const VARcor = dbe.type_id == 10 && dbe.addition !== apie.addition;
            const assistTBA = dbe.type_id == 14 && dbe.smid == apie.id && dbe.related_player_name !== apie.related_player_name && dbe.addition !== 'CORRECTION';
            
            if (assistTBA && !loggedCorrected.includes(apie.id)) {  
              const event_name = dbe.event_name;
              const match_name = dbe.match_name;
              const event = apie;
              CheckAndInsert(event, event_name, match_name);
              loggedCorrected.push(apie.id);
              await new Promise(resolve => setTimeout(resolve, 1000));
              
            } else if (VARcor) { 
              const index = loggedEventIds.indexOf(dbe.smid);
              if (index > -1) { 
                loggedEventIds.splice(index, 1); 
              }
              console.log("var event deleted from array");
              await db.one ('DELETE FROM events WHERE smid = $1', [dbe.smid]);

              await new Promise(resolve => setTimeout(resolve, 1000));
              
            } else {
              
            };
        }
    } catch (error) {
        console.log("no db entries need updating");
    } 
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}; compareData ();

////////////////// CORRECTION SECTION END \\\\\\\\\\\\\\\\\\