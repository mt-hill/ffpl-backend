## FlashFPL. Fantasy Premier League Notification App
*This was the first project I made which I had no real idea what I was doing. Just started building (or hacking) something together to learn something new. The code is useful for probably nothing. The idea behind the app was useful and I may return to this in the future and make a cleaner version. More details an be found here https://flashfpl.com (APP is no longer active)*

#### I self-taught and did everything myself for this. Backend, Frontend, Databases, API's and deploying to the cloud.

##### I'm not sure how I managed to make it work, but it did work.... with almost 400 downloads.

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



