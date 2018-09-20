# twitch-auth
Utility module for handling Twitch.tv chatbot authentication. The authentication process is detailed [here](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#oauth-authorization-code-flow).

# exports
The following functions are exported by the module.

## getUserAccessToken(creds, code)
Gets a user access token required for login (using [tmi.js](https://www.npmjs.com/package/tmi.js) for example).
This should be used once after the initial authorization step. Subsequent logins should use the token refresh process.

`creds` is an object structured as follows:
```
{
"client_id": <your client ID>,
"client_secret": <your client secret>
}
```

`code` is the OAuth 2.0 authorization code returned by Twitch.

Returns a Promise that resolves to an object parsed from the JSON returned from the server, or rejects with an error. The returned object looks like this:
```
{
  "access_token": "<user access token>",
  "refresh_token": "<refresh token>",
  "expires_in": <number of seconds until the token expires>,
  "scope": "<your previously listed scope(s)>",
  "token_type": "bearer"
}
```

## refreshUserAccessToken(creds, refreshToken)
Gets a new (refreshed) user access token for login.

`creds` ...same as above.

`refreshToken` is the refresh_token returned from the server in calls to
[getUserAccessToken()](#getuseraccesstokencreds-code) and/or
[refreshUserAccessToken()](#refreshuseraccesstokencreds-refreshtoken).

## getAppAccessToken(creds)
Gets an app access token. This is not applicable to chat login, but I wrote the function before I realized that :P

`creds` ...same as above.

# example code
This is basically what I use to launch my chat bot.
It is derived from Twitch's echo/haiku sample and has been built up from there (with the twitch-auth module being refactored out of it).
It uses a local Redis server to cache access/refresh tokens. Run it initially with `-c <auth code>` to get your first user access token.
After that, it will automatically refresh tokens as necessary.

```
#!/usr/bin/nodejs --harmony
//----------------------------------------------------------------

'use strict';
//----------------------------------------------------------------

const process = require('process')
const minimist = require('minimist')
const fs = require('fs')
const tmi = require('tmi.js')
const redis = require('redis');
const util = require('util')

// Twitch Auth Util (tau)
const tau = require('twitch-auth')

const defaultConfigPath = 'config.json';
const defaultConfig = {
  credsPath: './creds.json',
  reconnect: true
};
//----------------------------------------------------------------

// Called every time a message comes in:
function onMessageHandler(target, context, msg, self) {
  // Ignore messages from the bot
  if (self) {
    return;
  }
  
  console.log(msg);
}

function parseArgs(argv) {
  let args = minimist(argv.slice(2));
  if (args['_'].length > 0) {
    args._.forEach((unknownOption) => {
      console.log(`I don't know what "${unknownOption}" is.`);
    });
    
    return (null);
  }
  
  return (args);
}

function getConfigPath(args, defaultPath=defaultConfigPath) {
  if ('F' in args) {
    return (args['F']);
  }
  
  return (defaultPath);
}

function getConfig(args) {
  let configPath = getConfigPath(args);

  let config = defaultConfig;
  try {
    fs.accessSync(configPath, fs.constants.F_OK | fs.constants.R_OK);
    let configString = fs.readFileSync(configPath, 'utf8');
    config = Object.assign(config, JSON.parse(configString));
  }
  catch (err) {
    console.log(err);
  }
  
  return (config);
}

function getCreds(credsPath) {
  let credString = fs.readFileSync(credsPath, 'utf8');
  return (JSON.parse(credString));
}

function redisValue(redisClient, key) {
  return (new Promise((resolve, reject) => {
    redisClient.get(key, (err, result) => {
      console.log('redis client returned: ' + result);
      if (err) {
        reject(err);
      }
      
      resolve(result);
    });
  }));
}

function accessTokenFromAuthCode(creds, code) {
  return (tau.getUserAccessToken(creds, code));
}

function accessTokenFromCache() {
  //console.log('accessTokenFromCache()');
  
  let redisClient = redis.createClient();
  let tokens = Promise.all([
    redisValue(redisClient, "access_token"),
    redisValue(redisClient, "refresh_token")])
  .then((results) => {
    //console.log('results: ' + results);
    redisClient.end();
    return ({access_token: results[0],
             refresh_token: results[1]});
  });

  return (tokens);
}

function cacheTokenResponse(response) {
  let redisClient = redis.createClient();
  return (new Promise((resolve, reject) => {
    if (('access_token' in response ) &&
        ('refresh_token' in response)) {
      redisClient.mset('access_token', response.access_token,
                       'refresh_token', response.refresh_token, (err, reply) => {
        console.log('redis client returned: ' + reply);
        
        redisClient.end();
        if (err) {
          reject(err);
        }
        
        resolve(reply);
      });
    }
  }));
}

function reconnect(context) {
  return (tau.refreshUserAccessToken(context.creds, context.tokens.refresh_token)
          .then((response) => {
            // Update the tokens in our context oject.
            context.tokens.access_token = response.access_token;
            context.tokens.refresh_token = response.refresh_token;
            return (response);})
          .then(cacheTokenResponse)
          .then((reply) => {
            // reply is useless ("OK")
            console.log("let's try to reconnect...");
            return (context);})
          .then(serve));
}

function getTwitchOptions(context) {
  let opts = {
    options: {
      clientId: context.creds.client_id,
      debug: true
    },
    identity: {
      username: context.config.tmi.username,
      password: 'oauth:' + context.tokens.access_token
    },
    channels: context.config.tmi.channels
  }
  
  return (opts);
}

function registerTwitchEventHandlers(client, context) {
  // Register our event handlers:
  client.on('message', onMessageHandler);
  client.on('disconnected', (reason) => {
    // Login authentication failed
    console.log(util.format('Disconnected: %s', reason));
    
    reconnect(context)
    .catch((err) => {
      console.log(err);
    });
  });
}

function serve(context) {
  // Create a client with our tmi options:
  let opts = getTwitchOptions(context);
  let client = new tmi.client(opts);
  
  // Connect to Twitch:
  return (client.connect()
          .then((data) => {
            console.log(JSON.stringify(data));
            
            registerTwitchEventHandlers(client, context);
          }, (err) => {
            // Reconnect is almost always necessary because auth tokens need to be refreshed often.
            console.log("It's okay, we probably just need to refresh the auth tokens.");
            
            reconnect(context)
            .catch((err) => {
              console.log('Uh oh, reconnection attempt failed. Maybe this error message will be helpful:\n' + err);
             });
          }));
}

function launch(args) {
  let config = getConfig(args);
  let creds = getCreds(config.credsPath);
  let accessToken = Promise.resolve();
  if ('c' in args) {
    let authCode = args['c'];
    accessToken = accessToken
      .then(function() {
        return (accessTokenFromAuthCode(creds, authCode));
      })
      .then((response) => {
        return (cacheTokenResponse(response));
      });
  }
  else {
    accessToken = accessToken
      .then(function() {
        return (accessTokenFromCache());
      });
  }
  
  // Inject other context.
  accessToken
  .then((tokens) => {
    let context = {
      config: config,
      creds: creds,
      tokens: tokens
    };
    
    return (context);})
  .then(serve)
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
}
//----------------------------------------------------------------

launch(parseArgs(process.argv));
//----------------------------------------------------------------
```

My `config.json` looks like this:
```
{
  "tmi": {
    "channels": [
      "laddspencer"
    ],
    "username": "PhantsBot"
  }
}
```

My `creds.json` looks like this (no, those are not real creds, use your own!):

```
{
"client_id": "4jkcd8ejjwkemvnhuewnc98ku87uyh",
"client_secret": "d9rkkijun4jfunywhqssx6456hey7u"
}
```
