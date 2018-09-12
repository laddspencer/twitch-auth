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
