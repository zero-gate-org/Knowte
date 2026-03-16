const techItems = [
  { name: "Tauri v2", desc: "Desktop runtime", logo: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-10 h-10"><path fill="#FFC131" d="M13.912 0a8.72 8.72 0 0 0-8.308 6.139c1.05-.515 2.18-.845 3.342-.976 2.415-3.363 7.4-3.412 9.88-.097 2.48 3.315 1.025 8.084-2.883 9.45a6.131 6.131 0 0 1-.3 2.762 8.72 8.72 0 0 0 3.01-1.225A8.72 8.72 0 0 0 13.913 0zm.082 6.451a2.284 2.284 0 1 0-.15 4.566 2.284 2.284 0 0 0 .15-4.566zm-5.629.27a8.72 8.72 0 0 0-3.031 1.235 8.72 8.72 0 1 0 13.06 9.9131 10.173 10.174 0 0 1-3.343.965 6.125 6.125 0 1 1-7.028-9.343 6.114 6.114 0 0 1 .342-2.772zm1.713 6.27a2.284 2.284 0 0 0-2.284 2.283 2.284 2.284 0 0 0 2.284 2.284 2.284 2.284 0 0 0 2.284-2.284 2.284 2.284 0 0 0-2.284-2.284z"/></svg>` },
  { name: "Rust", desc: "Backend logic", logo: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-10 h-10"><path fill="#B7410E" d="M23.8346 11.7033l-1.0073-.6236a13.7268 13.7268 0 00-.0283-.2936l.8656-.8069a.3483.3483 0 00-.1154-.578l-1.1066-.414a8.4958 8.4958 0 00-.087-.2856l.6904-.9587a.3462.3462 0 00-.2257-.5446l-1.1663-.1894a9.3574 9.3574 0 00-.1407-.2622l.49-1.0761a.3437.3437 0 00-.0274-.3361.3486.3486 0 00-.3006-.154l-1.1845.0416a6.7444 6.7444 0 00-.1873-.2268l.2723-1.153a.3472.3472 0 00-.417-.4172l-1.1532.2724a14.0183 14.0183 0 00-.2278-.1873l.0415-1.1845a.3442.3442 0 00-.49-.328l-1.076.491c-.0872-.0476-.1742-.0952-.2623-.1407l-.1903-1.1673A.3483.3483 0 0016.256.955l-.9597.6905a8.4867 8.4867 0 00-.2855-.086l-.414-1.1066a.3483.3483 0 00-.5781-.1154l-.8069.8666a9.2936 9.2936 0 00-.2936-.0284L12.2946.1683a.3462.3462 0 00-.5892 0l-.6236 1.0073a13.7383 13.7383 0 00-.2936.0284L9.9803.3374a.3462.3462 0 00-.578.1154l-.4141 1.1065c-.0962.0274-.1903.0567-.2855.086L7.744.955a.3483.3483 0 00-.5447.2258L7.009 2.348a9.3574 9.3574 0 00-.2622.1407l-1.0762-.491a.3462.3462 0 00-.49.328l.0416 1.1845a7.9826 7.9826 0 00-.2278.1873L3.8413 3.425a.3472.3472 0 00-.4171.4171l.2713 1.1531c-.0628.075-.1255.1509-.1863.2268l-1.1845-.0415a.3462.3462 0 00-.328.49l.491 1.0761a9.167 9.167 0 00-.1407.2622l-1.1662.1894a.3483.3483 0 00-.2258.5446l.6904.9587a13.303 13.303 0 00-.087.2855l-1.1065.414a.3483.3483 0 00-.1155.5781l.8656.807a9.2936 9.2936 0 00-.0283.2935l-1.0073.6236a.3442.3442 0 000 .5892l1.0073.6236c.008.0982.0182.1964.0283.2936l-.8656.8079a.3462.3462 0 00.1155.578l1.1065.4141c.0273.0962.0567.1914.087.2855l-.6904.9587a.3452.3452 0 00.2268.5447l1.1662.1893c.0456.088.0922.1751.1408.2622l-.491 1.0762a.3462.3462 0 00.328.49l1.1834-.0415c.0618.0769.1235.1528.1873.2277l-.2713 1.1541a.3462.3462 0 00.4171.4161l1.153-.2713c.075.0638.151.1255.2279.1863l-.0415 1.1845a.3442.3442 0 00.49.327l1.0761-.49c.087.0486.1741.0951.2622.1407l.1903 1.1662a.3483.3483 0 00.5447.2268l.9587-.6904a9.299 9.299 0 00.2855.087l.414 1.1066a.3452.3452 0 00.5781.1154l.8079-.8656c.0972.0111.1954.0203.2936.0294l.6236 1.0073a.3472.3472 0 00.5892 0l.6236-1.0073c.0982-.0091.1964-.0183.2936-.0294l.8069.8656a.3483.3483 0 00.578-.1154l.4141-1.1066a8.4626 8.4626 0 00.2855-.087l.9587.6904a.3452.3452 0 00.5447-.2268l.1903-1.1662c.088-.0456.1751-.0931.2622-.1407l1.0762.49a.3472.3472 0 00.49-.327l-.0415-1.1845a6.7267 6.7267 0 00.2267-.1863l1.1531.2713a.3472.3472 0 00.4171-.416l-.2713-1.1542c.0628-.0749.1255-.1508.1863-.2278l1.1845.0415a.3442.3442 0 00.328-.49l-.49-1.076c.0475-.0872.0951-.1742.1407-.2623l1.1662-.1893a.3483.3483 0 00.2258-.5447l-.6904-.9587.087-.2855 1.1066-.414a.3462.3462 0 00.1154-.5781l-.8656-.8079c.0101-.0972.0202-.1954.0283-.2936l1.0073-.6236a.3442.3442 0 000-.5892zm-6.7413 8.3551a.7138.7138 0 01.2986-1.396.714.714 0 11-.2997 1.396zm-.3422-2.3142a.649.649 0 00-.7715.5l-.3573 1.6685c-1.1035.501-2.3285.7795-3.6193.7795a8.7368 8.7368 0 01-3.6951-.814l-.3574-1.6684a.648.648 0 00-.7714-.499l-1.473.3158a8.7216 8.7216 0 01-.7613-.898h7.1676c.081 0 .1356-.0141.1356-.088v-2.536c0-.074-.0536-.0881-.1356-.0881h-2.0966v-1.6077h2.2677c.2065 0 1.1065.0587 1.394 1.2088.0901.3533.2875 1.5044.4232 1.8729.1346.413.6833 1.2381 1.2685 1.2381h3.5716a.7492.7492 0 00.1296-.0131 8.7874 8.7874 0 01-.8119.9526z"/></svg>` },
  { name: "React 19", desc: "UI framework", logo: `<img src="assets/logos/React.svg" alt="React" class="w-10 h-10" />` },
  { name: "TypeScript", desc: "Type safety", logo: `<img src="assets/logos/typescript-programming-language-icon.svg" alt="TypeScript" class="w-10 h-10" />` },
  { name: "Tailwind v4", desc: "Styling", logo: `<img src="assets/logos/tailwindcss-mark.96ee6a5a.svg" alt="Tailwind" class="w-10 h-10" />` },
  { name: "Whisper.cpp", desc: "Transcription", logo: `<img src="assets/logos/openai.svg" alt="Whisper" class="w-10 h-10" />` },
  { name: "Ollama", desc: "Local LLM", logo: `<svg viewBox="0 0 17 25" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-10 h-10"><path fill="#F59E0B" d="M4.40517 0.102088C4.62117 0.198678 4.81617 0.357766 4.99317 0.56799C5.28817 0.915712 5.53718 1.41342 5.72718 2.00318C5.91818 2.59635 6.04218 3.25316 6.08918 3.91224C6.71878 3.5075 7.41754 3.26103 8.13818 3.18953L8.18918 3.18498C9.05919 3.10544 9.91919 3.28384 10.6692 3.72361C10.7702 3.78384 10.8692 3.84861 10.9662 3.91679C11.0162 3.27021 11.1382 2.62817 11.3262 2.04863C11.5162 1.45773 11.7652 0.961166 12.0592 0.612308C12.2235 0.410338 12.4245 0.251368 12.6482 0.146406C12.9052 0.032771 13.1782 0.0123167 13.4442 0.098679C13.8452 0.228223 14.1892 0.516855 14.4602 0.936167C14.7082 1.3191 14.8942 1.81 15.0212 2.39863C15.2512 3.45998 15.2912 4.85655 15.1362 6.54061L15.1892 6.58607L15.2152 6.60766C15.9722 7.26219 16.4992 8.19513 16.7782 9.27807C17.2133 10.9678 16.9943 12.8632 16.2442 13.9235L16.2262 13.9473L16.2282 13.9507C16.6453 14.8166 16.8983 15.7314 16.9523 16.678L16.9543 16.7121C17.0183 17.9223 16.7542 19.1404 16.1402 20.337L16.1332 20.3484L16.1432 20.3756C16.6152 21.6904 16.7632 23.0142 16.5812 24.3369L16.5752 24.3813C16.547 24.5744 16.4525 24.7472 16.3125 24.8612C16.1725 24.9753 15.9983 25.0219 15.8282 24.9903C15.744 24.9753 15.6632 24.9417 15.5904 24.8912C15.5177 24.8408 15.4544 24.7744 15.4042 24.696C15.3541 24.6178 15.318 24.529 15.2981 24.4347C15.2782 24.3406 15.2748 24.2428 15.2882 24.1472C15.4552 22.9733 15.2982 21.7961 14.8082 20.5984C14.7625 20.4871 14.7422 20.3645 14.7492 20.242C14.7562 20.1194 14.7902 20.0009 14.8482 19.8972L14.8522 19.8904C15.4562 18.8404 15.7062 17.8109 15.6522 16.7996C15.6062 15.9143 15.3272 15.045 14.8522 14.2166C14.7598 14.0556 14.7269 13.8597 14.7606 13.6713C14.7943 13.4829 14.8918 13.3171 15.0322 13.2098L15.0412 13.203C15.2842 13.0223 15.5082 12.561 15.6212 11.9303C15.7459 11.1846 15.7133 10.4159 15.5262 9.68716C15.3212 8.89171 14.9462 8.22809 14.4212 7.77468C13.8262 7.25878 13.0382 7.00992 12.0412 7.08151C11.9108 7.09115 11.7809 7.05613 11.6682 6.98097C11.5556 6.90581 11.4653 6.7939"/></svg>` },
  { name: "SQLite", desc: "Database", logo: `<img src="assets/logos/sqlite.svg" alt="SQLite" class="w-10 h-10" />` },
  { name: "React Flow", desc: "Mind maps", logo: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-10 h-10"><rect width="24" height="24" rx="4" fill="#00C2A8"/><path fill="#fff" d="M7 12h10M12 7v10"/></svg>` },
  { name: "Vite 7", desc: "Bundler", logo: `<img src="assets/logos/vite-dev-icon.svg" alt="Vite" class="w-10 h-10" />` },
  { name: "yt-dlp", desc: "YouTube audio", logo: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-10 h-10"><rect width="24" height="24" rx="4" fill="#FF0000"/><path fill="#fff" d="M10 8l6 4-6 4V8z"/></svg>` },
  { name: "ffmpeg", desc: "Media processing", logo: `<img src="assets/logos/ffmpeg.svg" alt="ffmpeg" class="w-10 h-10" />` },
];

const features = [
  { icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/>`, title: "Audio & Video Input", desc: "Upload audio/video files or record from your mic. Supports MP3, WAV, M4A, OGG, WebM, MP4, MKV, and more." },
  { icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z"/>`, title: "YouTube Import", desc: "Paste any YouTube URL. Knowte downloads and transcribes the audio automatically using yt-dlp." },
  { icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>`, title: "Smart Transcription", desc: "Local speech-to-text via Whisper.cpp. Choose from tiny (~75 MB) to large (~3 GB) models." },
  { icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/>`, title: "Structured Notes", desc: "AI-generated notes organised into topics, key points, examples, key terms, and takeaways." },
  { icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"/>`, title: "Interactive Quiz", desc: "Auto-generated MCQ, true/false, and short-answer questions with explanations and score tracking." },
  { icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25L12 17.25 2.25 12l4.179-2.25"/>`, title: "Flashcards + Anki Export", desc: "Card-flip animations, three-pile study mode, and export to Anki .apkg or .txt formats." },
  { icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"/>`, title: "Mind Map", desc: "Visual tree of lecture concepts using React Flow. Export as PNG or SVG." },
  { icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/>`, title: "Research Papers", desc: "Related academic papers via Semantic Scholar API. The only optional internet feature." },
  { icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>`, title: "Explain This", desc: "Select any text and get a contextual AI explanation with simpler/deeper controls." },
];

const steps = [
  { num: "01", title: "Upload or Record", desc: "Drop an audio/video file, paste a YouTube link, or hit record. Knowte handles all popular formats.", icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>` },
  { num: "02", title: "AI Processes It", desc: "Whisper transcribes the audio, then Ollama generates notes, quizzes, flashcards, mind maps, and papers.", icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21a48.317 48.317 0 01-8.135-.687c-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"/>` },
  { num: "03", title: "Study & Export", desc: "Review your materials, take quizzes, study flashcards, explore the mind map, and export to Anki.", icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84 50.717 50.717 0 00-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/>` },
];

// === RENDER FUNCTIONS ===
function renderFeatures() {
  const grid = document.getElementById("features-grid");
  if (!grid) return;
  grid.innerHTML = features.map((f, i) => `
    <div class="feature-card rounded-2xl p-6 reveal" style="--delay: ${i * 0.08}s">
      <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 flex items-center justify-center mb-4 border border-amber-500/10">
        <svg class="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">${f.icon}</svg>
      </div>
      <h3 class="font-display font-semibold text-lg text-zinc-100 mb-2">${f.title}</h3>
      <p class="text-zinc-400 text-sm leading-relaxed">${f.desc}</p>
    </div>
  `).join("");
}

function renderSteps() {
  const grid = document.getElementById("steps-grid");
  if (!grid) return;
  grid.innerHTML = steps.map((s, i) => `
    <div class="reveal ${i < steps.length - 1 ? "step-connector" : ""}" style="--delay: ${i * 0.15}s">
      <div class="bg-zinc-900/40 backdrop-blur-sm rounded-2xl p-8 border border-zinc-800/50 text-center h-full">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 flex items-center justify-center mb-5 border border-amber-500/10">
          <svg class="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">${s.icon}</svg>
        </div>
        <span class="text-amber-500/60 font-display font-bold text-sm tracking-widest">${s.num}</span>
        <h3 class="font-display font-semibold text-xl text-zinc-100 mt-3 mb-3">${s.title}</h3>
        <p class="text-zinc-400 text-sm leading-relaxed">${s.desc}</p>
      </div>
    </div>
  `).join("");
}

function renderTech() {
  const grid = document.getElementById("tech-grid");
  if (!grid) return;
  grid.innerHTML = techItems.map((t, i) => `
    <div class="tech-card bg-zinc-900/40 backdrop-blur-sm rounded-xl p-4 border border-zinc-800/30 text-center reveal flex flex-col items-center justify-center" style="--delay: ${i * 0.04}s">
      <div class="w-12 h-12 mb-3 flex items-center justify-center">${t.logo}</div>
      <p class="font-semibold text-zinc-200 text-sm">${t.name}</p>
      <p class="text-zinc-500 text-xs mt-1">${t.desc}</p>
    </div>
  `).join("");
}

// === INTERACTIVITY ===
const navbar = document.getElementById("navbar");
window.addEventListener("scroll", () => {
  if (window.scrollY > 40) navbar.classList.add("navbar-scrolled");
  else navbar.classList.remove("navbar-scrolled");
});

const toggle = document.getElementById("mobile-toggle");
const mobileMenu = document.getElementById("mobile-menu");
toggle.addEventListener("click", () => mobileMenu.classList.toggle("hidden"));
mobileMenu.querySelectorAll("a").forEach(a => a.addEventListener("click", () => mobileMenu.classList.add("hidden")));

const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { 
    if (e.isIntersecting) { 
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
      observer.unobserve(e.target); 
    } 
  });
}, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

function observeReveals() {
  document.querySelectorAll(".reveal").forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
    el.style.animationDelay = el.style.getPropertyValue('--delay') || '0s';
    observer.observe(el);
  });
}

// === DOWNLOADS ===
let currentPlatform = 'windows';
let releasesData = [];

const platformFilters = {
  windows: ['.msi', '.exe'],
  mac: ['.dmg'],
  linux: ['.rpm', '.deb', '.AppImage', '.tar.gz']
};

const platformNames = {
  windows: 'Windows',
  mac: 'macOS',
  linux: 'Linux'
};

const iconSvgs = {
  windows: `<svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 5.5L10.5 2V11.5H3V5.5Z" fill="#F25022"/><path d="M21 5.5L13.5 2V11.5H21V5.5Z" fill="#7FBA00"/><path d="M3 18.5L10.5 22V12.5H3V18.5Z" fill="#00A4EF"/><path d="M21 18.5L13.5 22V12.5H21V18.5Z" fill="#FFB900"/></svg>`,
  mac: `<svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" fill="#fff"/></svg>`,
  linux: `<svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7v10l10 5 10-5V7L12 2z" fill="#FCC624"/><path fill="#000" d="M12 6l-3 1.5v3l3 1.5 3-1.5v-3l-3-1.5zM9 13l-2 1v2l2 1 2-1v-2l-2-1zM15 13l2 1v2l-2 1-2-1v-2l2-1zM12 17l-1 .5v1l1 .5 1-.5v-1l-1-.5z"/></svg>`
};

async function fetchReleases() {
  try {
    const response = await fetch('https://api.github.com/repos/zero-gate-org/Knowte/releases');
    if (!response.ok) throw new Error('Failed to fetch releases');
    releasesData = await response.json();
    renderDownloads();
  } catch (error) {
    console.error('Error fetching releases:', error);
    document.getElementById('downloads-grid').innerHTML = `
      <div class="col-span-full text-center py-8 text-red-400">
        <p>Failed to load releases. Please try again later.</p>
        <a href="https://github.com/zero-gate-org/Knowte/releases" target="_blank" class="text-amber-400 hover:underline mt-2 inline-block">View on GitHub</a>
      </div>
    `;
  }
}

function filterByPlatform(releases) {
  if (!releases || releases.length === 0) return [];
  
  const latestRelease = releases[0];
  const filters = platformFilters[currentPlatform];
  const downloads = [];
  const seenUrls = new Set();
  
  for (const asset of latestRelease.assets) {
    if (seenUrls.has(asset.browser_download_url)) continue;
    
    const name = asset.name.toLowerCase();
    for (const filter of filters) {
      if (name.includes(filter)) {
        downloads.push({
          name: asset.name,
          size: formatSize(asset.size),
          url: asset.browser_download_url,
          version: latestRelease.tag_name,
          published: new Date(latestRelease.published_at).toLocaleDateString()
        });
        seenUrls.add(asset.browser_download_url);
        break;
      }
    }
  }
  
  return downloads;
}

function formatSize(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function renderDownloads() {
  const grid = document.getElementById('downloads-grid');
  const versionInfo = document.getElementById('version-info');
  
  if (!grid) return;
  
  const downloads = filterByPlatform(releasesData);
  
  if (downloads.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-8 text-zinc-400">
        <p>No downloads available for ${platformNames[currentPlatform]} yet.</p>
        <a href="https://github.com/zero-gate-org/Knowte/releases" target="_blank" class="text-amber-400 hover:underline mt-2 inline-block">View all releases on GitHub</a>
      </div>
    `;
    return;
  }
  
  const latestVersion = downloads[0]?.version || 'Latest';
  versionInfo.innerHTML = `<p>Latest: <span class="text-amber-400">${latestVersion}</span> • ${downloads.length} installer(s) available</p>`;
  
  grid.innerHTML = downloads.map(d => `
    <a href="${d.url}" target="_blank" class="tech-card group bg-zinc-900/60 backdrop-blur-sm rounded-xl p-5 border border-zinc-800/50 hover:border-amber-500/30 transition-all duration-300 flex items-center gap-4 w-full sm:w-auto min-w-[280px]">
      <div class="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500/20 transition-colors">
        ${iconSvgs[currentPlatform]}
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-zinc-200 text-sm truncate">${d.name}</p>
        <p class="text-zinc-500 text-xs mt-1">${d.size}</p>
      </div>
      <svg class="w-5 h-5 text-zinc-500 group-hover:text-amber-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
    </a>
  `).join('');
}

function setPlatform(platform) {
  currentPlatform = platform;
  
  document.querySelectorAll('.platform-tab').forEach(tab => {
    tab.classList.remove('bg-amber-500', 'text-black');
    tab.classList.add('bg-zinc-800', 'text-zinc-400');
  });
  
  const activeTab = document.getElementById(`tab-${platform}`);
  activeTab.classList.remove('bg-zinc-800', 'text-zinc-400');
  activeTab.classList.add('bg-amber-500', 'text-black');
  
  renderDownloads();
}

document.addEventListener("DOMContentLoaded", () => {
  renderFeatures();
  renderSteps();
  renderTech();
  observeReveals();
  fetchReleases();
});
