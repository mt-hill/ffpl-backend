export const teamMap: TeamMap = {
    1: "Arsenal",
    2: "Aston Villa",
    3: "Bournemouth",
    4: "Brentford",
    5: "Brighton",
    6: "Burnley",
    7: "Chelsea",
    8: "Crystal Palace",
    9: "Everton",
    10: "Fulham",
    11: "Liverpool",
    12: "Luton",
    13: "Man City",
    14: "Man Utd",
    15: "Newcastle",
    16: "Nott'm Forest",
    17: "Sheffield Utd",
    18: "Spurs",
    19: "West Ham",
    20: "Wolves"
  };
export const positionMap: PositionMap = {
    1: "Goalkeeper",
    2: "Defender",
    3: "Midfielder",
    4: "Forward"
  };
export type TeamMap = {
    [key: number]: string;
  };
export type PositionMap = {
    [key: number]: string;
  };
export interface fixture {
  home: string,
  homes: number,
  away: string,
  aways: number
  };
export interface apiData {
    elementid: number,
    fixture: number,
    started: number,
    minutes: number,
    goals: number,
    assists: number,
    cleansheet: number,
    goalscon: number,
    owngoals: number,
    penssaved: number,
    pensmissed: number,
    yellow: number,
    red: number,
    saves: number,
    bonus: number,
    points: number,
  };
export interface dbData {
    elementid: number,
    fixture: number,
    goals: number,
    assists: number,
    cleansheet: number,
    goalscon: number,
    owngoals: number,
    penssaved: number,
    pensmissed: number,
    yellow: number,
    red: number,
    saves: number,
    bonus: number,
    points: number,
  };
export const bootstrapStatic = `https://fantasy.premierleague.com/api/bootstrap-static/`;
  


  