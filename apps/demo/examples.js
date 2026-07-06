// EcoPrompt Coach demo — real-world example prompts, grouped by the coach
// feature they demonstrate. Each item is inserted verbatim into the composer
// so the extension analyzes it exactly as a user would type it.

'use strict';

window.DEMO_EXAMPLES = [
  {
    category: 'Trim the fluff',
    watch: 'The pill counts courtesy tokens you could trim — politeness is for people, not models.',
    items: [
      {
        label: 'Over-polite email request',
        prompt:
          'Hi! I was wondering if you could please help me write a short email to my landlord about a broken heater? Thank you so much in advance for your help!'
      },
      {
        label: 'Kindly summarize',
        prompt: 'Would you kindly summarize the key points of our quarterly meeting notes? Thanks a lot!'
      }
    ]
  },
  {
    category: 'Set an output budget',
    watch: 'Type the capped version and watch the grade improve — response length is the #1 energy driver.',
    items: [
      { label: 'No budget', prompt: 'Explain how photosynthesis works.' },
      {
        label: 'Same question, budgeted',
        prompt: 'Explain how photosynthesis works. Answer in 50 words or less, bullet points only.'
      },
      { label: 'Yes-or-no cap', prompt: 'Is TypeScript a superset of JavaScript? Just yes or no.' }
    ]
  },
  {
    category: 'Skip the LLM entirely',
    watch: 'Some queries deserve a maps app, a weather app, or a calculator — the coach says so.',
    items: [
      { label: 'Weather check', prompt: "What's the weather forecast for Amsterdam tomorrow?" },
      { label: 'Tip math', prompt: 'Calculate a 15% tip on €84.50' },
      { label: 'Restaurant search', prompt: 'What is the best pizza restaurant near me open now?' }
    ]
  },
  {
    category: 'Quoted text is payload',
    watch: 'Courtesy words inside quotes are what you\'re asking about — the trimmer leaves them alone.',
    items: [
      {
        label: 'Translation request',
        prompt: 'Could you translate "thank you so much for your help" into Japanese, please?'
      },
      {
        label: 'Etymology question',
        prompt: "Define the word 'please' and explain its etymology briefly."
      }
    ]
  },
  {
    category: 'Task types & multipliers',
    watch: 'Different tasks carry different energy multipliers and model recommendations.',
    items: [
      { label: 'Creative writing (no false weather tip)', prompt: 'Write a poem about the weather in Paris' },
      {
        label: 'Code generation',
        prompt: 'Write code to implement an Express endpoint that validates email addresses, with unit tests.'
      },
      {
        label: 'Agentic research (2× energy)',
        prompt:
          'Do deep research across multiple sources on the environmental impact of data centers and compile a report.'
      },
      { label: 'Image generation (3× energy)', prompt: 'Generate image of a solar farm at sunset in watercolor style.' }
    ]
  }
];
