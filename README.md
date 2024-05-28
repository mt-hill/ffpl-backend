## Code to the first project I built.
*This was the first project I made. I had no real idea what I was doing, just started hacking something together. The code is useful for probably nothing. The idea behind the app was useful and I may return to this and make version two now I have more knowledge and experience.*

#### I self-taught and did everything myself, backend, frontend, database, api, deployment

##### I'm not sure how it worked, but it did....

###### **https://flashfpl.com**

# The general logic worked like this:


        scans the the fantasy premier league api periodically

        compares each player against each player in my db

        if api != database, processes a new event

                adds to the event list and updates the player gw stats
        
                function elsewhere constantly checks event list for new events
        
                if new event is found
        
                        checks users table for teams with that particular player
                
                        sends notification of event to users



