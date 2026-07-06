// EcoPrompt Coach demo — shared mock-chat logic for all three skins.
//
// The page provides either a <textarea> or a [contenteditable] composer plus
// a send button; this script wires up sending, fake streaming replies, and
// the example-prompt drawer. Programmatic composer changes always dispatch
// an 'input' event so the EcoPrompt extension re-analyzes exactly as if the
// user had typed.

'use strict';

(() => {
  const composer = document.querySelector('[data-demo-composer]');
  const sendBtn = document.querySelector('[data-demo-send]');
  const thread = document.querySelector('[data-demo-thread]');
  const greeting = document.querySelector('[data-demo-greeting]');
  if (!composer || !sendBtn || !thread) return;

  const isTextarea = composer.tagName === 'TEXTAREA';

  // ---------------------------------------------------------------------
  // Composer helpers
  // ---------------------------------------------------------------------

  function getText() {
    return isTextarea ? composer.value : composer.innerText || '';
  }

  function setText(text) {
    if (isTextarea) composer.value = text;
    else composer.textContent = text;
    composer.dispatchEvent(new Event('input', { bubbles: true }));
    autoGrow();
  }

  function autoGrow() {
    if (!isTextarea) return;
    composer.style.height = 'auto';
    composer.style.height = `${Math.min(220, composer.scrollHeight)}px`;
  }

  // ---------------------------------------------------------------------
  // Canned assistant replies — chosen so testers see believable answers
  // that also reinforce the coaching (short when the prompt is budgeted).
  // ---------------------------------------------------------------------

  const BUDGETED = /\b\d{1,4}\s*words?\b|yes\s+or\s+no|one\s+(?:sentence|paragraph|word)|briefly|bullet\s+points?\s+only|be\s+concise/i;

  const CANNED = [
    {
      match: /photosynthesis/i,
      short:
        'Photosynthesis, in brief:\n• Chlorophyll absorbs sunlight in the leaves\n• Roots supply water; stomata take in CO₂\n• Light reactions split water and release oxygen\n• The Calvin cycle turns CO₂ into glucose\n• Glucose fuels the plant — the basis of most food chains',
      long:
        "Photosynthesis is the process by which plants, algae and some bacteria convert light energy into chemical energy stored in glucose.\n\nIt happens in two stages inside chloroplasts. In the light-dependent reactions, chlorophyll in the thylakoid membranes absorbs photons, splitting water molecules into oxygen (released through the stomata), protons and electrons, and producing the energy carriers ATP and NADPH.\n\nIn the light-independent Calvin cycle, those carriers power the fixation of atmospheric CO₂ into three-carbon sugars, which are assembled into glucose. The overall equation is 6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂. Nearly all life on Earth ultimately depends on this reaction, either directly or through food chains."
    },
    {
      match: /landlord|heater/i,
      long:
        'Subject: Broken heater in unit 4B — repair request\n\nDear Mr. van Dijk,\n\nThe heater in my apartment stopped working on Sunday evening, and indoor temperatures have dropped below 15 °C. Could you arrange a repair visit this week? I am home after 17:00 on weekdays and all day Saturday.\n\nPlease let me know a time that suits the technician.\n\nKind regards,\nAlex'
    },
    {
      match: /translate.*japanese/i,
      long:
        '"Thank you so much for your help" in Japanese:\n\n手伝ってくれて本当にありがとうございます。\n(Tetsudatte kurete hontō ni arigatō gozaimasu.)\n\nMore formal, e.g. to a colleague or client:\nご協力いただき誠にありがとうございます。\n(Gokyōryoku itadaki makoto ni arigatō gozaimasu.)'
    },
    {
      match: /poem.*weather|weather.*poem/i,
      long:
        'Paris wears the rain like an old friend,\nzinc rooftops silvered, boulevards aglow.\nCafé windows fog where lovers lean and mend\nthe afternoon with coffee, slow.\n\nThen sun — a rumor down the Seine —\nturns every puddle into stained-glass light,\nand Paris shrugs, and it is spring again,\nuntil the clouds rehearse tonight.'
    },
    {
      match: /weather/i,
      long:
        "I don't have access to real-time weather data, so I can't give you an accurate forecast for tomorrow. A weather app or site (Buienradar, KNMI, weather.com) will give you the current forecast instantly — and, as the coach pill probably just told you, at a fraction of the energy of asking a language model."
    },
    {
      match: /15%\s*tip|tip on/i,
      long:
        'A 15% tip on €84.50 is €12.68 (84.50 × 0.15 = 12.675, rounded to the cent). Total with tip: €97.18.\n\nWorth noting: your phone\'s calculator does this instantly, exactly, and with essentially zero energy.'
    },
    {
      match: /restaurant|pizza.*near me/i,
      long:
        "I can't see your location or live opening hours, so I may hallucinate restaurant names — a maps app gives real, current results for \"pizza near me\". If you want, I can instead explain what makes a great Neapolitan pizza so you know what to look for."
    },
    {
      match: /express|email address(es)?.*valid|validat.*email/i,
      long:
        "Here's a minimal Express endpoint with validation and a test:\n\nconst express = require('express');\nconst app = express();\napp.use(express.json());\n\nconst EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n\napp.post('/validate-email', (req, res) => {\n  const { email } = req.body || {};\n  const valid = typeof email === 'string' && EMAIL_RE.test(email);\n  res.status(valid ? 200 : 422).json({ email, valid });\n});\n\nmodule.exports = app;\n\n// test (supertest + node:test)\nconst request = require('supertest');\ntest('accepts a valid email', async () => {\n  await request(app).post('/validate-email').send({ email: 'a@b.co' }).expect(200);\n});\ntest('rejects an invalid email', async () => {\n  await request(app).post('/validate-email').send({ email: 'nope' }).expect(422);\n});"
    },
    {
      match: /data cent(er|re)s.*(impact|report)|research.*data cent/i,
      long:
        'Environmental impact of data centers — summary of the current evidence:\n\n1. Electricity. Data centers used an estimated 415 TWh in 2024 (~1.5% of global demand, IEA), with AI workloads the fastest-growing slice. Efficient hyperscale facilities run at PUE ≈ 1.1; older enterprise rooms can exceed 1.8.\n\n2. Water. Evaporative cooling consumes 0.2–2 L per kWh on site, with large additional withdrawals embedded in electricity generation. Siting in water-stressed regions is the key controversy.\n\n3. Carbon. Impact depends overwhelmingly on the local grid: the same workload emits ~15× more CO₂ on a coal-heavy grid than in Nordic regions. Leading operators buy renewables, but hourly matching remains rare.\n\n4. Hardware lifecycle. Manufacturing adds roughly 10–20% on top of operational emissions and drives rare-earth mining and e-waste concerns.\n\nNote: this simulated agentic research task chained multiple model calls — exactly why the coach flags it at ~2× energy.'
    },
    {
      match: /generate image|watercolor|solar farm/i,
      long:
        '🖼️ [Simulated image: a watercolor solar farm at sunset — amber sky washing over tilted panels, loose brushwork, soft paper texture.]\n\nTip from the coach: diffusion models run ~3× the energy of a text task, and regeneration is the hidden cost. Reuse a good prompt rather than re-rolling.'
    },
    {
      match: /typescript.*javascript/i,
      short: 'Yes.',
      long: 'Yes — TypeScript is a strict syntactic superset of JavaScript: every valid JS program is valid TS, with optional static typing layered on top.'
    },
    {
      match: /summarize.*meeting notes/i,
      long:
        'Key points from the quarterly meeting notes:\n• Revenue up 8% QoQ; churn steady at 2.1%\n• Mobile launch slips two weeks to mid-November\n• Hiring: two backend roles approved, design freeze until Q1\n• Action items: Sam owns the pricing experiment, Priya drafts the SOC 2 timeline'
    },
    {
      match: /etymology|define the word/i,
      long:
        "'Please' is a shortening of 'if you please' — from Old French 'plaisir' (to please, give pleasure), itself from Latin 'placere'. It entered English around the 14th century and contracted to a bare politeness marker by the 17th."
    }
  ];

  const GENERIC_LONG =
    "Good question — here's a structured answer.\n\nFirst, the short version: it depends on a handful of factors that interact more than people expect, so most one-line answers you'll read are half right.\n\nSecond, the mechanics: the dominant factor is usually the one you can measure directly, so start there before optimizing anything downstream. Small early choices compound.\n\nThird, the practical takeaway: pick the simplest option that meets your actual constraint, measure it, and only add complexity when the measurement says so. If you tell me more about your specific situation, I can tailor this.";

  const GENERIC_SHORT =
    'Short version: the simplest option that meets your actual constraint is the right one — measure first, add complexity only when the numbers demand it.';

  function pickResponse(prompt) {
    const budgeted = BUDGETED.test(prompt);
    for (const c of CANNED) {
      if (c.match.test(prompt)) {
        if (budgeted && c.short) return c.short;
        return budgeted && !c.short ? c.long.split('\n\n')[0] : c.long;
      }
    }
    return budgeted ? GENERIC_SHORT : GENERIC_LONG;
  }

  // ---------------------------------------------------------------------
  // Message rendering + fake streaming
  // ---------------------------------------------------------------------

  function addMessage(role, text) {
    const row = document.createElement('div');
    row.className = `demo-msg demo-msg-${role}`;
    const avatar = document.createElement('div');
    avatar.className = 'demo-avatar';
    avatar.textContent = role === 'user' ? 'You' : document.body.dataset.assistantInitial || 'AI';
    const bubble = document.createElement('div');
    bubble.className = 'demo-bubble';
    bubble.textContent = text;
    row.append(avatar, bubble);
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
    return bubble;
  }

  let streaming = false;

  function streamReply(fullText, onDone) {
    streaming = true;
    const bubble = addMessage('assistant', '');
    bubble.classList.add('demo-streaming');
    const tokens = fullText.split(/(\s+)/);
    let i = 0;
    const timer = setInterval(() => {
      // 2–3 tokens per tick reads like real streaming without dragging.
      bubble.textContent += tokens.slice(i, i + 3).join('');
      i += 3;
      thread.scrollTop = thread.scrollHeight;
      if (i >= tokens.length) {
        clearInterval(timer);
        bubble.classList.remove('demo-streaming');
        streaming = false;
        if (onDone) onDone();
      }
    }, 45);
  }

  function send() {
    const text = getText().trim();
    if (!text || streaming) return;
    if (greeting) greeting.remove();
    addMessage('user', text);
    // Clear one tick later so the EcoPrompt extension's own keydown/click
    // listeners (registered after ours) still see the draft and record it.
    setTimeout(() => {
      setText('');
      composer.focus();
    }, 0);
    setTimeout(() => streamReply(pickResponse(text)), 350);
  }

  sendBtn.addEventListener('click', send);
  composer.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    }
  });
  composer.addEventListener('input', autoGrow);

  // ---------------------------------------------------------------------
  // Example-prompt drawer
  // ---------------------------------------------------------------------

  const drawer = document.querySelector('[data-demo-drawer]');
  const drawerToggle = document.querySelector('[data-demo-drawer-toggle]');

  function buildDrawer() {
    if (!drawer || !window.DEMO_EXAMPLES) return;
    for (const group of window.DEMO_EXAMPLES) {
      const section = document.createElement('section');
      section.className = 'demo-ex-group';
      const h = document.createElement('h3');
      h.textContent = group.category;
      const watch = document.createElement('p');
      watch.className = 'demo-ex-watch';
      watch.textContent = group.watch;
      section.append(h, watch);
      for (const item of group.items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'demo-ex-item';
        const label = document.createElement('span');
        label.className = 'demo-ex-label';
        label.textContent = item.label;
        const preview = document.createElement('span');
        preview.className = 'demo-ex-preview';
        preview.textContent = item.prompt;
        btn.append(label, preview);
        btn.addEventListener('click', () => {
          setText(item.prompt);
          composer.focus();
          if (window.innerWidth < 900) drawer.classList.remove('open');
        });
        section.appendChild(btn);
      }
      drawer.appendChild(section);
    }
  }

  if (drawerToggle && drawer) {
    drawerToggle.addEventListener('click', () => drawer.classList.toggle('open'));
  }
  buildDrawer();
  autoGrow();
})();
