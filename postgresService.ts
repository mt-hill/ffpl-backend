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
    

    if (existingToken) { //existing user
      const elements = await fetchPlayerPicksAndSave(teamId);
      if (elements !== null) {
        console.log("token exists, record updated")
        await db.one('UPDATE users SET team_id = $1, notifications_enabled = $2, player_picks = $3 WHERE token = $4', [
          teamId,
          notificationEnabled,
          elements,
          token,
        ]);
      } else {
        console.log("token exists, record updated without player picks")
        await db.one('UPDATE users SET team_id = $1, notifications_enabled = $2, player_picks = $3 WHERE token = $4', [
          teamId,
          notificationEnabled,
          null,
          token,
        ]);
      };
    } else { // new users
      const elements = await fetchPlayerPicksAndSave(teamId);
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
    //was flagging error if elements are null
  }
};
//fetch new user player_picks and return to function above
const fetchPlayerPicksAndSave = async (teamId: Number) => {
    const apiUrl = `https://fantasy.premierleague.com/api/entry/${teamId}/event/11/picks/`;
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
  fixture_id: number;
  participant_id: number;
  player_name: string | null;
  related_player_name: string;
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
    try {
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
                  }, 50000);
                  await new Promise(resolve => setTimeout(resolve, 1000));
              } 
          }
      }
      const currentTime = new Date().toLocaleTimeString();
      console.log(`Script running at ${currentTime}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      console.log(error);
    };
  };
}; fetchAndInsertEvents();

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
      console.log(error);
  };
};
// STEP 3. PROCESSING AND INSERTING TO DATABASE
///////// CHECKS FOR PLAYER NAME, IF IT DOESNT EXIST, SENDS IT BACK UNTIL NAME IS ADDED
///////// TRIMS PLAYER/RELATED PLAYERS NAMES
///////// QUERIES DATABASE FOR DUPLICATE DATA. IF DUPLICATE, IGNORES. ELSE ADDS TO DB


async function CheckAndInsert(event: EventData, event_name: string, match_Name: string) { // this function inserts the event into the db
  const eventData = event;
  const currentTime = new Date().toLocaleTimeString();

  if (eventData.player_name === null) { //send data back to recheck for player name
      setTimeout (() => {
          checkAPIForId(eventData.id)
      }, 10000);
      console.log (eventData.id, "no player identifier, rechecking for data....");
  } else {
    const trimmedPlayerName = eventData.player_name.trim();
    const trimmedRelatedPlayerName = eventData.related_player_name ? eventData.related_player_name.trim() : null;
    const { player_id, related_id } = await getPlayerId (trimmedPlayerName, trimmedRelatedPlayerName);
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
    const correction = await db.oneOrNone('SELECT * FROM events WHERE smid = $1', [eventData.id]);
    
    try {
      if (!duplicate && !correction) { // check to see if its not a dupe or correction
          await db.none(
              'INSERT INTO events (match_name, type_id, event_name, addition, player_name, player_id, related_player_name, related_id, minute, result, smid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
              [match_Name, eventData.type_id, event_name, eventData.addition, trimmedPlayerName, player_id, trimmedRelatedPlayerName, related_id, eventData.minute, eventData.result, eventData.id]
          );
          console.log("event successfully logged ", currentTime, eventData.id);

          const goal = eventData.type_id == 14;
          const owngoal = eventData.type_id == 15; 
          const pen = eventData.type_id == 16;
          const sub = eventData.type_id == 18;
          const sent = eventData.type_id == 20 || eventData.type_id == 21;

          if (goal || owngoal || pen) { // this checks to see if a goals scored and sends the event to the next function
            await new Promise(resolve => setTimeout(resolve, 1000));
            checkScore(eventData);
          } else if ((sub || sent) && eventData.minute > 59){//this checks to see if a players subbed or sent off and sends the event to the next function
            await new Promise(resolve => setTimeout(resolve, 1000));
            checkScoreTwo(eventData, match_Name);
          } else {
            //if its anything else, ignore it
          };
          await new Promise(resolve => setTimeout(resolve, 1500));
      } else if (correction) { // if it exists and goal type, fix assist
        const lastcorrection = await db.oneOrNone('SELECT smid FROM events WHERE addition = $1 ORDER BY id DESC LIMIT 1', ['CORRECTION']);
        let correctionid = !lastcorrection ? 10000 : lastcorrection.smid + 1;

          if (correction.related_player_name == null && correction.related_player_name !== trimmedRelatedPlayerName) { // null to player
              await db.none( // add new correction db entry
                  'INSERT INTO events (match_name, type_id, event_name, addition, player _name, player_id, related_player_name, related_id, minute, result, smid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
                  [match_Name, 14, event_name, "CORRECTION", trimmedPlayerName, null, trimmedRelatedPlayerName, related_id, eventData.minute, eventData.result, correctionid]
              );
              console.log("assist added (previously null)", currentTime, correctionid);
              await db.one ( //update old db entry
                  'UPDATE events SET match_name = $1, type_id = $2, event_name = $3, addition = $4, player_name = $5, player_id = $6, related_player_name = $7, related_id = $8, minute = $9, result = $10 WHERE smid = $11',
                  [match_Name, eventData.type_id, event_name, eventData.addition, trimmedPlayerName, player_id, trimmedRelatedPlayerName, related_id, eventData.minute, eventData.result, eventData.id]
                );
              correctionid += 1;
              await new Promise(resolve => setTimeout(resolve, 1500)); 

              
          } else if (trimmedRelatedPlayerName !== correction.related_player_name && correction.related_player_name !== null) { //  player to different player
              await db.none( // add new correction db entry
                  'INSERT INTO events (match_name, type_id, event_name, addition, player_name, player_id, related_player_name, related_id, minute, result, smid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
                  [match_Name, 11, event_name, "CORRECTION", trimmedRelatedPlayerName, related_id, correction.related_player_name, correction.related_id, eventData.minute, eventData.result, correctionid]
                );
              console.log("assist corrected (wrong player)", currentTime, correctionid);
              await db.one ( //update old db entry
                  'UPDATE events SET match_name = $1, type_id = $2, event_name = $3, addition = $4, player_name = $5, player_id = $6, related_player_name = $7, related_id = $8, minute = $9, result = $10 WHERE smid = $11',
                  [match_Name, eventData.type_id, event_name, eventData.addition, trimmedPlayerName, player_id, trimmedRelatedPlayerName, related_id, eventData.minute, eventData.result, eventData.id]
                );
              correctionid += 1;
              await new Promise(resolve => setTimeout(resolve, 1500));

          } else {
              // do nothing here. add more instances of potential corrections
          };

      } else if (duplicate) { // if its a duplicate, ignore
          console.log(currentTime, "// duplicate event, ignored - ",  eventData.id);
          await new Promise(resolve => setTimeout(resolve, 1500));
      } else { };
    } catch (error) {};
  };
};

async function checkScoreTwo (eventData: EventData, match_Name: string) { // this function checks to see if the team conceded when a player is subbed
  try {
    const fixtureid = eventData.fixture_id;
    const participant = eventData.participant_id;
    const scoreUrl = `https://api.sportmonks.com/v3/football/fixtures/${fixtureid}?api_token=GEN2BiwqhnXlX0yb5vF1LKEgylNZv8g8TgYqSP2m3ywdgzda0xjQjmrWBGEw&include=participants;events;`;
    const responsecheck = await axios.get(scoreUrl);
    const checkData = responsecheck.data.data;

    let counter = 0;
    const event = checkData.events;

      for (const e of event) {
        const goal = (e.type_id == 14 || e.type == 15 || e.type_id == 16);

        if (e.participant_id !== participant && goal){
          counter +=1;
        } else{};
      };
    if (counter == 0){
      await new Promise(resolve => setTimeout(resolve, 5000));
      cleansheetConfirmed(eventData, match_Name);
    } else {

      //ignore
    };
  } catch (error){
    console.log("checkscoretwo function error")
  };
}

async function cleansheetConfirmed(eventData: EventData, match_Name: string) { //this function checks to see if its a defender or keeper whos subbed and sends cs confirmed event
  try {
  const csconfirmed = await db.oneOrNone('SELECT smid FROM events WHERE addition = $1 ORDER BY id DESC LIMIT 1', ['CS CONFIRMED']);
  let csconfirmedid: number = !csconfirmed ? 44444 : csconfirmed.smid + 1;

    const player = eventData.related_player_name.trim();
    const mapped = await db.one('SELECT * FROM player_map WHERE player_name = $1', [player]); //get the player details

    if (mapped.position == "Goalkeeper" || mapped.position == "Defender") { //if the player is a defender and hasnt been subbed, insert into database         
        const event = { type_id: 40, addition: "CS CONFIRMED", fixture_id: 0, participant_id: 0, player_name: player, related_player_name: 'null', minute: eventData.minute, result: 'null', id: csconfirmedid };
        
        const event_name = "Cleansheet Confirmed"
        CheckAndInsert(event, event_name, match_Name);
        csconfirmedid += 1;
        await new Promise(resolve => setTimeout(resolve, 1500));
    } 
  } catch(error){};
};

async function checkScore (eventD: EventData) { //this function checks to see if its the first goal and stops if it isnt the first goal
  try {
    const participant = eventD.participant_id
    const responsecheck = await axios.get(apiUrl);
    const checkData = responsecheck.data.data;
    let counter = 0;
    
    for (const check of checkData) {
      const event = check.events;

      for (const e of event) {
        const goal = (e.type_id == 14 || e.type_id == 15 || e.type_id == 16);
// need to fix own goals to make sure they arent missed
        if (e.participant_id == participant && goal){
          counter +=1;
        } else{};
      };
    };

    if (counter == 1){
      await new Promise(resolve => setTimeout(resolve, 5000));
      cleansheetLost(eventD);
    } else {};
  } catch (error){
    console.log(error)
  };
};

async function cleansheetLost (eventData: EventData) { // this function checks to see if the player is a def or gkp and sends noti
  const goalEvent = eventData;
  const fixtureid = goalEvent.fixture_id; 
  const csloss = await db.oneOrNone('SELECT smid FROM events WHERE addition = $1 ORDER BY id DESC LIMIT 1', ['CS LOST']);
  let cslossid: number = !csloss ? 33333 : csloss.smid + 1;

  try {
      const lineupUrl = `https://api.sportmonks.com/v3/football/fixtures/${fixtureid}?api_token=GEN2BiwqhnXlX0yb5vF1LKEgylNZv8g8TgYqSP2m3ywdgzda0xjQjmrWBGEw&include=lineups;`;
      const response = await axios.get(lineupUrl);
      const LineupData = response.data.data;
      const players = LineupData.lineups;
      const matchName = LineupData.name;

      for (const player of players) {
          if (player.team_id !== goalEvent.participant_id && player.formation_field !== null){ //if the player is on the conceding team and the player started

           
              const mapped = await db.one('SELECT * FROM player_map WHERE player_name = $1', [player.player_name.trim()]); //get the player details
              const subbed = await db.oneOrNone('SELECT * FROM events WHERE related_player_name = $1 AND type_id = $2', [player.player_name.trim(), 18]);
              const red = await db.oneOrNone('SELECT * FROM events WHERE player_name = $1 AND type_id = $2', [player.player_name.trim(), 20]);
              const twoyellow = await db.oneOrNone('SELECT * FROM events WHERE player_name = $1 AND type_id = $2', [player.player_name.trim(), 21]);

              if (mapped.position == "Goalkeeper" || mapped.position == "Defender") { //if the player is a defender or goalkeeper     
                  const event = {  type_id: 30, fixture_id: 0, participant_id: 0, addition: "CS LOST", player_name: player.player_name, related_player_name: 'null', minute: goalEvent.minute, result: goalEvent.result, id: cslossid};
                  const match_Name = matchName;
                  const event_name = "Cleansheet Lost" 

                  if (!subbed || !red || !twoyellow) {// check to see if they've been subbed or sent off, if not, add event
                      cslossid += 1;
                      CheckAndInsert(event, event_name, match_Name);
                      await new Promise(resolve => setTimeout(resolve, 1500));

                  } else if (subbed || red || twoyellow) { //if not ignore
                      // ignore, they didnt lose cleansheet
                  }
                  
              } else {}
          } 
      } 
    } catch (error) {}
};

async function getPlayerId (trimmedPlayerName: any, trimmedRelatedPlayerName: any) { //this function finds the player id
  let player_id;
  let related_id;

  const playerMap = await db.oneOrNone('SELECT fpl_id FROM player_map WHERE player_name = $1', trimmedPlayerName);
  player_id = playerMap ? playerMap.fpl_id : null;

  const relatedMap = await db.oneOrNone('SELECT fpl_id FROM player_map WHERE player_name = $1', trimmedRelatedPlayerName);
  related_id = relatedMap ? relatedMap.fpl_id : null;

  return { player_id, related_id };
};

////////////////// EVENT FETCHER END \\\\\\\\\\\\\\\\\\
////////////////// CORRECTION SECTION START \\\\\\\\\\\\\\\\\\
// STEP 1. GETS ALL EVENTS FROM API
async function apiEvents() {
  const data = [];
  try {
    const response = await axios.get(apiUrl);
    const eventData = response.data.data;

    for (const event of eventData) {
        const events = event.events;

        for (const ee of events) {
            data.push(ee);
        }
    } 
  } catch (error) {
    console.log(error);
  }
  return data;
};
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

async function compareData () { //this function checks for discrepencies and sends them to be corrected
  while (true) {
    try {
      const apiData = await apiEvents();
      
      if (apiData !== null) {
        for(const apie of apiData) {
            const id = apie.id;
            const dbe = await dbEvents(id);

            const VARcor = dbe.type_id == 10 && dbe.addition !== apie.addition;
            const assistTBA = dbe.type_id == 14 && dbe.smid == apie.id && dbe.related_player_name !== apie.related_player_name && dbe.addition !== 'CORRECTION';

            
            if (assistTBA) {  
              const event_name = dbe.event_name;
              const match_name = dbe.match_name;
              const event = apie;
              CheckAndInsert(event, event_name, match_name);
              await new Promise(resolve => setTimeout(resolve, 1000));
              
            } else if (VARcor) { 
              const index = loggedEventIds.indexOf(dbe.smid);
              if (index > -1) { 
                loggedEventIds.splice(index, 1); 
              }
              console.log("var event deleted from array");
              await db.one ('DELETE FROM events WHERE smid = $1', [dbe.smid]);
              await new Promise(resolve => setTimeout(resolve, 1000));
              
            } else {};
        }
      } else {
        console.log("nothing returned");
      };
    } catch (error) {
        console.log("no db entries need updating");
    } 
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}; compareData ();
////////////////// CORRECTION SECTION END \\\\\\\\\\\\\\\\\\

async function checkFT() { //checks full time clean sheets
  while (true){
      try {
          const ftUrl =
              'https://api.sportmonks.com/v3/football/fixtures/between/2023-11-04/2023-11-04?api_token=GEN2BiwqhnXlX0yb5vF1LKEgylNZv8g8TgYqSP2m3ywdgzda0xjQjmrWBGEw&include=scores;lineups;';

          const responsecheck = await axios.get(ftUrl);
          const games = responsecheck.data.data;


          for (const g of games) {
              const fixture_id = g.id;
              const logged = await db.oneOrNone('SELECT * FROM full_time WHERE fixture = $1', [fixture_id])

              if (g.state_id === 5 && !logged) {
                  let homeScore = 0;
                  let awayScore = 0;
                  let hometeam;
                  let awayteam;

                  for (const score of g.scores) {
                      if (score.description === "CURRENT") {
                          if (score.score.participant === "away") {
                              homeScore = score.score.goals;
                              awayteam = score.participant_id; 
                          } else {
                              awayScore = score.score.goals;
                              hometeam = score.participant_id;
                          };
                      };
                  };

                  if (homeScore === 0) {
                      console.log("");
                      console.log(`${g.name}: Home team hasn't conceded a goal.`);
                      for (const lineup of g.lineups) {
                          if (lineup.team_id == hometeam && lineup.formation_field !== null) {
                              const csconfirmed = await db.oneOrNone('SELECT smid FROM events WHERE addition = $1 ORDER BY id DESC LIMIT 1', ['CS CONFIRMED']);
                              let csconfirmedid: number = !csconfirmed ? 44444 : csconfirmed.smid + 1;
                            
                                const player = lineup.player_name.trim();
                                const mapped = await db.oneOrNone('SELECT * FROM player_map WHERE player_name = $1', [player]); //get the player details
                            
                                if (mapped && (mapped.position == "Goalkeeper" || mapped.position == "Defender")) { 
                                  
                                  const subbed = await db.oneOrNone('SELECT related_id FROM events WHERE related_id = $1 AND type_id = $2', [mapped.fpl_id, 18]);
                                  const sent = await db.oneOrNone('SELECT player_id FROM events WHERE player_id = $1 AND type_id = $2', [mapped.fpl_id, 20]);
                                  const senttwo = await db.oneOrNone('SELECT player_id FROM events WHERE player_id = $1 AND type_id = $2', [mapped.fpl_id, 21]);
                                  const subbedon = await db.oneOrNone('SELECT player_id FROM events WHERE player_id = $1 AND type_id = $2', [mapped.fpl_id, 18]);

                                  if (subbed || sent || senttwo || subbedon){
                                      //ignore
                                 } else {
                                      const event = {  type_id: 50, fixture_id: 0, participant_id: 0, addition: "CS CONFIRMED", player_name: player, related_player_name: 'null', minute: 90, result: 'null', id: csconfirmedid};
                                      const match_Name = g.name;
                                      const event_name = "Cleansheet Lost" 
                                      CheckAndInsert(event, event_name, match_Name);
                                      csconfirmedid += 1;
                                      await new Promise(resolve => setTimeout(resolve, 1500));
                                  }
                                }; 
                          };
                      };
                  };
                  if (awayScore === 0) {
                      console.log("");
                      console.log(`${g.name}: Away team hasn't conceded a goal.`);
                      for (const lineup of g.lineups) {
                          if (lineup.team_id == awayteam && lineup.formation_field !== null) {

                              const csconfirmed = await db.oneOrNone('SELECT smid FROM events WHERE addition = $1 ORDER BY id DESC LIMIT 1', ['CS CONFIRMED']);
                              let csconfirmedid: number = !csconfirmed ? 44444 : csconfirmed.smid + 1;
                            
                                const player = lineup.player_name.trim();
                                const mapped = await db.oneOrNone('SELECT * FROM player_map WHERE player_name = $1', [player]); //get the player details
                            
                                if (mapped && (mapped.position == "Goalkeeper" || mapped.position == "Defender")) { 
                                  
                                  const subbed = await db.oneOrNone('SELECT related_id FROM events WHERE related_id = $1 AND type_id = $2', [mapped.fpl_id, 18]);
                                  const sent = await db.oneOrNone('SELECT player_id FROM events WHERE player_id = $1 AND type_id = $2', [mapped.fpl_id, 20]);
                                  const senttwo = await db.oneOrNone('SELECT player_id FROM events WHERE player_id = $1 AND type_id = $2', [mapped.fpl_id, 21]);
                                  const subbedon = await db.oneOrNone('SELECT player_id FROM events WHERE player_id = $1 AND type_id = $2', [mapped.fpl_id, 18]);

                                  if (subbed || sent || senttwo || subbedon){
                                      //ignore
                                   } else {
                                      const event = { type_id: 50, fixture_id: 0, participant_id: 0, addition: "CS CONFIRMED", player_name: player, related_player_name: 'null', minute: 90, result: 'null', id: csconfirmedid};
                                      const match_Name = g.name;
                                      const event_name = "Cleansheet Lost" 
                                      CheckAndInsert(event, event_name, match_Name);
                                      csconfirmedid += 1;
                                      await new Promise(resolve => setTimeout(resolve, 1500));
                                  }
                                  
                                }; 
                          };
                      };
                  };
                  await db.none('INSERT INTO full_time (fixture) VALUES ($1)', [fixture_id]);
              } else {
              }
          };
      } catch (error) {
          console.error(error);
      }
      await new Promise(resolve => setTimeout(resolve, 200000));
      console.log("fulltime script running")
  };
} checkFT();
