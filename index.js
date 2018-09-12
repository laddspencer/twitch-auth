#!/usr/bin/nodejs --harmony
//----------------------------------------------------------------

'use strict';
//----------------------------------------------------------------

const request = require('request');

const baseUrl = 'https://id.twitch.tv';
const oathUrl = `${baseUrl}/oauth2`;
const tokenUrl = `${oathUrl}/token`;
const authorizeUrl = `${oathUrl}/authorize`;
//----------------------------------------------------------------

exports.getAppAccessToken = getAppAccessToken;
exports.getUserAccessToken = getUserAccessToken;
exports.refreshUserAccessToken = refreshUserAccessToken;
//----------------------------------------------------------------

function requestPromise(options) {
  return (new Promise((resolve, reject) => {
    request(options, (error, response, body) => {
      if (error != null) {
        reject(error);
      }
      else {
        resolve(JSON.parse(body));
      }
    });
  }));
}

function getAppAccessToken(creds) {
  let queryList = [
    `client_id=${creds.client_id}`,
    `client_secret=${creds.client_secret}`,
    'grant_type=client_creds',
    'scope=chat_login'
    ];

  let url = tokenUrl + '?' + queryList.join('&')
  let options = {
    method: 'POST',
    url: url,
    qs: queryList
  };
  
  return (requestPromise(options));
}

/**
 * This is used the first time a user access token is aquired, following user authorization via a browser.
 * Subsequent attempts to get an access token should use the token refresh process.
 */
function getUserAccessToken(creds, code) {
  let queryList = [
    `client_id=${creds.client_id}`,
    `client_secret=${creds.client_secret}`,
    `code=${code}`,
    'grant_type=authorization_code',
    'redirect_uri=http://localhost',
    ];

  let url = tokenUrl + '?' + queryList.join('&')
  let options = {
    method: 'POST',
    url: url,
    qs: queryList
  };
  
  return (requestPromise(options));
}

function refreshUserAccessToken(creds, refreshToken) {
  let queryList = [
    `refresh_token=${refreshToken}`,
    `client_id=${creds.client_id}`,
    `client_secret=${creds.client_secret}`,
    'grant_type=refresh_token'
    ];

  let url = tokenUrl + '?' + queryList.join('&')
  let options = {
    method: 'POST',
    url: url,
    qs: queryList
  };
  
  return (requestPromise(options));
}
//----------------------------------------------------------------

