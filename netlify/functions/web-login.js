const crypto = require('crypto');

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
    const expectedUsername = process.env.WEB_APP_USERNAME;
    const expectedPassword = process.env.WEB_APP_PASSWORD;

    if (!expectedUsername || !expectedPassword) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Web login credentials (WEB_APP_USERNAME / WEB_APP_PASSWORD) are not configured in Netlify Environment Variables.',
        }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const expectedToken = crypto
      .createHmac('sha256', expectedPassword)
      .update(`${expectedUsername}:baker-buddy-web-auth`)
      .digest('hex');

    // Action 1: Verify existing saved session token
    if (body.action === 'verify' && body.token) {
      const isValid = body.token === expectedToken;
      return {
        statusCode: isValid ? 200 : 401,
        headers,
        body: JSON.stringify({ authenticated: isValid }),
      };
    }

    // Action 2: Login with username and password
    const inputUser = String(body.username || '').trim();
    const inputPass = String(body.password || '');

    if (inputUser === expectedUsername.trim() && inputPass === expectedPassword) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          authenticated: true,
          token: expectedToken,
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
