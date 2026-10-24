const crypto = require('crypto');

/**
 * Parses allowed users from Netlify Environment Variables:
 * - Supports WEB_APP_USERS="user1:pass1, user2:pass2, user3:pass3"
 * - Also supports single WEB_APP_USERNAME and WEB_APP_PASSWORD
 */
function getAllowedUsers() {
  const usersMap = new Map();

  const multiUsersRaw = process.env.WEB_APP_USERS;
  if (multiUsersRaw && typeof multiUsersRaw === 'string') {
    const entries = multiUsersRaw.split(',');
    for (const entry of entries) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const u = trimmed.slice(0, colonIdx).trim();
        const p = trimmed.slice(colonIdx + 1).trim();
        if (u && p) {
          usersMap.set(u.toLowerCase(), { username: u, password: p });
        }
      }
    }
  }

  const singleUser = process.env.WEB_APP_USERNAME;
  const singlePass = process.env.WEB_APP_PASSWORD;
  if (singleUser && singlePass) {
    const u = singleUser.trim();
    usersMap.set(u.toLowerCase(), { username: u, password: singlePass });
  }

  return usersMap;
}

function createTokenForUser(username, password) {
  return crypto
    .createHmac('sha256', password)
    .update(`${username.toLowerCase()}:baker-buddy-web-auth`)
    .digest('hex');
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const allowedUsers = getAllowedUsers();

    if (allowedUsers.size === 0) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error:
            'Web login credentials are not configured. Please set WEB_APP_USERS (e.g. "user1:pass1, user2:pass2") in Netlify Environment Variables.',
        }),
      };
    }

    const body = JSON.parse(event.body || '{}');

    // Action 1: Verify existing saved session token against all currently active users
    if (body.action === 'verify' && body.token) {
      let matchedUser = null;
      for (const [, userObj] of allowedUsers.entries()) {
        const validToken = createTokenForUser(userObj.username, userObj.password);
        if (body.token === validToken) {
          matchedUser = userObj.username;
          break;
        }
      }

      return {
        statusCode: matchedUser ? 200 : 401,
        headers,
        body: JSON.stringify({
          authenticated: Boolean(matchedUser),
          username: matchedUser,
        }),
      };
    }

    // Action 2: Login with username and password
    const inputUser = String(body.username || '').trim();
    const inputPass = String(body.password || '').trim();

    const matchedRecord = allowedUsers.get(inputUser.toLowerCase());
    if (matchedRecord && inputPass === matchedRecord.password) {
      const token = createTokenForUser(matchedRecord.username, matchedRecord.password);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          authenticated: true,
          username: matchedRecord.username,
          token,
        }),
      };
    }

    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        authenticated: false,
        error: 'Invalid Login ID or Password.',
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error during authentication.' }),
    };
  }
};
