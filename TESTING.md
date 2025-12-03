# EcoPrompt Coach - Testing Guide

## Features Implemented

### 1. Automatic Token Counting
- The extension now automatically calculates token count when text is pasted into any textarea or input field
- Token estimation uses a formula: `words / 0.75 + special_chars * 0.5`
- Works on all websites, including ChatGPT, Claude, Gemini, and any text input

### 2. Polite Word Detection
The extension detects and flags unnecessary polite phrases that add tokens without value:
- "please"
- "thank you" / "thanks"
- "I beg"
- "kindly"
- "could you" / "would you" / "can you"
- "I appreciate"
- "sorry"

### 3. Task Type Detection
Automatically identifies the type of task from prompt content:
- **Image Generation**: Detects keywords like "generate image", "draw", "picture of"
- **Text Summarization**: Detects "summarize", "summary", "tldr", "key points"
- **Code Generation**: Detects "write code", "function", "implement"
- **Question Answering**: Detects "what is", "how to", "why", "explain"
- **Creative Writing**: Detects "write story", "poem", "essay"
- **Translation**: Detects "translate", language references
- **General**: Default for unmatched patterns

### 4. Task-Specific Optimization Tips
The extension provides contextual tips based on the detected task type:

- **Image Generation**: "Be specific about style, colors, composition"
- **Summarization**: "Specify exact word count, paste full text directly"
- **Code Generation**: "Specify language, libraries, add I/O examples"
- **Translation**: "Simple instruction + text is enough"
- **Long Prompts**: Suggests reducing to ~70% of current length

### 5. Visual Tooltip with Icons
- Uses the actual PNG icons from the `assets/` folder
- Shows token count prominently
- Displays task type badge
- Lists optimization tips with icons
- Shows potential token savings
- Auto-hides after 15 seconds

## How to Test

### Method 1: Using the Test Page

1. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `promptcoach` folder

2. Open the test page:
   - Open `test-page.html` in your browser
   - Or navigate to any website with text inputs

3. Test with example prompts:
   - Click on any example prompt
   - The text will be copied and pasted into the textarea
   - The EcoPrompt Coach tooltip should appear automatically

4. Verify the following:
   - ✓ Token count is displayed
   - ✓ Task type is correctly identified
   - ✓ Polite words are detected and listed
   - ✓ Icons from assets folder are visible
   - ✓ Optimization tips are relevant to task type
   - ✓ Potential savings are shown

### Method 2: Testing on Real AI Platforms

1. Visit ChatGPT (chat.openai.com), Claude (claude.ai), or Gemini
2. Paste a prompt into the input field
3. Watch for the EcoPrompt Coach tooltip

### Method 3: Manual Input Testing

1. Open any website with a text input or textarea
2. Type or paste at least 50 characters
3. Pause for 2 seconds
4. The tooltip should appear automatically

## Test Cases

### Test Case 1: Image Generation with Polite Words
**Input:**
```
Could you please generate an image of a sunset over mountains with warm colors?
I would really appreciate it if you could make it look realistic. Thank you!
```

**Expected Output:**
- Task Type: IMAGE GENERATION
- Detected polite words: "Could you", "please", "I would really appreciate", "Thank you"
- Tip: "Be specific about style, colors, composition"
- Token savings: ~8-10 tokens

### Test Case 2: Text Summarization
**Input:**
```
Please summarize the following article. Could you provide bullet points? Thanks!
```

**Expected Output:**
- Task Type: TEXT SUMMARIZATION
- Detected polite words: "Please", "Could you", "Thanks"
- Tip: "Specify exact word count, paste full text directly"
- Token savings: ~4 tokens

### Test Case 3: Code Generation
**Input:**
```
Can you please write a Python function that calculates fibonacci?
```

**Expected Output:**
- Task Type: CODE GENERATION
- Detected polite words: "Can you", "please"
- Tip: "Specify language, libraries, add input/output examples"

### Test Case 4: Long Prompt (Efficiency Warning)
**Input:**
```
I would like to ask if you could please help me understand the complete history of
artificial intelligence, including all the major developments, key figures, important
papers, technological breakthroughs, and the evolution of different approaches from
the 1950s to today...
```

**Expected Output:**
- Token count: 500+ tokens
- Tip: "Consider Shorter Prompt - Target ~350 tokens"
- Multiple polite phrases detected

## Extension Popup Testing

1. Click the EcoPrompt Coach extension icon
2. Select a model from the dropdown
3. Enter token counts
4. Click "Calculate Impact"
5. Verify that:
   - ✓ Icons display correctly (Energy, Water, Carbon)
   - ✓ Calculations are shown
   - ✓ Eco-efficiency score is calculated
   - ✓ Optimization suggestions appear

## Known Behavior

- **Minimum Text Length**: Tooltip only appears for text >10 characters (paste) or >50 characters (typing)
- **Auto-hide**: Tooltip disappears after 15 seconds
- **Click Outside**: Clicking outside the tooltip closes it
- **Typing Delay**: When typing manually, analysis triggers 2 seconds after stopping
- **Paste Priority**: Paste events trigger immediate analysis (100ms delay)

## Troubleshooting

### Tooltip Not Appearing
- Check that the extension is enabled in `chrome://extensions/`
- Verify you're pasting/typing enough text (>10 characters)
- Open browser console (F12) and look for "EcoPrompt Coach content script loaded"
- Check for any error messages in the console

### Icons Not Loading
- Verify that `assets/` folder contains all PNG files
- Check that `manifest.json` includes `"resources": ["assets/*", "tooltip.css"]`
- Reload the extension after making changes

### Wrong Task Type Detected
- Task detection uses keyword matching
- More specific keywords get priority
- For edge cases, the extension defaults to "GENERAL"

## Performance Notes

- Token estimation is fast (runs in <1ms)
- No external API calls required
- All processing happens locally in the browser
- Minimal impact on page performance

## Future Enhancements

- Integration with clipboard API for copy suggestions
- Save frequently used prompts
- Export optimization reports
- Multi-language support
- Custom rule configuration

---

**Version**: 1.0.0
**Last Updated**: 2025-12-03
