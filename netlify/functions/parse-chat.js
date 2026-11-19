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
  "items": [
    {
      "name": "string (product name and flavor ONLY, without weight/quantity, e.g. 'Chocolate Truffle Cake', 'Butter Cookies', 'Pancakes')",
      "quantity": "string (weight or quantity for this specific item e.g. '1.5 kg', '500 g', '6 pcs') or null",
      "rate": number (unit rate for this specific item if mentioned) or null,
      "price": number (total price for this specific item if mentioned) or null
    }
  ],
  "orderDescription": "string (item name, flavor, custom message, without weight/quantity)",
  "quantity": "string (weight or quantity e.g. '1.5 kg', '500 g', '6 pcs') or null",
  "rate": number (rate per base unit if mentioned) or null,
  "cakeTopperText": "string (custom message/inscription on cake or topper e.g. 'Happy Birthday Aarav') or null",
  "deliveryDate": "string (DD-MM-YYYY e.g. 30-09-2026) or null",
  "deliveryTime": "string (HH:MM in 24-hour format e.g. 18:00 for 6 PM, 09:30 for 9:30 AM) or null",
  "price": number (grand total price if mentioned) or null,
  "deliveryAddress": "string or null",
  "isEggless": boolean (true ONLY if customer explicitly mentions eggless, veg, no egg, or jain; default to false for egg-based products)
}

Guidelines:
1. Extract the customer's name and phone number if spoken or written in the message.
2. Populate the "items" array with every distinct product ordered (whether 1 product or multiple products like a cake + cookies + pancakes). For each item, put ONLY the product name/flavor in "name" and its corresponding weight/count in "quantity" (e.g. "1 kg", "500 g", "6 pcs").
3. Also populate "orderDescription" and "quantity" for backward compatibility.
4. Determine the item rate/price and/or final agreed grand total price (number only).
5. Parse the deliveryDate relative to TODAY'S BASE DATE (${todayStr}, ${dayOfWeek}).
   - "today" -> ${todayStr}
   - "tomorrow" -> calculate next day relative to ${todayStr}
   - "day after" / "day after tomorrow" -> calculate +2 days relative to ${todayStr}
   - "this Friday" / "coming Saturday" -> calculate the upcoming target day relative to ${todayStr}
   - NEVER use past years (like 2024). All target dates MUST be on or after ${todayStr}.
6. Parse the deliveryTime in 24-hour HH:MM format if mentioned (e.g. "at 6pm" -> "18:00", "5:30 pm" -> "17:30", "10 am" -> "10:00"). If no time is mentioned, return null.
7. If the audio/text contains NO bakery order details, return {"isOrder": false, "reason": "No order details detected"}.
8. Return ONLY the JSON object. Do not include markdown code block backticks (like \`\`\`json) or any explanations.`;

    const detectAndNormalizeAudioMimeType = (rawMime, b64) => {
      try {
        const headerBuf = Buffer.from(b64.slice(0, 64), 'base64');
        if (headerBuf.length >= 12) {
          // WebM / Matroska EBML header: 1A 45 DF A3
          if (
            headerBuf[0] === 0x1a &&
            headerBuf[1] === 0x45 &&
            headerBuf[2] === 0xdf &&
            headerBuf[3] === 0xa3
          ) {
            return 'audio/webm';
          }
          // Ogg header: "OggS"
          if (headerBuf.slice(0, 4).toString('ascii') === 'OggS') {
            return 'audio/ogg';
          }
          // WAV header: "RIFF" ... "WAVE"
          if (
            headerBuf.slice(0, 4).toString('ascii') === 'RIFF' &&
            headerBuf.slice(8, 12).toString('ascii') === 'WAVE'
          ) {
            return 'audio/wav';
          }
          // FLAC header: "fLaC"
          if (headerBuf.slice(0, 4).toString('ascii') === 'fLaC') {
            return 'audio/flac';
          }
          // AMR header: "#!AMR"
          if (headerBuf.slice(0, 5).toString('ascii') === '#!AMR') {
            return 'audio/amr';
          }
          // MP4 / M4A container: bytes 4..8 === "ftyp"
          if (headerBuf.slice(4, 8).toString('ascii') === 'ftyp') {
            return 'audio/mp4';
          }
          // ID3 tagged MP3: "ID3"
          if (headerBuf.slice(0, 3).toString('ascii') === 'ID3') {
            return 'audio/mp3';
          }
        }
      } catch (e) {
        console.warn('[parse-chat] Audio header inspection failed:', e);
      }

      const baseMime = String(rawMime || '')
        .split(';')[0]
        .trim()
        .toLowerCase();

      if (!baseMime || baseMime === 'audio/m4a' || baseMime === 'audio/x-m4a' || baseMime === 'audio/mp4a-latm' || baseMime === 'video/mp4') {
        return 'audio/mp4';
      }
      if (baseMime === 'video/webm') return 'audio/webm';
      if (baseMime === 'video/ogg' || baseMime === 'application/ogg') return 'audio/ogg';
      if (baseMime === 'audio/x-wav') return 'audio/wav';
      return baseMime;
    };

    const parts = [];
    
    if (audioBase64) {
      const cleanBase64 = audioBase64.replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
      const normalizedAudioMime = detectAndNormalizeAudioMimeType(mimeType, cleanBase64);
      parts.push({
        text: `${systemPrompt}\n\nListen carefully to the attached voice note audio recording and extract the order details.`
      });
      parts.push({
        inlineData: {
          mimeType: normalizedAudioMime,
          data: cleanBase64
        }
      });
    } else if (chatImageBase64) {
      const cleanBase64 = chatImageBase64.replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
      const baseImgMime = String(mimeType || 'image/jpeg').split(';')[0].trim().toLowerCase() || 'image/jpeg';
      parts.push({
        text: `${systemPrompt}\n\nAnalyze the attached screenshot and extract the details.`
      });
      parts.push({
        inlineData: {
          mimeType: baseImgMime,
          data: cleanBase64
        }
      });
    } else {
      parts.push({
        text: `${systemPrompt}\n\nChat transcript:\n${chatText}`
      });
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const callGeminiModel = async (modelName, includeThinkingConfig) => {
      const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const generationConfig = {
        responseMimeType: 'application/json'
      };
      if (includeThinkingConfig) {
        generationConfig.thinkingConfig = { thinkingBudget: 512 };
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

    // Multi-model fallback chain across independent free-tier serving pools:
    // 1. gemini-3.6-flash (Primary stable Flash model)
    // 2. gemini-3.5-flash-lite (High-throughput stable Flash-Lite model)
    // 3. gemini-3.1-flash-lite (Secondary stable Flash-Lite pool)
    // 4. gemini-2.5-flash (Legacy fallback for older API keys)
    const modelAttempts = [
      { model: 'gemini-3.6-flash', thinking: false },
      { model: 'gemini-3.5-flash-lite', thinking: false },
      { model: 'gemini-3.1-flash-lite', thinking: false },
      { model: 'gemini-2.5-flash', thinking: true },
      { model: 'gemini-2.5-flash', thinking: false }
    ];

    let response = null;
    let lastErrorText = '';
    let lastStatus = 503;

    for (let i = 0; i < modelAttempts.length; i++) {
      const attempt = modelAttempts[i];
      try {
        response = await callGeminiModel(attempt.model, attempt.thinking);
        if (!response.ok && response.status === 400 && audioBase64 && parts[1]?.inlineData) {
          const currentMime = parts[1].inlineData.mimeType;
          const altMime =
            currentMime === 'audio/mp4'
              ? 'audio/aac'
              : currentMime === 'audio/aac'
                ? 'audio/m4a'
                : currentMime === 'audio/webm'
                  ? 'audio/ogg'
                  : null;
          if (altMime) {
            parts[1].inlineData.mimeType = altMime;
            const retryRes = await callGeminiModel(attempt.model, attempt.thinking);
            if (retryRes.ok) {
              response = retryRes;
              break;
            }
            parts[1].inlineData.mimeType = currentMime;
          }
        }
        if (response.ok) {
          break;
        }
        lastStatus = response.status;
        lastErrorText = await response.text();
        console.warn(
          `[parse-chat] Model ${attempt.model} (thinking=${attempt.thinking}) returned HTTP ${response.status}.` +
          (i < modelAttempts.length - 1 ? ` Falling back to ${modelAttempts[i + 1].model}...` : '')
        );
      } catch (fetchErr) {
        lastErrorText = fetchErr.message || String(fetchErr);
        console.warn(
          `[parse-chat] Network error calling ${attempt.model}: ${lastErrorText}.` +
          (i < modelAttempts.length - 1 ? ` Falling back to ${modelAttempts[i + 1].model}...` : '')
        );
      }

      if (i < modelAttempts.length - 1) {
        await sleep(500);
      }
    }

    if (!response || !response.ok) {
      let parsedErr;
      try {
        parsedErr = JSON.parse(lastErrorText);
      } catch(e) {}
      const errMsg = parsedErr?.error?.message || lastErrorText || 'All Gemini models are temporarily busy';
      return {
        statusCode: lastStatus || 503,
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

    let cleanedText = resultText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsedJson;
    try {
      parsedJson = JSON.parse(cleanedText);
    } catch (parseErr) {
      const firstBrace = cleanedText.indexOf('{');
      const lastBrace = cleanedText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          parsedJson = JSON.parse(cleanedText.slice(firstBrace, lastBrace + 1));
        } catch (innerErr) {
          console.error('JSON Parse error on AI text output:', cleanedText);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: `Could not parse AI response: ${parseErr.message}` })
          };
        }
      } else {
        console.error('JSON Parse error on AI text output:', cleanedText);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: `Could not parse AI response: ${parseErr.message}` })
        };
      }
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
