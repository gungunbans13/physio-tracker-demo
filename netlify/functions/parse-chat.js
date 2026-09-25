exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const { chatText, chatImageBase64, audioBase64, mimeType } = JSON.parse(event.body);
    if (!chatText && !chatImageBase64 && !audioBase64) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing chatText, chatImageBase64, or audioBase64 in request body' })
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'GEMINI_API_KEY environment variable is not configured on Netlify' })
      };
    }

    const systemPrompt = `You are a structured order parser helper for a homebaker app.
Analyze the provided content (text transcript, screenshot image, or voice note audio).
Extract and return a JSON object with this schema:
{
  "customerName": "string or null",
  "customerPhone": "string (10 digits) or null",
  "orderDescription": "string (item details, flavor, size, quantity)",
  "deliveryDate": "string (YYYY-MM-DD) or null",
  "price": number or null,
  "deliveryAddress": "string or null"
}

Guidelines:
1. Extract the customer's name and phone number if spoken or written in the message.
2. In orderDescription, summarize what was ordered (e.g. "Chocolate Truffle Cake 1kg").
3. Determine the final agreed price (number only).
4. Parse the delivery date relative to today or spoken date (YYYY-MM-DD).
5. If the audio/text contains NO bakery order details, return {"isOrder": false, "reason": "No order details detected"}.
6. Return ONLY the JSON object. Do not include markdown code block backticks (like \`\`\`json) or any explanations.`;

    const parts = [];
    
    if (audioBase64) {
      const cleanBase64 = audioBase64.replace(/^data:(audio|application)\/\w+;base64,/, '');
      parts.push({
        text: `${systemPrompt}\n\nListen carefully to the attached voice note audio recording and extract the order details.`
      });
      parts.push({
        inlineData: {
          mimeType: mimeType || 'audio/m4a',
          data: cleanBase64
        }
      });
    } else if (chatImageBase64) {
      const cleanBase64 = chatImageBase64.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        text: `${systemPrompt}\n\nAnalyze the attached screenshot and extract the details.`
      });
      parts.push({
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: cleanBase64
        }
      });
    } else {
      parts.push({
        text: `${systemPrompt}\n\nChat transcript:\n${chatText}`
      });
    }

    const apiURL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(apiURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: parts
        }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr;
      try {
        parsedErr = JSON.parse(errText);
      } catch(e) {}
      const errMsg = parsedErr?.error?.message || errText;
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `Gemini API returned error: ${errMsg}` })
      };
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to extract parsed text from Gemini response' })
      };
    }

    const parsedJson = JSON.parse(resultText.trim());

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(parsedJson)
    };

  } catch (error) {
    console.error('Error in parse-chat function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || String(error) })
    };
  }
};
