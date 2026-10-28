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

    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const dayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' }).format(now);

    const systemPrompt = `You are a structured order parser helper for a homebaker app.
Analyze the provided content (text transcript, screenshot image, or voice note audio).
TODAY'S BASE DATE: ${todayStr} (${dayOfWeek}).

Extract and return a JSON object with this schema:
{
  "customerName": "string or null",
  "customerPhone": "string (10 digits) or null",
  "orderDescription": "string (item name, flavor, custom message, without weight/quantity)",
  "quantity": "string (weight or quantity e.g. '1.5 kg', '500 g', '6 pcs') or null",
  "rate": number (rate per base unit if mentioned) or null,
  "cakeTopperText": "string (custom message/inscription on cake or topper e.g. 'Happy Birthday Aarav') or null",
  "deliveryDate": "string (DD-MM-YYYY e.g. 30-09-2026) or null",
  "deliveryTime": "string (HH:MM in 24-hour format e.g. 18:00 for 6 PM, 09:30 for 9:30 AM) or null",
  "price": number or null,
  "deliveryAddress": "string or null",
  "isEggless": boolean (true ONLY if customer explicitly mentions eggless, veg, no egg, or jain; default to false for egg-based products)
}

Guidelines:
1. Extract the customer's name and phone number if spoken or written in the message.
2. In orderDescription, summarize the item name and flavor/custom message (e.g. "Chocolate Truffle Cake"), keeping the weight/quantity separate in the "quantity" field (e.g. "1 kg", "500 g", "6 pcs").
3. Determine the rate and/or final agreed price (number only).
4. Parse the deliveryDate relative to TODAY'S BASE DATE (${todayStr}, ${dayOfWeek}).
   - "today" -> ${todayStr}
   - "tomorrow" -> calculate next day relative to ${todayStr}
   - "day after" / "day after tomorrow" -> calculate +2 days relative to ${todayStr}
   - "this Friday" / "coming Saturday" -> calculate the upcoming target day relative to ${todayStr}
   - NEVER use past years (like 2024). All target dates MUST be on or after ${todayStr}.
5. Parse the deliveryTime in 24-hour HH:MM format if mentioned (e.g. "at 6pm" -> "18:00", "5:30 pm" -> "17:30", "10 am" -> "10:00"). If no time is mentioned, return null.
6. If the audio/text contains NO bakery order details, return {"isOrder": false, "reason": "No order details detected"}.
7. Return ONLY the JSON object. Do not include markdown code block backticks (like \`\`\`json) or any explanations.`;

    const parts = [];
    
    if (audioBase64) {
      const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
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
      const cleanBase64 = chatImageBase64.replace(/^data:[^;]+;base64,/, '');
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

    const callGeminiModel = async (modelName, includeThinkingConfig) => {
      const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const generationConfig = {
        responseMimeType: 'application/json'
      };
      if (includeThinkingConfig) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }
      return fetch(apiURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: parts
          }],
          generationConfig
        })
      });
    };

    let response = await callGeminiModel('gemini-2.5-flash', true);

    if (!response.ok && (response.status === 503 || response.status === 429 || response.status === 500 || response.status === 400)) {
      console.warn(`gemini-2.5-flash returned ${response.status}, retrying with gemini-2.0-flash...`);
      response = await callGeminiModel('gemini-2.0-flash', false);
    }

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
    const candidateParts = data.candidates?.[0]?.content?.parts || [];
    const textPart = candidateParts.find(p => typeof p.text === 'string' && !p.thought) || candidateParts[0];
    const resultText = textPart?.text;

    if (!resultText) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to extract parsed text from Gemini response' })
      };
    }

    const cleanedText = resultText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsedJson;
    try {
      parsedJson = JSON.parse(cleanedText);
    } catch (parseErr) {
      console.error('JSON Parse error on AI text output:', cleanedText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Could not parse AI response: ${parseErr.message}` })
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
