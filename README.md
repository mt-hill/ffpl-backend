## Backend code to my first project, a fantasy pl notification app 

#### I self-taught and did everything myself, backend, frontend, database, api, deployment

##### I'm not sure how it worked, but it did....

###### **https://flashfpl.com**

# How it worked


        scans the the fantasy premier league api periodically

        compares each player against each player in my db

        if api != database, processes a new event

                adds to the event list and updates the player gw stats
        
                function elsewhere constantly checks event list for new events
        
                if new event is found
        
                        checks users table for teams with that particular player
                
                        sends notification of event to users

