import axios from 'axios';
import db from './dbCon';
import { teamMap, positionMap, bootstrapStatic, apiData, dbData } from './consts';

///////////  SAVES NEW USERS TOKENS /////////// 
export const saveToken = async (teamId: Number, token: string, notificationEnabled: Boolean) => {
  try {
    const existingToken = await db.oneOrNone('SELECT token FROM users WHERE token = $1', [token]);
    if (existingToken) { //existing user
      const elements = await getPlayerPicks(teamId);
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
      const elements = await (teamId);
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
/////////// GETS EXISTING USERS TOKEN /////////// 
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












// VARS
export let gameweek =  19;
let updated = false;












/////////// MAIN LOOP AND CONTROL FUNCTIONS /////////// 
async function controller(){
  while (true){
    try{
      const response = await axios.get(`https://fantasy.premierleague.com/api/event/${gameweek}/live/`);
      const players = response.data.elements;

      if (players.length === 0) {
        console.log(`Gameweek${gameweek} not started yet...`)
      }
      else {
        if (!updated){ 
          await db.manyOrNone ("DELETE FROM scores");
          await db.manyOrNone ("DELETE FROM events");
          await db.manyOrNone ("DELETE FROM gwstats");
          await loadGwStats();
          await loadScores();
          await updateUsersPlayerPicks(); 
          updated = true;
          console.log("db updated for gw", gameweek);
        };

        const gwInplay = await checkInplay();
        if (gwInplay){
          await mainLoop();
        } else {
          await endGW();
        };
      };
    } catch (error){
      console.log("FPL UPDATING...");
    };
    await new Promise(resolve => setTimeout(resolve, 30000));
  };
}; controller ();
async function checkInplay(){
  let inplay = false;
  try {
    const fixtures = await axios.get(`https://fantasy.premierleague.com/api/fixtures/?event=${gameweek}`);
    const games = fixtures.data;
    for (const game of games) {
      if (game.finished === false){
          inplay = true;
      };
    };
    if (inplay === true){
      return true;
    } else if (inplay === false){
      return false;
    };
  } catch (error) {
    console.log(error);
  };
};
async function mainLoop(){ 
  try {
    const apiData = await apiScanner();
    if (apiData) {
      for (const apiPlayer of apiData){ 
        const dbPlayer = await dbScanner(apiPlayer.elementid);
        if (dbPlayer){
          await compareData(apiPlayer, dbPlayer); 
        } else {
          await addPlayerToDB(apiPlayer.elementid, apiPlayer.fixture);
        }; 
      };
    }
  } catch (error) {
    console.log("mainLoop()", error);
  };
  console.log("script running"); 
};
async function endGW(){
  gameweek++;
  updated = false;
  await db.manyOrNone ("UPDATE users SET notifications_enabled = false");
  console.log("gameweek week finished, now gameweek = ", gameweek);
};












///////////  FUNCTIONS TO PREPARE DATABASE FOR NEW GAMEWEEK /////////// 
async function loadScores(){
  try {
    const response = await axios.get(`https://fantasy.premierleague.com/api/fixtures/?event=${gameweek}`);
    const fixtures = response.data;

    for (const fixture of fixtures) {
      const home = (teamMap)[fixture.team_h];
      const away = (teamMap)[fixture.team_a];

      await db.none("INSERT INTO scores (fixtureid, homeid, hometeam, homescore, awayscore, awayteam, awayid) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [fixture.id, fixture.team_h, home, 0, 0, away, fixture.team_a]);    
    };
  } catch (error) {
    console.log("Error checking fixtures:", error);
    return false;
  }; 
};
async function loadGwStats(){
  try {
    const response = await axios.get(`https://fantasy.premierleague.com/api/event/${gameweek}/live/`);
    const players = response.data.elements;

    for (const player of players){
      const {
              id: elementId,
              stats: {
                minutes: minutes,
                goals_scored: goals,
                assists: assists,
                clean_sheets: cleansheet,
                goals_conceded: goalsCon,
                own_goals: ownGoals,
                penalties_saved: pensSaved,
                penalties_missed: pensMissed,
                yellow_cards: yellow,
                red_cards: red,
                saves: saves,
                bonus: bonus,
                starts: started,
                total_points: points
              },
              explain: [{
                fixture,
              }],
      } = player; // Relevent player data

      await db.none('INSERT INTO gwstats (elementId, fixture, goals, assists, cleansheet, goalsCon, ownGoals, pensSaved, pensMissed, yellow, red, saves, bonus, points) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);',
      [elementId, fixture, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    };
    console.log("loadDB() success, gwstats table loaded");
  } catch (error){
    console.log(error);
  };
}; 
/////////// ITERATES THROUGH EACH USER IN THE DATABASE AND ADDS THEIR CURRENT GAMEWEEK PICKS /////////// 
async function updateUsersPlayerPicks(){
  try {
    const users = await db.many('SELECT team_id FROM users');

    for (const user of users) {
      const teamId = user.team_id;
      const elements = await getPlayerPicks(teamId);

      await db.none('UPDATE users SET player_picks = $1 WHERE team_id = $2', [elements, teamId]);
    };
    console.log("success updateUSerPlayerPicks() completed");
  } catch(error){
    console.log("error", error);
  };
};
/////////// GETS USERS PLAYER PICKS FOR EACH TEAM, SENDS BACK TO FUNCTION ABOVE /////////// 
async function getPlayerPicks (teamId: Number){
  try {
    const response = await axios.get(`https://fantasy.premierleague.com/api/entry/${teamId}/event/${gameweek}/picks/`);

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












/////////// COMPARES API DATA VS DATABASE DATA TO CHECK IF THERES A DISCREPENCY /////////// 
async function compareData(apiData: apiData, dbData: dbData){
  try {
    const apiValues: Record <string, number> = { 
      goals: apiData.goals,
      assists: apiData.assists,
      cleansheet: apiData.cleansheet,
      goalscon: apiData.goalscon,
      owngoals: apiData.owngoals,
      penssaved: apiData.penssaved,
      pensmissed: apiData.pensmissed,
      yellow: apiData.yellow,
      red: apiData.red,
      saves: apiData.saves,
      bonus: apiData.bonus
    };
    const dbValues: Record <string, number> = {
      goals: dbData.goals,
      assists: dbData.assists,
      cleansheet: dbData.cleansheet,
      goalscon: dbData.goalscon,  
      owngoals: dbData.owngoals,
      penssaved: dbData.penssaved,
      pensmissed: dbData.pensmissed,
      yellow: dbData.yellow,
      red: dbData.red,
      saves: dbData.saves,
      bonus: dbData.bonus
    };
    for (const key in apiValues){
      if (apiValues[key] > dbValues[key]){
        await processEvent(apiData, key);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else if (apiValues[key] < dbValues[key]) {
        await removeEvent(apiData, key);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    };
  } catch (error){
    console.log("compareData()", error)
  };
};
///////////  DATABASE SCANNER /////////// 
async function dbScanner(id: number){
  try {        
    const events = await db.oneOrNone(
      'SELECT * FROM gwstats WHERE elementid = $1;', // Gets all data for specific player
      [id]);

    if (events){
      return events; // Returns the data
    } else {
      return null;
    };

  } catch (error){
    console.log("dbScanner", error);
  };
};
///////////  API SCANNER /////////// 
async function apiScanner(){ 
  const playerData = [];
  try {
    const response = await axios.get(`https://fantasy.premierleague.com/api/event/${gameweek}/live/`);
    const players = response.data.elements;

    for (const player of players){
      const {
          id: elementid,
          stats: {
            minutes: minutes,
            goals_scored: goals,
            assists: assists,
            clean_sheets: cleansheet,
            goals_conceded: goalscon,
            own_goals: owngoals,
            penalties_saved: penssaved,
            penalties_missed: pensmissed,
            yellow_cards: yellow,
            red_cards: red,
            saves: saves,
            bonus: bonus,
            starts: started,
            total_points: points
          },
          explain: [{
            fixture,
          } = { fixture: 0 }],
        } = player;

      if (started === 1 || minutes > 0){ 
        playerData.push({
            elementid,
            fixture,
            started,
            minutes,
            goals,
            assists,
            cleansheet,
            goalscon,
            owngoals,
            penssaved,
            pensmissed,
            yellow,
            red,
            saves,
            bonus,
            points,
        });
      };
    };
    return playerData; 
  } catch (error){
    console.log("apiScanner()", error);
    return null;
  };
};












/////////// PROCESSES NEW EVENTS, SENDS TO ADDEVENT() AND UPDATES THE SCORE /////////// 
async function processEvent(apiData: apiData, key: string){
  try{
    if (key === "goals"){
      await updateScores("Goal", apiData.elementid, apiData.fixture);
      await addEvent("Goal", apiData.elementid, apiData.fixture);
    } 
    else if (key === "assists"){
      addEvent("Assist",  apiData.elementid, apiData.fixture);
    } 
    else if (key === "owngoals"){
      await updateScores("OG", apiData.elementid, apiData.fixture);
      await addEvent("Own Goal",  apiData.elementid, apiData.fixture);
    } 
    else if (key === "cleansheet"){
      const defgkp = await db.oneOrNone('SELECT * FROM playermap WHERE (position = $1 OR position = $2) AND elementid = $3', ["Defender", "Goalkeeper", apiData.elementid]);
      if (defgkp){
      addEvent("Cleansheet Added",  apiData.elementid, apiData.fixture);
      };    
    } 
    else if (key === "goalscon"){
      const defgkp = await db.oneOrNone('SELECT * FROM playermap WHERE (position = $1 OR position = $2) AND elementid = $3', ["Defender", "Goalkeeper", apiData.elementid]);
      if (apiData.goalscon === 1 && defgkp){
      addEvent("Cleansheet Lost",  apiData.elementid, apiData.fixture);
      };
    } 
    else if (key === "penssaved"){
      addEvent("Penalty Saved", apiData.elementid, apiData.fixture);
    } 
    else if (key === "pensmissed"){
      addEvent("Penalty Missed", apiData.elementid, apiData.fixture);
    } 
    else if (key === "yellow"){
      addEvent("Yellow Card", apiData.elementid, apiData.fixture);
    } 
    else if (key === "red"){
      addEvent("Red Card", apiData.elementid, apiData.fixture);
    } 
    else if (key === "bonus"){
      if (apiData.bonus === 3){
        addEvent("3 Bonus Points", apiData.elementid, apiData.fixture);
      } else if (apiData.bonus === 2) {
        addEvent("2 Bonus points", apiData.elementid, apiData.fixture);
      } else if (apiData.bonus === 1) {
        addEvent("1 Bonus points", apiData.elementid, apiData.fixture);
      };
    };
    updatePlayerGwStats(apiData);
  } catch(error){
    console.log("ProcessEvent()", error);
  };
};
/////////// UPDATES SCORE FOR MATCH IN SCORES TABLE /////////// 
async function updateScores(key: string, elementid: number, fixture: number){

  const scores = await db.one("SELECT * FROM scores where fixtureid = $1", fixture);
  const team = await db.one("SELECT * FROM playermap WHERE elementid = $1", elementid);

  if (key == "Goal"){
    if(team.team === scores.hometeam){
      const newscore = scores.homescore + 1;
      await db.none('UPDATE scores SET homescore = $1 WHERE fixtureid = $2', [newscore, fixture]);
    } else if (team.team === scores.awayteam){
      const newscore = scores.awayscore + 1;
      await db.none('UPDATE scores SET awayscore = $1 WHERE fixtureid = $2', [newscore, fixture]);
    }
  } else if (key == "OG") {
    if(team.team === scores.hometeam){
      const newscore = scores.awayscore + 1;
      await db.none('UPDATE scores SET awayscore = $1 WHERE fixtureid = $2', [newscore, fixture]);
    } else if (team.team === scores.awayteam){
      const newscore = scores.homescore + 1;
      await db.none('UPDATE scores SET homescore = $1 WHERE fixtureid = $2', [newscore, fixture]);
    }
  } else if (key == "NoOG") {
    if(team.team === scores.hometeam){
      const newscore = scores.awayscore - 1;
      await db.none('UPDATE scores SET awayscore = $1 WHERE fixtureid = $2', [newscore, fixture]);
    } else if (team.team === scores.awayteam){
      const newscore = scores.homescore - 1;
      await db.none('UPDATE scores SET homescore = $1 WHERE fixtureid = $2', [newscore, fixture]);
    }
  } else if (key == "NoGoal") {
    if(team.team === scores.hometeam){
      const newscore = scores.homescore - 1;
      await db.none('UPDATE scores SET homescore = $1 WHERE fixtureid = $2', [newscore, fixture]);
    } else if (team.team === scores.awayteam){
      const newscore = scores.awayscore - 1;
      await db.none('UPDATE scores SET awayscore = $1 WHERE fixtureid = $2', [newscore, fixture]);
    };
  };
};
/////////// ADDS EVENT TO EVENT PRINTER THEN CALLS UPDATEPLAYERGWSTATS() /////////// 
async function addEvent(event: string, elementid: number, fixture: number){
  try {
    const playerDetails = await db.oneOrNone('SELECT * FROM playermap WHERE elementid = $1', elementid);
    const playerName = playerDetails.name;
    const fix = await db.one("SELECT * FROM scores WHERE fixtureid = $1", [fixture]);

    if (playerDetails){ 

      await db.none('INSERT INTO events(fixture, name, event, sent) VALUES ($1, $2, $3, $4)',
      [`${fix.hometeam} vs ${fix.awayteam}`, playerName, event, false]);
      console.log(`${fix.hometeam} ${fix.homescore} - ${fix.awayscore} ${fix.awayteam} --`, playerName, event, false);
      await new Promise(resolve => setTimeout(resolve, 2000));
    };

  } catch (error){
    console.log("addEvent()", error);
  };
};
/////////// UPDATES PLAYER STATS FOR THE GAMEWEEK /////////// 
async function updatePlayerGwStats(apiData: apiData){
  try{
    await db.none("UPDATE gwstats SET goals = $2, assists = $3, cleansheet = $4, goalscon = $5, owngoals = $6, penssaved = $7, pensmissed = $8, yellow = $9, red = $10, saves = $11, bonus = $12, points = $13 WHERE elementid = $1",
    [apiData.elementid, apiData.goals, apiData.assists, apiData.cleansheet, apiData.goalscon, apiData.owngoals, apiData.penssaved, apiData.pensmissed, apiData.yellow, apiData.red, apiData.saves, apiData.bonus, apiData.points]);
    console.log("GWSTATS UPDATED")
  } catch(error){
    console.log("updateDB()", error);
  };
};
/////////// REMOVES ANY EVENT FROM DATABAS (E.G. ASSIST REMOVED) /////////// 
async function removeEvent (apiData: apiData, key: string){
  try{
    if (key === "goals"){
      await updateScores("NoGoal", apiData.elementid, apiData.fixture);
      await addEvent("[CORRECTION] Goal Removed", apiData.elementid, apiData.fixture);
    } 
    else if (key === "assists"){
      addEvent("[CORRECTION] Assist Removed",  apiData.elementid, apiData.fixture);
    } 
    else if (key === "owngoals"){
      await updateScores("NoOG", apiData.elementid, apiData.fixture);
      await addEvent("[CORRECTION] Own Goal Removed",  apiData.elementid, apiData.fixture);
    } 
    else if (key === "goalscon"){
      const defgkp = await db.oneOrNone('SELECT * FROM playermap WHERE (position = $1 OR position = $2) AND elementid = $3', ["Defender", "Goalkeeper", apiData.elementid]);
      if (apiData.goalscon === 0 && defgkp){
      addEvent("[CORRECTION] Goal Removed",  apiData.elementid, apiData.fixture);
      };
    } 
    else if (key === "penssaved"){
      addEvent("[CORRECTION] Penalty Save Removed", apiData.elementid, apiData.fixture);
    } 
    else if (key === "pensmissed"){
      addEvent("[CORRECTION] Penalty Miss Removed", apiData.elementid, apiData.fixture);
    } 
    else if (key === "red"){
      addEvent("[CORRECTION] Red Card Removed", apiData.elementid, apiData.fixture);
    } 
    updatePlayerGwStats(apiData);
  } catch(error){
    console.log("ProcessEvent()", error);
  };
};










/////////// GETS ARRAY OF USERS WHO HAVE THE PLAYER INVOLVED IN THE EVENT /////////// 
export const getExpoPushTokens = async (player_id: number) => {
  try {
    const query = 'SELECT token FROM users WHERE $1 = ANY(player_picks) AND notifications_enabled = true';
    const tokens = await db.map(query, [player_id], (row) => row.token);
    return(tokens);
  } catch (error) {
    console.error('Error getting Expo Push Tokens:', error);
    return [];
  }
}; 
/////////// ADDS ANY NEW PLAYERS TO THE DATABASE /////////// 
async function addPlayerToDB(id: Number, fixture: Number){
  try{
  await db.none('INSERT INTO gwstats(elementid, fixture, goals, assists, cleansheet, goalscon, owngoals, penssaved, pensmissed, yellow, red, saves, bonus, points) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
  [id, fixture, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  console.log(id, "added to gwstats")
  await addPlayerToMap(id);
  } catch(error){
    console.log("addPlayerToDB()", error)
  };
};
//// SAME AS ABOVE FOR PLAYERMAP TABLE ////
async function addPlayerToMap(id: Number){
  try{
    const response = await axios.get(bootstrapStatic);
    const elements = response.data.elements;
          
    for (const element of elements) {
      if (element.id === id){
        const name = element.web_name;
        const team = (teamMap)[element.team];
        const position = (positionMap)[element.element_type];
        const elementid = element.id;

        await db.none('INSERT INTO playerMap (elementid, name, team, position) VALUES ($1, $2, $3, $4)',
        [elementid, name, team, position]);
        console.log("added to playermap", elementid, name, team, position);
      };
    };
  } catch(error){
      console.log("getElement()", error);
  };
};




