## Code to the first project I built. Fantasy Premier League Notification App
*This was the first project I made. I had no real idea what I was doing, just started hacking something together to learn something new. The code is useful for probably nothing. The idea behind the app was useful and I may return to this in the future and make version two. More details an be found on the landing page https://flashfpl.com (APP is no longer active)*

#### I self-taught and did everything myself, backend, frontend, database, api, deployment

##### I'm not sure how it worked, but it did....

###### **https://flashfpl.com**

### The idea was this:


        scans the the fantasy premier league api periodically

        compares each players live stats against each player live stats in my database

        if player stats in api != player stats in database
                (for example, haaland scores a goal: API = Haaland Goals 1 || DB = Haaland Goals 0)
                adds to the event printer and updates the player stats in database
        
                another function is constantly checks event printer for new events
        
                if new event is found
        
                        checks app users table for user with haaland
                
                        sends notification of haalands goals to these users



