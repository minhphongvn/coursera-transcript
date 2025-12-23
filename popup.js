document.getElementById('loadBtn').addEventListener('click', () => {
  const vttText = document.getElementById('vttInput').value;
  const statusEl = document.getElementById('status');

  if (!vttText) {
    statusEl.textContent = "Vui lòng nhập nội dung VTT!";
    statusEl.style.color = "red";
    return;
  }

  statusEl.textContent = "Loading...";
  statusEl.style.color = "#555";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      statusEl.textContent = "Không tìm thấy tab nào!";
      statusEl.style.color = "red";
      return;
    }

    const currentUrl = tabs[0].url;
    if (!currentUrl || !currentUrl.includes('coursera.org')) {
      statusEl.textContent = "Vui lòng mở trang Coursera có video!";
      statusEl.style.color = "orange";
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, {
      action: "loadVTT",
      data: vttText
    }, (response) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = "Lỗi: Vui lòng refresh trang Coursera (F5)!";
        statusEl.style.color = "red";
        console.error(chrome.runtime.lastError);
      } else if (response && response.success) {
        statusEl.textContent = "Phụ đề đã được load! ✓";
        statusEl.style.color = "green";
      } else {
        statusEl.textContent = "Không load được phụ đề.";
        statusEl.style.color = "red";
      }
    });
  });
});

document.getElementById('extractBtn').addEventListener('click', () => {
  const statusEl = document.getElementById('status');
  statusEl.textContent = "Extracting...";
  statusEl.style.color = "#555";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      statusEl.textContent = "Không tìm thấy tab nào!";
      statusEl.style.color = "red";
      return;
    }

    const currentUrl = tabs[0].url;
    if (!currentUrl || !currentUrl.includes('coursera.org')) {
      statusEl.textContent = "Vui lòng mở trang Coursera có video!";
      statusEl.style.color = "orange";
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { action: "extractVTT" }, (response) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = "Lỗi: Vui lòng reload extension (chrome://extensions) và refresh trang Coursera!";
        statusEl.style.color = "red";
        console.error(chrome.runtime.lastError);
      } else if (response && response.success) {
        document.getElementById('vttInput').value = response.data;

        // Auto-save extracted VTT for this module
        getModuleId().then(moduleId => {
          if (moduleId) {
            const storageKey = `vtt_${moduleId}`;
            chrome.storage.local.set({ [storageKey]: response.data }, () => {
              console.log('Auto-saved extracted VTT for module:', moduleId);
            });
          }
        });

        statusEl.textContent = "Extracted successfully! (đã lưu)";
        statusEl.style.color = "green";
      } else {
        statusEl.textContent = response?.message || "No subtitles found.";
        statusEl.style.color = "orange";
      }
    });
  });
});

// Extract module ID from Coursera URL
function getModuleId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0 || !tabs[0].url) {
        resolve(null);
        return;
      }

      const url = tabs[0].url;
      // Extract unique identifier from Coursera URL
      // Example: https://www.coursera.org/learn/course-name/lecture/video-id/title
      const match = url.match(/coursera\.org\/learn\/([^\/]+)\/.*\/([\w-]+)/);
      if (match) {
        resolve(`${match[1]}_${match[2]}`); // course-name_video-id
      } else {
        resolve(null);
      }
    });
  });
}

// Load saved settings and VTT content for current module
(async function initPopup() {
  // Load API settings
  chrome.storage.local.get(['apiKey', 'provider', 'targetLang'], (result) => {
    if (result.apiKey) document.getElementById('apiKey').value = result.apiKey;
    if (result.provider) document.getElementById('provider').value = result.provider;
    if (result.targetLang) document.getElementById('targetLang').value = result.targetLang;
  });

  // Load saved VTT for current module
  const moduleId = await getModuleId();
  if (moduleId) {
    const storageKey = `vtt_${moduleId}`;
    chrome.storage.local.get([storageKey], (result) => {
      if (result[storageKey]) {
        document.getElementById('vttInput').value = result[storageKey];
        const statusEl = document.getElementById('status');
        statusEl.textContent = "📂 Đã tải VTT đã lưu cho module này";
        statusEl.style.color = "#4CAF50";
        console.log('Loaded saved VTT for module:', moduleId);
      }
    });
  }
})();

// Save API Key when user changes it
document.getElementById('apiKey').addEventListener('blur', () => {
  const apiKey = document.getElementById('apiKey').value;
  chrome.storage.local.set({ apiKey: apiKey }, () => {
    console.log('API Key saved');
  });
});

// Save provider when changed
document.getElementById('provider').addEventListener('change', () => {
  const provider = document.getElementById('provider').value;
  chrome.storage.local.set({ provider: provider });
});

// Save target language when changed
document.getElementById('targetLang').addEventListener('blur', () => {
  const targetLang = document.getElementById('targetLang').value;
  chrome.storage.local.set({ targetLang: targetLang });
});

// Translation button handler
document.getElementById('translateBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  const vttText = document.getElementById('vttInput').value;
  const apiKey = document.getElementById('apiKey').value;
  const provider = document.getElementById('provider').value;
  const targetLang = document.getElementById('targetLang').value;

  console.log('Translate button clicked');
  console.log('VTT length:', vttText.length);
  console.log('Provider:', provider);
  console.log('Target language:', targetLang);
  console.log('API Key present:', !!apiKey);

  // Validation
  if (!vttText || vttText.trim() === '') {
    statusEl.textContent = "Vui lòng nhập hoặc trích xuất nội dung VTT trước!";
    statusEl.style.color = "red";
    return;
  }

  if (!apiKey || apiKey.trim() === '') {
    statusEl.textContent = "Vui lòng nhập API Key!";
    statusEl.style.color = "red";
    return;
  }

  if (!targetLang || targetLang.trim() === '') {
    statusEl.textContent = "Vui lòng nhập ngôn ngữ đích!";
    statusEl.style.color = "red";
    return;
  }

  // Show progress
  statusEl.textContent = "Đang dịch... (có thể mất 30-60 giây)";
  statusEl.style.color = "blue";

  try {
    let translatedText = "";

    if (provider === 'openai') {
      console.log('Calling OpenAI...');
      translatedText = await translateWithOpenAI(vttText, apiKey, targetLang);
    } else if (provider === 'gemini') {
      console.log('Calling Gemini...');
      translatedText = await translateWithGemini(vttText, apiKey, targetLang);
    } else {
      throw new Error('Provider không hợp lệ');
    }

    console.log('Translation completed, length:', translatedText.length);

    // Update the textarea with translated content
    document.getElementById('vttInput').value = translatedText;

    // Auto-save translated VTT for this module
    const moduleId = await getModuleId();
    if (moduleId) {
      const storageKey = `vtt_${moduleId}`;
      chrome.storage.local.set({ [storageKey]: translatedText }, () => {
        console.log('Auto-saved VTT for module:', moduleId);
      });
    }

    statusEl.textContent = "Dịch thành công! ✓ (đã lưu)";
    statusEl.style.color = "green";

  } catch (error) {
    console.error('Translation error:', error);
    statusEl.textContent = "Lỗi: " + error.message;
    statusEl.style.color = "red";
  }
});

// OpenAI Translation Function
async function translateWithOpenAI(text, apiKey, targetLanguage) {
  console.log('translateWithOpenAI started');

  const systemPrompt = "You are a professional subtitle translator. Translate ONLY the subtitle text, keeping all WEBVTT headers and timestamps EXACTLY as they are.";
  const userPrompt = `Translate the following WebVTT subtitles to ${targetLanguage}. Keep the WEBVTT header and all timestamps unchanged. Only translate the text content:\n\n${text}`;

  const requestBody = {
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.3
  };

  console.log('Calling OpenAI API...');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  console.log('OpenAI response status:', response.status);

  const data = await response.json();
  console.log('OpenAI response data:', data);

  if (!response.ok) {
    const errorMessage = data.error?.message || `HTTP ${response.status}`;
    throw new Error(`OpenAI: ${errorMessage}`);
  }

  if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
    throw new Error('OpenAI trả về dữ liệu không hợp lệ');
  }

  return data.choices[0].message.content.trim();
}

// Gemini Translation Function
async function translateWithGemini(text, apiKey, targetLanguage) {
  console.log('translateWithGemini started');

  const prompt = `Translate the following WebVTT subtitles to ${targetLanguage}. IMPORTANT: Keep the WEBVTT header and all timestamps (HH:MM:SS.mmm --> HH:MM:SS.mmm) EXACTLY as they are. Only translate the text content:\n\n${text}`;

  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.3
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;

  console.log('Calling Gemini API...');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  console.log('Gemini response status:', response.status);

  const data = await response.json();
  console.log('Gemini response data:', data);

  if (!response.ok) {
    const errorMessage = data.error?.message || `HTTP ${response.status}`;
    throw new Error(`Gemini: ${errorMessage}`);
  }

  // Check response structure
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('Gemini không trả về kết quả');
  }

  const candidate = data.candidates[0];

  if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
    throw new Error('Gemini trả về dữ liệu không hợp lệ');
  }

  return candidate.content.parts[0].text.trim();
}
