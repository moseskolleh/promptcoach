// EcoPrompt Coach Core — analyzer regression tests (node --test)
// Each case here reproduces a defect that shipped: a prompt the coach got
// wrong, and the behaviour it must have now.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const core = require('../src/index');
const { analyzePrompt, generateOptimizedPrompt, detectOutputBudget, detectPoliteWords, estimateTokens } = core;

test('trimmer keeps decimals, URLs, file names, versions and abbreviations intact', () => {
  const cases = [
    ['Please compute 3.14 * 2 and explain e.g. the steps', 'Compute 3.14 * 2 and explain e.g. the steps'],
    ['Could you check https://example.com/docs and summarize v2.1.0 release notes please',
      'Check https://example.com/docs and summarize v2.1.0 release notes'],
    ['Hi, please open config.json and fix the bug. Thanks!', 'Open config.json and fix the bug.'],
    ['Use np.array, i.e. the NumPy constructor, please', 'Use np.array, i.e. the NumPy constructor']
  ];
  for (const [input, expected] of cases) {
    assert.strictEqual(generateOptimizedPrompt(input), expected);
  }
  // Sentences run together by a missing space are still separated.
  assert.strictEqual(generateOptimizedPrompt('Please do this!then that'), 'Do this! Then that');
});

test('courtesy words that are the subject of the prompt are payload, not politeness', () => {
  const keep = [
    'How do you say please in French?',
    'Write an apology email that says sorry for the delay',
    'What does sorry mean in Japanese culture?',
    'Is it rude to not say thank you?',
    'Define the word please and give its etymology'
  ];
  for (const text of keep) {
    assert.strictEqual(generateOptimizedPrompt(text), text, text);
    assert.strictEqual(detectPoliteWords(text).totalTokensSaved, 0, text);
  }
  // …while ordinary politeness around them is still trimmed.
  assert.strictEqual(
    generateOptimizedPrompt('Could you please explain what sorry means in Japanese? Thanks!'),
    'Explain what sorry means in Japanese?'
  );
});

test('courtesy savings are counted once per phrase and never exceed the prompt', () => {
  const short = analyzePrompt('Thanks in advance for your help!');
  assert.strictEqual(short.politeWords.found.length, 1, 'compound phrase must not be re-counted by its parts');
  assert.ok(short.politeWords.totalTokensSaved <= short.tokens);
  assert.ok(short.optimizedTokenEstimate >= 1);

  const longer = analyzePrompt('Hi! Could you please summarize this report for me? Thanks in advance for your help!');
  const phrases = longer.politeWords.found.map((f) => f.phrase);
  assert.ok(!phrases.includes('thanks in advance'), 'sub-phrase double count');
  assert.ok(!phrases.includes('thanks'), 'sub-phrase double count');
  assert.ok(longer.politeWords.totalTokensSaved < longer.tokens);
  // Trimming really removes roughly what the tip promises.
  const trimmedTokens = estimateTokens(generateOptimizedPrompt(longer.originalText));
  assert.ok(Math.abs(longer.tokens - trimmedTokens - longer.politeWords.totalTokensSaved) <= 2);
});

test('output budgets: counted sentences, paragraphs, lines, bullets, items, characters', () => {
  const expect = (text, kind, capTokens) => {
    const b = detectOutputBudget(text);
    assert.ok(b, `no budget detected: ${text}`);
    assert.strictEqual(b.kind, kind, text);
    if (capTokens !== undefined) assert.strictEqual(b.capTokens, capTokens, text);
  };
  expect('Explain photosynthesis in two sentences', 'sentence', 50);
  expect('Explain photosynthesis in 3 sentences', 'sentence', 75);
  expect('Explain in a single paragraph', 'paragraph', 100);
  expect('Answer in no more than 2 paragraphs', 'paragraph', 200);
  expect('Write 3 paragraphs about dogs', 'paragraph', 300);
  expect('Reply in 3 lines max', 'lines', 45);
  expect('Give me 5 bullet points on Rome', 'bullets', 100);
  expect('List 3 reasons to learn Rust', 'items');
  expect('The top 5 takeaways from this article', 'items');
  expect('A two-sentence summary of the plot', 'sentence', 50);
  expect('Keep it under 200 characters', 'characters', 50);
  expect('Limit the answer to 30 words', 'words', 40);
  expect('max. 40 words', 'words', 53);
  expect('Tweet-length: 280 chars max', 'characters', 70);
});

test('output budgets: soft brevity cues and non-budgets', () => {
  assert.strictEqual(detectOutputBudget('Just the code, no explanation').kind, 'style');
  assert.strictEqual(detectOutputBudget('Summarize in a few sentences').kind, 'style');
  assert.strictEqual(detectOutputBudget('Give me a one-liner').kind, 'style');
  assert.strictEqual(detectOutputBudget('Give me a brief overview of Kubernetes').kind, 'style');
  // Numbers that describe the input, not the answer, are not budgets.
  assert.strictEqual(detectOutputBudget('I read 3 lines of the poem, what does it mean?'), null);
  assert.strictEqual(detectOutputBudget('We have 5 items in the cart, what is the total price'), null);
  assert.strictEqual(detectOutputBudget('Write an essay about the history of Rome'), null);
});

test('a detected budget lowers the output estimate and the energy grade', () => {
  const free = analyzePrompt('Explain how transformers work.');
  const capped = analyzePrompt('Explain how transformers work in two sentences.');
  assert.ok(capped.outputEstimate.estimated < free.outputEstimate.estimated / 2);
  const { engine } = core.createDefaultEngine();
  const wh = (a) => engine.estimateImpact({ modelId: 'gpt-4o', inputTokens: a.tokens, outputTokens: a.outputEstimate.estimated }).energy.wh;
  assert.ok(wh(capped) < wh(free) / 2);
});

test('zero-AI tips: arithmetic needs an actual expression; conceptual questions are not lookups', () => {
  const special = (t) => (analyzePrompt(t).tips.find((x) => x.kind === 'special_query') || {}).type || null;
  assert.strictEqual(special('Convert this list of 5 items to JSON'), null);
  assert.strictEqual(special('Calculate the mean of these numbers'), null);
  assert.strictEqual(special('Calculate a 15% tip on €84.50'), 'math');
  assert.strictEqual(special('Convert 5 km to miles'), 'math');
  assert.strictEqual(special('how much is 20% of 300'), 'math');
  assert.strictEqual(special('Explain how weather forecasts work'), null);
  assert.strictEqual(special('Why is the weather so unpredictable?'), null);
  assert.strictEqual(special('What is the weather forecast for tomorrow?'), 'weather');
  assert.strictEqual(special('Where is the bug in this code?'), null);
  assert.strictEqual(special('Where is the nearest pharmacy?'), 'location');
  assert.strictEqual(special('Explain the concept of time in physics'), null);
  assert.strictEqual(special('What time is it in Tokyo?'), 'time');
});

test('task detection: code words beat a stray image verb', () => {
  const task = (t) => analyzePrompt(t).taskTypeRaw;
  assert.strictEqual(task('Please render a React component that lists users'), 'CODE_GENERATION');
  assert.strictEqual(task('Draw conclusions from this data'), 'GENERAL');
  assert.strictEqual(task('Draw a cat wearing a hat'), 'IMAGE_GENERATION');
  assert.strictEqual(task('Generate image of a solar farm at sunset in watercolor style'), 'IMAGE_GENERATION');
  assert.strictEqual(task('Where is the bug in this code?'), 'CODE_GENERATION');
});

test('token estimation counts CJK characters and emoji at their real density', () => {
  const ja = '量子コンピュータについて簡単に説明してください'; // 22 chars ≈ 15–25 tokens
  assert.ok(estimateTokens(ja) >= 15 && estimateTokens(ja) <= 25, `got ${estimateTokens(ja)}`);
  assert.strictEqual(estimateTokens('🌱🌱🌱🌱'), 8);
  assert.strictEqual(estimateTokens('Explain quantum computing'), 7);
  // Plain English is unchanged by the new rules.
  assert.strictEqual(estimateTokens('Summarize this report in plain language'), 10);
});

test('stripHtml is no longer part of the public API', () => {
  assert.strictEqual(typeof core.stripHtml, 'undefined');
});

test('trimmer only strips auxiliary phrases at a clause start', () => {
  const unchanged = [
    'Tell me if you can run this on Windows',
    'Check if you could get a null pointer here',
    'What would you recommend for state management?',
    'How can you tell if a matrix is invertible?',
    'Explain why I would like to sleep more'
  ];
  for (const t of unchanged) assert.strictEqual(generateOptimizedPrompt(t), t, t);
  assert.strictEqual(generateOptimizedPrompt('Please explain if it is possible to run this on Windows'),
    'Explain if it is possible to run this on Windows');
  assert.strictEqual(generateOptimizedPrompt('If it is possible, could you summarize this?'), 'Summarize this?');
  assert.strictEqual(generateOptimizedPrompt('Explain DNS. Could you also list the ports? Thanks!'),
    'Explain DNS. Also list the ports?');
  assert.strictEqual(generateOptimizedPrompt('Hey ChatGPT, can you help me with SQL?'), 'Help me with SQL?');
});

test('trimmer leaves greetings and thank-yous that are content alone', () => {
  assert.strictEqual(generateOptimizedPrompt('Hello world program in C'), 'Hello world program in C');
  assert.strictEqual(generateOptimizedPrompt('Write a thank you note to my teacher'), 'Write a thank you note to my teacher');
  assert.strictEqual(generateOptimizedPrompt('Hi there, explain DNS'), 'Explain DNS');
  assert.strictEqual(generateOptimizedPrompt('  Hi, explain DNS'), 'Explain DNS');
});

test('trimmer preserves line structure, casing and deliberate punctuation', () => {
  const list = 'Fix these:\n- item one\n- item two\n\n1. first\n2. second';
  assert.strictEqual(generateOptimizedPrompt(list), list);
  assert.strictEqual(generateOptimizedPrompt('iPhone 15 vs Pixel 8: which is better?'), 'iPhone 15 vs Pixel 8: which is better?');
  assert.strictEqual(generateOptimizedPrompt('Continue the story... he opened the door?! What next'),
    'Continue the story... he opened the door?! What next');
  assert.strictEqual(generateOptimizedPrompt('Explain X (please note: keep it short)'), 'Explain X (note: keep it short)');
});

test('output budgets are not detected inside content or after a negation', () => {
  const none = [
    'Fix the grammar in a paragraph I will paste below',
    'Should the API return yes or no strings or booleans?',
    'Rewrite this replacing "utilize" with one word synonym and explain the difference',
    'Tell me about 3 words that rhyme with cat',
    'Explain the difference in short-term and long-term memory',
    'Do not answer with just yes or no; give full details',
    "Don't answer in bullet points, write prose",
    'the 3-line function is buggy, fix it'
  ];
  for (const t of none) assert.strictEqual(detectOutputBudget(t), null, t);
  assert.strictEqual(detectOutputBudget('Answer in two sentences and cite sources').kind, 'sentence');
  assert.strictEqual(detectOutputBudget('Summarize this in 3 bullets for the exec team').kind, 'bullets');
  assert.strictEqual(detectOutputBudget('Is it safe, yes or no?').kind, 'yes_no');
  assert.strictEqual(detectOutputBudget('In one word, is this good?').kind, 'word');
});

test('a requested long answer raises the estimate and gets a warning, not a thumbs-up', () => {
  const long = analyzePrompt('Write an essay about Rome in 2000 words');
  assert.ok(long.outputEstimate.estimated > long.outputEstimate.baseline);
  assert.ok(long.tips.some((t) => t.kind === 'output_budget_long'));
  assert.ok(!long.tips.some((t) => t.kind === 'output_budget_ok'));
  const article = analyzePrompt('Write a 1500-word article on solar power');
  assert.strictEqual(article.outputEstimate.estimated, 2000);
});

test('a zero-AI tip is not accompanied by model or budget advice', () => {
  const kinds = analyzePrompt('What is the weather forecast for tomorrow?').tips.map((t) => t.kind);
  assert.deepStrictEqual(kinds, ['special_query']);
});

test('zero-AI cues are scoped to live lookups', () => {
  const special = (t) => (analyzePrompt(t).tips.find((x) => x.kind === 'special_query') || {}).type || null;
  for (const t of [
    'Round 3.7 to the nearest integer', 'What is the closest star to Earth?',
    'Write an email to the hotel manager complaining about my stay',
    'What does the phrase "near me" mean for Google search ranking?',
    'Explain how weather radar works', 'Explain the lyrics of "Weather With You"',
    'What time signature is this song in?', 'Convert kebab-case to camelCase',
    'Convert this markdown (draft) to HTML', 'What percentage of voters in 2020 were under 30?',
    'How much is a 2 bedroom apartment in Manhattan these days?', 'How did people react to the news?'
  ]) assert.strictEqual(special(t), null, t);
  assert.strictEqual(special('Best pizza restaurant near me open now'), 'location');
  assert.strictEqual(special('Directions to Amsterdam Centraal'), 'location');
  assert.strictEqual(special('Where is Paris?'), 'location');
  assert.strictEqual(special('Will it rain tomorrow?'), 'weather');
  assert.strictEqual(special('What is the weather in Paris?'), 'weather');
  assert.strictEqual(special("What's the time in Tokyo?"), 'time');
});

test('task detection favours the leading verb and ignores quoted payload', () => {
  const task = (t) => analyzePrompt(t).taskTypeRaw;
  assert.strictEqual(task('Summarize this essay for me'), 'TEXT_SUMMARIZATION');
  assert.strictEqual(task('Summarize this research paper'), 'TEXT_SUMMARIZATION');
  assert.strictEqual(task('Summarize this blog post in 3 bullets'), 'TEXT_SUMMARIZATION');
  assert.strictEqual(task('Could you please summarize this blog post?'), 'TEXT_SUMMARIZATION');
  assert.strictEqual(task('Translate this poem into French'), 'TRANSLATION');
  assert.strictEqual(task('Write a screenplay script about a heist'), 'CREATIVE_WRITING');
  assert.strictEqual(task('Write a poem about who I am and why I am here'), 'CREATIVE_WRITING');
  assert.strictEqual(task('Illustrate the difference between let and const with examples'), 'GENERAL');
  assert.strictEqual(task('Sketch an algorithm for finding cycles in a graph'), 'CODE_GENERATION');
  assert.strictEqual(task('Translate "draw a picture of a cat" into French'), 'TRANSLATION');
  assert.strictEqual(task('Summarize: "Researchers investigate how bots browse the web"'), 'TEXT_SUMMARIZATION');
  assert.strictEqual(task('Paint a picture of a sunset'), 'IMAGE_GENERATION');
});
