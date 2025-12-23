// Basic VTT Parser
function parseVTT(vttString) {
    const cues = [];
    const lines = vttString.split(/\r?\n/);
    let i = 0;

    // Skip header
    if (lines[0].startsWith("WEBVTT")) {
        i++;
    }

    while (i < lines.length) {
        let line = lines[i].trim();

        // Skip empty lines or notes
        if (!line || line.startsWith("NOTE")) {
            i++;
            continue;
        }

        // Check for timestamp line (00:00:00.000 --> 00:00:00.000)
        // Sometimes there is an ID before the timestamp
        if (!line.includes("-->")) {
            // Assume it's an ID, skip to next line
            i++;
            if (i < lines.length) {
                line = lines[i].trim();
            }
        }

        if (line.includes("-->")) {
            const parts = line.split("-->");
            if (parts.length >= 2) {
                const start = parseTime(parts[0].trim());
                const end = parseTime(parts[1].trim());

                // Read text until empty line
                let text = "";
                i++;
                while (i < lines.length && lines[i].trim() !== "") {
                    text += lines[i].trim() + "\n";
                    i++;
                }

                cues.push({ start, end, text: text.trim() });
            } else {
                i++;
            }
        } else {
            i++;
        }
    }
    return cues;
}

function parseTime(timeString) {
    // Format: HH:MM:SS.ms or MM:SS.ms
    const parts = timeString.split(":");
    let seconds = 0;

    if (parts.length === 3) {
        seconds += parseFloat(parts[0]) * 3600;
        seconds += parseFloat(parts[1]) * 60;
        seconds += parseFloat(parts[2]);
    } else if (parts.length === 2) {
        seconds += parseFloat(parts[0]) * 60;
        seconds += parseFloat(parts[1]);
    }

    return seconds;
}

// Subtitle Manager
let customCues = [];
let overlay = null;
let videoElement = null;

function initOverlay() {
    // Don't reuse old overlay - always create fresh for new video
    if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
    }

    const videoParent = videoElement.parentElement;
    if (!videoParent) {
        console.error("Video parent not found");
        return;
    }

    overlay = document.createElement('div');
    overlay.className = 'custom-subs-container';
    videoParent.appendChild(overlay);

    console.log("Overlay created/recreated.");
}

function updateSubtitle() {
    if (!videoElement || !overlay || customCues.length === 0) return;

    const currentTime = videoElement.currentTime;
    const activeCue = customCues.find(cue => currentTime >= cue.start && currentTime <= cue.end);

    if (activeCue) {
        if (overlay.textContent !== activeCue.text) {
            overlay.innerHTML = `<span class="custom-sub-line">${activeCue.text.replace(/\n/g, "<br>")}</span>`;
            overlay.style.display = 'block';

            // Text-to-Speech: speak the subtitle
            if (ttsEnabled && activeCue.text !== lastSpokenText) {
                speakText(activeCue.text);
                lastSpokenText = activeCue.text;
            }
        }
    } else {
        overlay.style.display = 'none';
        // Stop speaking when no subtitle
        if (ttsEnabled && speechSynthesis.speaking) {
            speechSynthesis.cancel();
            lastSpokenText = '';
            updateTTSIndicator(false);
        }
    }
}

// Message Listener
// Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "loadVTT") {
        console.log("Received VTT data.");
        try {
            customCues = parseVTT(request.data);
            console.log(`Parsed ${customCues.length} cues.`);

            // ALWAYS re-query video element (for SPA navigation)
            console.log("Re-querying video element for SPA navigation...");
            videoElement = document.querySelector('video');
            if (!videoElement) {
                sendResponse({ success: false, message: "No video element found." });
                return false;
            }

            // Remove old overlay if exists (cleanup from previous video)
            if (overlay && overlay.parentNode) {
                console.log("Removing old overlay...");
                overlay.parentNode.removeChild(overlay);
                overlay = null;
            }

            // Re-initialize overlay for new video
            initOverlay();

            // Remove old listener and add new one
            videoElement.removeEventListener('timeupdate', updateSubtitle);
            videoElement.addEventListener('timeupdate', updateSubtitle);
            updateSubtitle();

            sendResponse({ success: true });
        } catch (e) {
            console.error(e);
            sendResponse({ success: false, message: e.toString() });
        }
        return false; // Synchronous response
    } else if (request.action === "extractVTT") {
        console.log("Extracting VTT via textTracks (v2)...");
        const video = document.querySelector('video');
        if (!video) {
            sendResponse({ success: false, message: "No video found." });
            return false;
        }

        // Prioritize textTracks API which has parsed cues
        if (video.textTracks && video.textTracks.length > 0) {
            let activeTrack = null;

            // 1. Try to find a showing track
            for (let i = 0; i < video.textTracks.length; i++) {
                if (video.textTracks[i].mode === 'showing') {
                    activeTrack = video.textTracks[i];
                    break;
                }
            }

            // 2. If no showing track, find first one with cues
            if (!activeTrack) {
                for (let i = 0; i < video.textTracks.length; i++) {
                    if (video.textTracks[i].cues && video.textTracks[i].cues.length > 0) {
                        activeTrack = video.textTracks[i];
                        break;
                    }
                }
            }

            if (activeTrack && activeTrack.cues && activeTrack.cues.length > 0) {
                console.log("Using textTrack:", activeTrack);
                let vttOutput = "WEBVTT\n\n";
                for (let i = 0; i < activeTrack.cues.length; i++) {
                    const cue = activeTrack.cues[i];
                    const start = formatTime(cue.startTime);
                    const end = formatTime(cue.endTime);
                    // Minimal HTML tag stripping
                    const text = cue.text ? cue.text.replace(/<[^>]*>/g, "") : "";
                    vttOutput += `${start} --> ${end}\n${text}\n\n`;
                }
                sendResponse({ success: true, data: vttOutput });
                return false;
            }
        }

        // Fallback: Try DOM elements
        const tracks = Array.from(video.querySelectorAll('track'));
        const subTrack = tracks.find(t => t.kind === 'subtitles' || t.kind === 'captions') || tracks[0];

        if (subTrack && subTrack.src) {
            fetch(subTrack.src)
                .then(res => res.text())
                .then(text => {
                    sendResponse({ success: true, data: text });
                })
                .catch(err => {
                    console.error("VTT Fetch Error:", err);
                    sendResponse({ success: false, message: "Fetch error: " + err.toString() });
                });
            return true; // Keep open for fetch
        }

        sendResponse({ success: false, message: "No subtitle tracks found." });
        return false;
    }
    return false; // Unknown action
});

function formatTime(seconds) {
    const date = new Date(0);
    date.setSeconds(seconds);
    const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
    return date.toISOString().substr(11, 8) + "." + ms;
}


console.log("Coursera VTT Loader content script loaded.");

// ========== IN-PAGE UI PANEL ==========
let currentVTT = '';
let uiPanel = null;
// customCues is already declared at line 74
let ttsSegments = [];     // For TTS (merged sentences)
let currentTTSSegment = null; // Track currently spoken segment

// ========== EDGE TTS CLIENT ==========

// EdgeTTS removed as requested. Using Web Speech API.

// TTS variables
let ttsEnabled = false;
let useEdgeTTS = false;
let edgeTTSClient = null;
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;
let ttsVoice = null;
let edgeVoice = 'vi-VN-HoaiMyNeural';
let ttsRate = 1.0;
let lastSpokenText = '';

function createUIPanel() {
    if (uiPanel) return; // Already created

    uiPanel = document.createElement('div');
    uiPanel.id = 'vtt-control-panel';
    uiPanel.innerHTML = `
    <div class="vtt-panel-header">
      <div class="vtt-panel-title">
        <span>🎬</span>
        <span>VTT Translator</span>
      </div>
      <button class="vtt-collapse-btn" id="vtt-minimize">−</button>
    </div>
    
    <div id="vtt-panel-content">
      <textarea id="vtt-input" class="vtt-panel-textarea" placeholder="Paste WebVTT content here..."></textarea>

      <div class="vtt-actions">
        <button class="vtt-btn vtt-btn-extract" id="vtt-extract">📥 Extract</button>
        <button class="vtt-btn vtt-btn-copy-prompt" id="vtt-copy-prompt">📋 Copy Prompt</button>
        <button class="vtt-btn vtt-btn-translate" id="vtt-translate">🌐 Translate</button>
        <button class="vtt-btn vtt-btn-load" id="vtt-load">▶️ Load</button>
      </div>
      
      <div class="vtt-progress-bar" id="vtt-progress">
        <div class="vtt-progress-fill"></div>
      </div>
      
      <div class="vtt-status" id="vtt-status">
        Sẵn sàng
      </div>
      
      <div class="vtt-settings" id="vtt-settings">
        <button class="vtt-settings-toggle" id="vtt-settings-toggle">
          <span>⚙️</span>
          <span>Cài đặt</span>
        </button>
        <div class="vtt-settings-content hidden" id="vtt-settings-content">
          <div class="vtt-input-group">
            <label>Provider</label>
            <select id="vtt-provider">
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>
          <div class="vtt-input-group">
            <label>API Key</label>
            <input type="password" id="vtt-api-key" placeholder="sk-...">
          </div>
          <div class="vtt-input-group">
            <label>Ngôn ngữ đích</label>
            <input type="text" id="vtt-target-lang" value="Vietnamese" placeholder="Vietnamese">
          </div>
        </div>
      </div>
      
      <div class="vtt-tts-section">
        <div class="vtt-tts-toggle">
          <div class="vtt-tts-switch" id="vtt-tts-switch">
            <div class="vtt-tts-switch-handle"></div>
          </div>
          <span>🔊 Text-to-Speech</span>
          <span class="vtt-tts-indicator" id="vtt-tts-indicator" style="display: none;">
            ● Speaking
          </span>
        </div>
        <div class="vtt-tts-controls" id="vtt-tts-controls" style="display: none;">
          <div class="vtt-tts-control" id="vtt-web-voice-group">
            <label>Voice:</label>
            <select id="vtt-tts-voice"></select>
          </div>
          
          <div class="vtt-tts-control">
            <label>Speed:</label>
            <input type="range" id="vtt-tts-rate" min="0.5" max="2" step="0.1" value="1">
            <span id="vtt-tts-rate-value">1.0x</span>
          </div>
        </div>
      </div>
    </div>
  `;

    document.body.appendChild(uiPanel);
    attachUIHandlers();
    loadSettings();
    autoLoadVTT();
}

function attachUIHandlers() {
    // Minimize button
    document.getElementById('vtt-minimize').addEventListener('click', () => {
        const content = document.getElementById('vtt-panel-content');
        const btn = document.getElementById('vtt-minimize');
        if (content.style.display === 'none') {
            content.style.display = 'block';
            btn.textContent = '−';
        } else {
            content.style.display = 'none';
            btn.textContent = '+';
        }
    });

    // Settings toggle
    document.getElementById('vtt-settings-toggle').addEventListener('click', () => {
        const content = document.getElementById('vtt-settings-content');
        content.classList.toggle('hidden');
    });

    // Action buttons
    document.getElementById('vtt-extract').addEventListener('click', handleExtract);
    document.getElementById('vtt-translate').addEventListener('click', handleTranslate);
    document.getElementById('vtt-load').addEventListener('click', handleLoad);
    document.getElementById('vtt-copy-prompt').addEventListener('click', handleCopyPrompt);

    // TTS toggle
    document.getElementById('vtt-tts-switch').addEventListener('click', toggleTTS);

    // TTS voice selection
    document.getElementById('vtt-tts-voice').addEventListener('change', (e) => {
        const voices = speechSynthesis.getVoices();
        // Sort same way as initTTSVoices
        const sortedVoices = voices.sort((a, b) => {
            if (a.lang.startsWith('vi') && !b.lang.startsWith('vi')) return -1;
            if (!a.lang.startsWith('vi') && b.lang.startsWith('vi')) return 1;
            if (a.lang.startsWith('en') && !b.lang.startsWith('en')) return -1;
            if (!a.lang.startsWith('en') && b.lang.startsWith('en')) return 1;
            return a.name.localeCompare(b.name);
        });
        ttsVoice = sortedVoices[e.target.value];
        console.log('Voice changed to:', ttsVoice.name);
        saveTTSSettings();
    });

    // TTS rate control
    document.getElementById('vtt-tts-rate').addEventListener('input', (e) => {
        ttsRate = parseFloat(e.target.value);
        document.getElementById('vtt-tts-rate-value').textContent = ttsRate.toFixed(1) + 'x';
        saveTTSSettings();
    });

    // VTT Input change
    document.getElementById('vtt-input').addEventListener('input', (e) => {
        currentVTT = e.target.value;
        // Debounce save? For now just save on every input or maybe on blur.
        // Let's safe on blur to avoid too many writes, but update currentVTT immediately.
    });

    document.getElementById('vtt-input').addEventListener('blur', async () => {
        if (currentVTT) {
            await saveVTTForModule(currentVTT);
            console.log('Saved VTT from textarea edit');
        }
    });

    // Save settings on change
    ['vtt-provider', 'vtt-api-key', 'vtt-target-lang'].forEach(id => {
        document.getElementById(id).addEventListener('change', saveSettings);
    });
}

function setStatus(message, type = '') {
    const status = document.getElementById('vtt-status');
    status.textContent = message;
    status.className = 'vtt-status' + (type ? ` ${type}` : '');
}

function setProgress(active, progress = 0) {
    const bar = document.getElementById('vtt-progress');
    const fill = bar.querySelector('.vtt-progress-fill');

    if (active) {
        bar.classList.add('active');
        fill.style.width = progress + '%';
    } else {
        bar.classList.remove('active');
    }
}

async function handleExtract() {
    console.log('Extract clicked');
    setStatus('Đang trích xuất...', 'info');
    setProgress(true, 50);

    const video = document.querySelector('video');
    if (!video) {
        setStatus('Không tìm thấy video!', 'error');
        setProgress(false);
        return;
    }

    try {
        // Use existing extractVTT logic
        let vttText = await extractVTTFromVideo(video);

        if (vttText) {
            currentVTT = vttText;
            document.getElementById('vtt-input').value = vttText; // Sync to textarea
            await saveVTTForModule(vttText);
            setStatus(`✓ Đã trích xuất ${vttText.split('\n').length} dòng`, 'success');
            setProgress(true, 100);
            setTimeout(() => setProgress(false), 1000);
        } else {
            setStatus('Không tìm thấy phụ đề', 'warning');
            setProgress(false);
        }
    } catch (error) {
        console.error('Extract error:', error);
        setStatus('Lỗi: ' + error.message, 'error');
        setProgress(false);
    }
}

// Fix VTT timestamps - rebuild VTT with original timestamps and translated text
function fixVTTTimestamps(originalVTT, translatedVTT) {
    try {
        // Parse both VTTs
        const originalCues = parseVTT(originalVTT);
        const translatedCues = parseVTT(translatedVTT);

        // If cue counts don't match, return translated as-is (risky but better than nothing)
        if (originalCues.length !== translatedCues.length) {
            console.warn(`Cue count mismatch: original=${originalCues.length}, translated=${translatedCues.length}`);
            return translatedVTT;
        }

        // Rebuild VTT with original timestamps + translated text
        let fixedVTT = "WEBVTT\n\n";

        for (let i = 0; i < originalCues.length; i++) {
            const origStart = formatTime(originalCues[i].start);
            const origEnd = formatTime(originalCues[i].end);
            const translatedText = translatedCues[i].text;

            fixedVTT += `${origStart} --> ${origEnd}\n${translatedText}\n\n`;
        }

        console.log('✓ Timestamps fixed:', originalCues.length, 'cues');
        return fixedVTT;

    } catch (error) {
        console.error('Error fixing timestamps:', error);
        // Return translated VTT as fallback
        return translatedVTT;
    }
}

// Helper: Merge cues into natural sentences for smooth TTS
function prepareTTSSegments(cues) {
    const segments = [];
    if (cues.length === 0) return segments;

    let currentSegment = {
        start: cues[0].start,
        end: cues[0].end,
        text: cues[0].text,
        cueIndexStart: 0,
        cueIndexEnd: 0
    };

    for (let i = 1; i < cues.length; i++) {
        const cue = cues[i];
        const prevCue = cues[i - 1];

        // Conditions to separate sentences:
        // 1. Previous text ends with sentence ending punctuation (. ? ! :)
        // 2. OR Time gap between cues is too large (> 1.5s) - likely a pause
        const endsWithPunctuation = /[.?!:]['"]?$/.test(currentSegment.text.trim());
        const confirmSentenceEnd = /[.?!]['"]?$/.test(currentSegment.text.trim()); // Stronger check
        const timeGap = cue.start - prevCue.end;

        // Logic: 
        // - If gap > 1.5s, force break
        // - If ends with strong punctuation (.?!), break
        // - If ends with colon (:), break (usually list or definition)
        // - Otherwise, merge

        if (timeGap > 1.5 || confirmSentenceEnd) {
            // Push current sentence
            segments.push(currentSegment);
            // Start new sentence
            currentSegment = {
                start: cue.start,
                end: cue.end,
                text: cue.text,
                cueIndexStart: i,
                cueIndexEnd: i
            };
        } else {
            // Merge into current sentence
            currentSegment.text += ' ' + cue.text;
            currentSegment.end = cue.end; // Extend end time
            currentSegment.cueIndexEnd = i;
        }
    }
    // Push final segment
    segments.push(currentSegment);

    console.log(`TTS Optimization: Merged ${cues.length} cues into ${segments.length} natural sentences.`);
    return segments;
}

async function handleTranslate() {
    if (!currentVTT) {
        setStatus('Vui lòng Extract trước!', 'warning');
        return;
    }

    const apiKey = document.getElementById('vtt-api-key').value;
    const provider = document.getElementById('vtt-provider').value;
    const targetLang = document.getElementById('vtt-target-lang').value;

    if (!apiKey) {
        setStatus('Vui lòng nhập API Key!', 'error');
        document.getElementById('vtt-settings-content').classList.remove('hidden');
        return;
    }

    const courseContext = getCourseContext();
    setStatus(`Đang dịch "${courseContext.title}"... (30-60s)`, 'info');
    setProgress(true, 30);

    try {
        let translated;
        if (provider === 'openai') {
            translated = await translateWithOpenAI(currentVTT, apiKey, targetLang);
        } else {
            translated = await translateWithGemini(currentVTT, apiKey, targetLang);
        }

        // CRITICAL: Fix timestamps to match original to ensure TTS sync
        const originalVTT = currentVTT;
        translated = fixVTTTimestamps(originalVTT, translated);

        // Result is already fixed, update UI
        currentVTT = translated;
        document.getElementById('vtt-input').value = translated; // Sync to textarea
        await saveVTTForModule(translated);
        setStatus('✓ Dịch thành công!', 'success');
        setProgress(true, 100);
        setTimeout(() => setProgress(false), 1000);
    } catch (error) {
        console.error('Translation error:', error);
        setStatus('Lỗi dịch: ' + error.message, 'error');
        setProgress(false);
    }
}

async function handleCopyPrompt() {
    if (!currentVTT) {
        setStatus('Vui lòng Extract trước!', 'warning');
        return;
    }

    const targetLang = document.getElementById('vtt-target-lang').value || 'Vietnamese';
    const courseContext = getCourseContext();

    let contextInfo = `Course: ${courseContext.title}`;
    if (courseContext.topic) {
        contextInfo += `\nCategory: ${courseContext.topic}`;
    }

    const prompt = `Translate the following educational course subtitles to ${targetLang}.

**Course Context:**
${contextInfo}

**Instructions:**
- **CRITICAL:** Translate concisely. The translated text length must be close to the original to ensure Text-to-Speech (TTS) synchronization.
- Avoid expanding sentences; prefer shorter synonyms where accurate.
- Translate technical terms accurately based on the course subject.
- Keep WEBVTT header and all timestamps (HH:MM:SS.mmm --> HH:MM:SS.mmm) EXACTLY as they are.
- Use appropriate professional terminology for this field.

**Content to translate:**

${currentVTT}`;

    try {
        await navigator.clipboard.writeText(prompt);
        setStatus('📋 Đã copy prompt!', 'success');
    } catch (err) {
        console.error('Failed to copy prompt:', err);
        setStatus('Lỗi copy prompt', 'error');
    }
}

async function handleLoad() {
    if (!currentVTT) {
        setStatus('Không có phụ đề để load!', 'warning');
        return;
    }

    setStatus('Đang load phụ đề...', 'info');

    try {
        customCues = parseVTT(currentVTT);
        console.log(`Parsed ${customCues.length} cues`);

        // Prepare TTS segments (sentences) for smooth reading
        ttsSegments = prepareTTSSegments(customCues);
        currentTTSSegment = null;

        videoElement = document.querySelector('video');
        if (!videoElement) {
            throw new Error('Không tìm thấy video');
        }

        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
            overlay = null;
        }

        initOverlay();
        videoElement.removeEventListener('timeupdate', updateSubtitle);
        videoElement.addEventListener('timeupdate', updateSubtitle);
        updateSubtitle();

        setStatus('✓ Đã load phụ đề!', 'success');
    } catch (error) {
        console.error('Load error:', error);
        setStatus('Lỗi: ' + error.message, 'error');
    }
}

// Helper functions

async function extractVTTFromVideo(video) {
    if (video.textTracks && video.textTracks.length > 0) {
        let activeTrack = null;
        for (let i = 0; i < video.textTracks.length; i++) {
            if (video.textTracks[i].mode === 'showing') {
                activeTrack = video.textTracks[i];
                break;
            }
        }
        if (!activeTrack) {
            for (let i = 0; i < video.textTracks.length; i++) {
                if (video.textTracks[i].cues && video.textTracks[i].cues.length > 0) {
                    activeTrack = video.textTracks[i];
                    break;
                }
            }
        }

        if (activeTrack && activeTrack.cues && activeTrack.cues.length > 0) {
            let vttOutput = "WEBVTT\n\n";
            for (let i = 0; i < activeTrack.cues.length; i++) {
                const cue = activeTrack.cues[i];
                const start = formatTime(cue.startTime);
                const end = formatTime(cue.endTime);
                const text = cue.text ? cue.text.replace(/<[^>]*>/g, "") : "";
                vttOutput += `${start} --> ${end}\n${text}\n\n`;
            }
            return vttOutput;
        }
    }

    const tracks = Array.from(video.querySelectorAll('track'));
    const subTrack = tracks.find(t => t.kind === 'subtitles' || t.kind === 'captions') || tracks[0];

    if (subTrack && subTrack.src) {
        const response = await fetch(subTrack.src);
        return await response.text();
    }

    return null;
}

async function translateWithOpenAI(text, apiKey, targetLang) {
    const courseContext = getCourseContext();

    let contextInfo = `Course: ${courseContext.title}`;
    if (courseContext.topic) {
        contextInfo += `\nCategory: ${courseContext.topic}`;
    }

    const systemPrompt = `You are a professional subtitle translator specializing in educational content. Your goal is to provide concise translations that fit within the original time constraints for Text-to-Speech (TTS) synchronization.`;

    const userPrompt = `Translate the following course subtitles to ${targetLang}.

**Course Context:**
${contextInfo}

**Instructions:**
- **CRITICAL:** Translate concisely. The translated text length must be close to the original to ensure TTS can read it in time.
- Avoid expanding sentences with unnecessary words.
- Translate technical terms accurately for this subject.
- Keep WEBVTT header and timestamps unchanged.
- Maintain professional educational tone.

**Content to translate:**

${text}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.3
        })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'OpenAI error');
    return data.choices[0].message.content.trim();
}

async function translateWithGemini(text, apiKey, targetLang) {
    const courseContext = getCourseContext();

    let contextInfo = `Course: ${courseContext.title}`;
    if (courseContext.topic) {
        contextInfo += `\nCategory: ${courseContext.topic}`;
    }

    const prompt = `Translate the following educational course subtitles to ${targetLang}.

**Course Context:**
${contextInfo}

**Instructions:**
- **CRITICAL:** Translate concisely. The translated text length must be close to the original to ensure Text-to-Speech (TTS) synchronization.
- Avoid expanding sentences; prefer shorter synonyms where accurate.
- Translate technical terms accurately based on the course subject.
- Keep WEBVTT header and all timestamps (HH:MM:SS.mmm --> HH:MM:SS.mmm) EXACTLY as they are.
- Use appropriate professional terminology for this field.

**Content to translate:**

${text}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3 }
        })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Gemini error');
    return data.candidates[0].content.parts[0].text.trim();
}

function getCourseContext() {
    // Try to get course title from page
    let courseTitle = '';
    let courseTopic = '';

    // Method 1: From page h1
    const h1 = document.querySelector('h1');
    if (h1) {
        courseTitle = h1.textContent.trim();
    }

    // Method 2: From meta tags
    if (!courseTitle) {
        const metaTitle = document.querySelector('meta[property="og:title"]');
        if (metaTitle) {
            courseTitle = metaTitle.getAttribute('content');
        }
    }

    // Method 3: From URL slug (fallback)
    if (!courseTitle) {
        const urlMatch = window.location.href.match(/\/learn\/([^\/]+)/);
        if (urlMatch) {
            courseTitle = urlMatch[1].replace(/-/g, ' ');
        }
    }

    // Try to detect topic/category
    const breadcrumbs = document.querySelectorAll('[data-track-component="breadcrumb"] a, .breadcrumb a, nav a');
    if (breadcrumbs.length > 0) {
        const topics = Array.from(breadcrumbs).map(b => b.textContent.trim()).filter(t => t);
        if (topics.length > 0) {
            courseTopic = topics.join(' > ');
        }
    }

    return {
        title: courseTitle || 'Unknown Course',
        topic: courseTopic || ''
    };
}

function getModuleId() {
    const url = window.location.href;
    const match = url.match(/coursera\.org\/learn\/([^\/]+)\/.*\/([\w-]+)/);
    return match ? `${match[1]}_${match[2]}` : null;
}

async function saveVTTForModule(vtt) {
    const moduleId = getModuleId();
    if (moduleId) {
        await chrome.storage.local.set({ [`vtt_${moduleId}`]: vtt });
        console.log('Saved VTT for module:', moduleId);
    }
}

async function autoLoadVTT() {
    const moduleId = getModuleId();
    if (moduleId) {
        const result = await chrome.storage.local.get([`vtt_${moduleId}`]);
        if (result[`vtt_${moduleId}`]) {
            currentVTT = result[`vtt_${moduleId}`];

            // Sync to textarea if panel exists
            const input = document.getElementById('vtt-input');
            if (input) input.value = currentVTT;

            setStatus('📂 Đã tải VTT đã lưu', 'success');
            console.log('Auto-loaded VTT for module:', moduleId);
        }
    }
}

function loadSettings() {
    chrome.storage.local.get(['apiKey', 'provider', 'targetLang'], (result) => {
        if (result.apiKey) document.getElementById('vtt-api-key').value = result.apiKey;
        if (result.provider) document.getElementById('vtt-provider').value = result.provider;
        if (result.targetLang) document.getElementById('vtt-target-lang').value = result.targetLang;
    });
}

function saveSettings() {
    const apiKey = document.getElementById('vtt-api-key').value;
    const provider = document.getElementById('vtt-provider').value;
    const targetLang = document.getElementById('vtt-target-lang').value;
    chrome.storage.local.set({ apiKey, provider, targetLang });
}

// ========== TEXT-TO-SPEECH FUNCTIONS ==========

function toggleTTS() {
    ttsEnabled = !ttsEnabled;
    const switchEl = document.getElementById('vtt-tts-switch');
    const controlsEl = document.getElementById('vtt-tts-controls');

    switchEl.classList.toggle('active', ttsEnabled);
    controlsEl.style.display = ttsEnabled ? 'flex' : 'none';

    if (ttsEnabled) {
        initTTSVoices();
        setStatus('🔊 TTS enabled', 'success');
    } else {
        speechSynthesis.cancel();
        setStatus('🔇 TTS disabled', 'info');
        updateTTSIndicator(false);
    }

    saveTTSSettings();
}

function initTTSVoices() {
    const voiceSelect = document.getElementById('vtt-tts-voice');
    const voices = speechSynthesis.getVoices();

    if (voices.length === 0) {
        // Voices not loaded yet, wait
        speechSynthesis.addEventListener('voiceschanged', initTTSVoices, { once: true });
        return;
    }

    voiceSelect.innerHTML = '';

    // Sort: Vietnamese first, then English, then others
    const sortedVoices = voices.sort((a, b) => {
        if (a.lang.startsWith('vi') && !b.lang.startsWith('vi')) return -1;
        if (!a.lang.startsWith('vi') && b.lang.startsWith('vi')) return 1;
        if (a.lang.startsWith('en') && !b.lang.startsWith('en')) return -1;
        if (!a.lang.startsWith('en') && b.lang.startsWith('en')) return 1;
        return a.name.localeCompare(b.name);
    });

    // Add all voices without grouping
    sortedVoices.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
    });

    // Log for debugging
    const viVoices = sortedVoices.filter(v => v.lang.startsWith('vi'));
    console.log('Available voices:', sortedVoices.length);
    console.log('Vietnamese voices:', viVoices.map(v => v.name));

    // Set default voice (first Vietnamese or first overall)
    if (viVoices.length > 0) {
        ttsVoice = viVoices[0];
        voiceSelect.value = sortedVoices.indexOf(viVoices[0]);
        console.log('Selected Vietnamese voice:', ttsVoice.name);
    } else {
        ttsVoice = sortedVoices[0];
        voiceSelect.value = 0;
        console.log('No Vietnamese voice found. Using:', ttsVoice?.name);
        console.log('TIP: Install Vietnamese voice from Windows Settings → Time & Language → Speech');
    }

    loadTTSSettings();
}

function speakText(text) {
    if (!ttsEnabled || !text) return;

    // Cancel any ongoing speech
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }

    // Create new utterance
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.voice = ttsVoice;
    currentUtterance.rate = ttsRate;
    currentUtterance.pitch = 1.0;
    currentUtterance.volume = 1.0;

    currentUtterance.onstart = () => {
        updateTTSIndicator(true);
    };

    currentUtterance.onend = () => {
        updateTTSIndicator(false);
    };

    currentUtterance.onerror = (e) => {
        console.error('TTS error:', e);
        updateTTSIndicator(false);
    };

    speechSynthesis.speak(currentUtterance);
}

function speakText(text) {
    if (!ttsEnabled || !text) return;

    // Use Edge TTS if enabled (better for Vietnamese)
    if (useEdgeTTS) {
        if (!edgeTTSClient) {
            edgeTTSClient = new EdgeTTS();
            edgeTTSClient.onStart = () => updateTTSIndicator(true);
            edgeTTSClient.onEnd = () => updateTTSIndicator(false);
        }

        edgeTTSClient.speak(text, edgeVoice, ttsRate).catch(error => {
            console.error('Edge TTS error:', error);
            updateTTSIndicator(false);
        });
        return;
    }

    // Fall back to Web Speech API
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }

    currentUtterance = new SpeechSynthesisUtterance(text);

    // CRITICAL: Set language to Vietnamese
    currentUtterance.lang = 'vi-VN';

    // Use selected voice or try to find Vietnamese voice
    if (ttsVoice) {
        currentUtterance.voice = ttsVoice;
    } else {
        // Auto-select Vietnamese voice if available
        const voices = speechSynthesis.getVoices();
        const viVoice = voices.find(v => v.lang.startsWith('vi'));
        if (viVoice) {
            currentUtterance.voice = viVoice;
            ttsVoice = viVoice; // Remember for next time
            console.log('Auto-selected Vietnamese voice:', viVoice.name);
        } else {
            console.warn('No Vietnamese voice found! Install from Windows Settings.');
        }
    }

    currentUtterance.rate = ttsRate;
    currentUtterance.pitch = 1.0;
    currentUtterance.volume = 1.0;

    currentUtterance.onstart = () => {
        updateTTSIndicator(true);
    };

    currentUtterance.onend = () => {
        updateTTSIndicator(false);
    };

    currentUtterance.onerror = (e) => {
        console.error('TTS error:', e);
        updateTTSIndicator(false);
    };

    speechSynthesis.speak(currentUtterance);
}

function updateTTSIndicator(speaking) {
    const indicator = document.getElementById('vtt-tts-indicator');
    if (indicator) {
        indicator.style.display = speaking ? 'inline-flex' : 'none';
    }
}

function saveTTSSettings() {
    chrome.storage.local.set({
        ttsEnabled: ttsEnabled,
        ttsRate: ttsRate,
        ttsVoiceIndex: ttsVoice ? speechSynthesis.getVoices().indexOf(ttsVoice) : 0
    });
}

function loadTTSSettings() {
    chrome.storage.local.get(['ttsEnabled', 'useEdgeTTS', 'edgeVoice', 'ttsRate', 'ttsVoiceIndex'], (result) => {
        if (result.ttsEnabled) {
            ttsEnabled = result.ttsEnabled;
            document.getElementById('vtt-tts-switch').classList.toggle('active', ttsEnabled);
            document.getElementById('vtt-tts-controls').style.display = ttsEnabled ? 'flex' : 'none';
        }

        // Removed EdgeTTS settings loading

        if (result.ttsRate) {
            ttsRate = result.ttsRate;
            document.getElementById('vtt-tts-rate').value = ttsRate;
            document.getElementById('vtt-tts-rate-value').textContent = ttsRate.toFixed(1) + 'x';
        }

        if (result.ttsVoiceIndex !== undefined) {
            const voices = speechSynthesis.getVoices();
            if (voices[result.ttsVoiceIndex]) {
                ttsVoice = voices[result.ttsVoiceIndex];
                document.getElementById('vtt-tts-voice').value = result.ttsVoiceIndex;
            }
        }
    });
}

// function updateTTSUI removed


// Initialize UI when page is ready
let lastUrl = window.location.href;

function initWhenReady() {
    console.log('=== Initializing VTT Panel ===');
    console.log('Document ready state:', document.readyState);
    console.log('Body exists:', !!document.body);

    if (document.body) {
        if (!uiPanel) {
            createUIPanel();
            console.log('VTT Panel created! Check bottom-right corner.');
        }

        // Start URL monitoring
        setInterval(() => {
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
                console.log('URL changed:', lastUrl, '->', currentUrl);
                lastUrl = currentUrl;
                handleUrlChange();
            }
        }, 1000);

    } else {
        console.log('Body not ready, waiting...');
        setTimeout(initWhenReady, 500);
    }
}

async function handleUrlChange() {
    // Clear current state
    currentVTT = '';
    const input = document.getElementById('vtt-input');
    if (input) input.value = '';
    setStatus('New page detected', 'info');

    // Try to load VTT for new module
    await autoLoadVTT();

    // Attempt to re-extract if auto-load found nothing? 
    // Maybe better to let user extract manually to avoid issues.
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM Content Loaded');
        setTimeout(initWhenReady, 2000);
    });
} else {
    console.log('Document already loaded');
    setTimeout(initWhenReady, 2000);
}

// Retry on window load if panel doesn't exist
window.addEventListener('load', () => {
    if (!uiPanel) {
        console.log('Window loaded, retrying panel creation...');
        setTimeout(initWhenReady, 1000);
    }
});

