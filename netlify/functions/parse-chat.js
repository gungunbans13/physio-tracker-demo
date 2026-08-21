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
    const { chatText, chatImageBase64, mimeType } = JSON.parse(event.body);
    if (!chatText && !chatImageBase64) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing chatText or chatImageBase64 in request body' })
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
Analyze the provided WhatsApp chat transcript (text or screenshot image).
Extract and return a JSON object with this schema:
{
  "customerName": "string or null",
  "customerPhone": "string (10 digits) or null",
  "orderDescription": "string (item details, flavor, size, quantity)",
  "deliveryDate": "string (YYYY-MM-DD) or null",
  "price": number or null
}

Guidelines:
1. Extract the customer's name and phone number from the message sender headers (e.g. "[18/08/2026, 11:15 AM] Rohan Sharma: ...") or if they write it inside.
2. In orderDescription, summarize what was finally agreed (e.g. "Chocolate Cake 1kg").
3. Determine the final agreed price (number only).
4. Parse the delivery date relative to the chat timestamp headers (e.g. if the chat is on 18/08/2026 and they say "tomorrow", the deliveryDate is "2026-08-19").
5. Return ONLY the JSON object. Do not include markdown code block backticks (like \`\`\`json) or any explanations.`;

    const parts = [];
    
    if (chatImageBase64) {
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

    // Sequence of model aliases to try
    const modelsToTry = [
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash-002',
      'gemini-1.5-flash-001',
      'gemini-1.0-pro'
    ];

    let lastError = null;
    let parsedJson = null;

    for (const model of modelsToTry) {
      try {
        const apiURL = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
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

        if (response.ok) {
          const data = await response.json();
          const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (resultText) {
            parsedJson = JSON.parse(resultText.trim());
            break; // Success! Exit loop
          } else {
            lastError = 'Empty response body parts from Gemini API';
          }
        } else {
          const errText = await response.text();
          let parsedErr;
          try {
            parsedErr = JSON.parse(errText);
          } catch(e) {}
          lastError = parsedErr?.error?.message || errText;
        }
      } catch (err) {
        lastError = err.message || String(err);
      }
    }

    if (!parsedJson) {
      // Diagnostic check: Fetch list of available models for this specific API Key
      let availableModelNames = 'Could not fetch list';
      try {
        const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
        if (listResponse.ok) {
          const listData = await listResponse.json();
          availableModelNames = listData.models ? listData.models.map(m => m.name.replace('models/', '')).join(', ') : 'No models returned';
        } else {
          availableModelNames = `Failed listing models: ${listResponse.status}`;
        }
      } catch (listErr) {
        availableModelNames = `Error listing models: ${listErr.message || String(listErr)}`;
      }

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: `Gemini API failed. Last Error: ${lastError}.\n\nAvailable models for your API Key: [${availableModelNames}]` 
        })
      };
    }

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
