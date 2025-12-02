# Eco-Prompt Coach - Comprehensive Implementation Plan

## Executive Summary

Based on partner feedback, the **Prompt Coach** prototype ranked highest for:
- **Actionability**: Directly enables behavior change
- **Impact**: Highest organizational impact
- **Alignment**: Fits with existing initiatives
- **Value**: Combines coaching + library + environmental awareness

This plan outlines the development of an eco-prompt coach that helps users visualize the environmental cost of AI queries (energy, water, carbon emissions) while providing alternatives and optimization suggestions, plus a prompt library for saving sustainable prompts.

---

## 1. Product Vision

### Core Concept
A tool that:
1. **Analyzes prompts** before submission
2. **Calculates environmental impact** (energy, water, carbon)
3. **Provides relatable conversions** (coffee cups, lightbulb hours, car kilometers)
4. **Suggests optimizations** to reduce environmental footprint
5. **Saves sustainable prompts** in a reusable library
6. **Visualizes impact** with intuitive dashboards

### Target Behavior Change
- Users learn to write more efficient prompts
- Users become aware of environmental costs
- Users reuse proven sustainable prompts
- Users make informed model selection choices

---

## 2. Scientific Foundation (From "How Hungry is AI" Paper)

### 2.1 Core Calculation Formula

**Energy Per Query (kWh):**
```
Equery = [(Output_Length / TPS + Latency) / 3600] × [(PGPU × UGPU) + (Pnon-GPU × Unon-GPU)] × PUE
```

Where:
- **TPS**: Tokens Per Second (output generation rate)
- **Latency**: Time to first token (input processing time)
- **PGPU**: Maximum rated GPU power at node level
- **UGPU**: Aggregate GPU power draw
- **Pnon-GPU**: Non-GPU system power
- **Unon-GPU**: Aggregate non-GPU power utilization
- **PUE**: Power Usage Effectiveness (data center overhead)

### 2.2 Water Consumption (Liters)

```
Water = (Equery / PUE) × WUEsite + Equery × WUEsource
```

Where:
- **WUEsite**: On-site cooling water (L/kWh)
- **WUEsource**: Off-site electricity generation water (L/kWh)

### 2.3 Carbon Emissions (kgCO2e)

```
Carbon = Equery × CIF
```

Where:
- **CIF**: Carbon Intensity Factor (kgCO2e/kWh)

### 2.4 Prompt Size Categories

Based on the paper's standardized configurations:

| Category | Input Tokens | Output Tokens | Use Case |
|----------|--------------|---------------|----------|
| **Short** | 100 | 300 | Quick questions, simple tasks |
| **Medium** | 1,000 | 1,000 | Analysis, moderate complexity |
| **Long** | 10,000 | 1,500 | Document processing, complex tasks |

### 2.5 Model Classifications

| Size Class | Parameters | GPU Count | Example Models |
|------------|------------|-----------|----------------|
| **Nano** | <7B | 1 | GPT-4.1 nano, LLaMA-3.2 1B |
| **Micro** | 7-20B | 1-2 | LLaMA-3.2 3B |
| **Small** | 20-40B | 2-4 | GPT-4.1 nano |
| **Medium** | 40-70B | 4 | GPT-4o mini, LLaMA-3.3 70B |
| **Large** | >70B | 8 | GPT-4o, Claude-3.7 Sonnet, DeepSeek-R1 |

### 2.6 Key Infrastructure Multipliers

**Microsoft Azure (OpenAI models):**
- PUE: 1.12
- WUE (on-site): 0.30 L/kWh
- WUE (off-site): 3.142 L/kWh
- CIF: 0.3528 kgCO2e/kWh

**AWS (Anthropic/Meta models):**
- PUE: 1.14
- WUE (on-site): 0.18 L/kWh
- WUE (off-site): 3.142 L/kWh
- CIF: 0.385 kgCO2e/kWh

**DeepSeek (China):**
- PUE: 1.27
- WUE (on-site): 1.20 L/kWh
- WUE (off-site): 6.016 L/kWh
- CIF: 0.6 kgCO2e/kWh

### 2.7 Sample Calculations (from paper)

**GPT-4o Short Query (100 input, 300 output):**
- Energy: 0.42 Wh (±0.13)
- Water: ~1.5 mL
- Carbon: ~0.15 gCO2e

**GPT-4o Long Query (10k input, 1.5k output):**
- Energy: 1.788 Wh (±0.36)
- Water: ~6 mL
- Carbon: ~0.63 gCO2e

**DeepSeek-R1 Long Query:**
- Energy: 33.634 Wh (±3.8)
- Water: ~150+ mL
- Carbon: ~14+ gCO2e

**Key Insight**: DeepSeek-R1 consumes **70x more energy** than GPT-4.1 nano for the same task!

---

## 3. Relatable Conversions

### Energy Equivalents
- **1 Wh** = 1 hour of LED lightbulb (1W)
- **0.42 Wh** (GPT-4o short) = 25 minutes of LED light
- **10 Wh** = Full smartphone charge
- **40 Wh** = Making one cup of coffee (electric kettle)
- **100 Wh** = Laptop running for 2 hours

### Water Equivalents
- **1 mL** = One drop of water
- **150 mL** = 2/3 of a coffee cup
- **250 mL** = One standard cup of water
- **5,000 mL** = Daily drinking water per person (WHO recommendation: 2L minimum)

### Carbon Equivalents
- **1 gCO2e** = Driving a car ~5 meters
- **100 gCO2e** = Driving a car ~500 meters (0.5 km)
- **1 kgCO2e** = Driving a car ~5 km
- **14 gCO2e** (DeepSeek-R1 long) = Driving a car ~70 meters

### Annual Scale Examples (from paper - GPT-4o case study)
- **391,509 MWh/year** = 35,000 U.S. homes
- **1.3 million kL water/year** = 1.2 million people's annual drinking needs
- **138,000 tons CO2e/year** = 30,000 cars OR size of Chicago forest to offset

---

## 4. System Architecture

### 4.1 Technology Stack

**Frontend:**
- React.js / Next.js (for modern UI)
- TailwindCSS (for styling)
- Recharts / D3.js (for visualizations)
- Framer Motion (for animations)

**Backend:**
- Node.js / Python (FastAPI)
- PostgreSQL (for prompt library storage)
- Redis (for caching calculations)

**Calculation Engine:**
- Python (for numerical calculations)
- NumPy/Pandas (for data processing)

### 4.2 Component Structure

```
promptcoach/
├── frontend/
│   ├── components/
│   │   ├── PromptInput.tsx         # Main prompt input interface
│   │   ├── ImpactDisplay.tsx       # Environmental metrics display
│   │   ├── RelatableComparisons.tsx # Coffee/lightbulb/car conversions
│   │   ├── OptimizationSuggestions.tsx # AI-powered suggestions
│   │   ├── PromptLibrary.tsx       # Saved prompts management
│   │   ├── ModelSelector.tsx       # Model comparison tool
│   │   └── Dashboard.tsx           # Usage analytics dashboard
│   ├── pages/
│   │   ├── index.tsx               # Main coach interface
│   │   ├── library.tsx             # Prompt library page
│   │   └── analytics.tsx           # Dashboard page
│   └── utils/
│       ├── calculations.ts         # Frontend calculation helpers
│       └── api.ts                  # API client
├── backend/
│   ├── api/
│   │   ├── calculate.py            # Main calculation endpoints
│   │   ├── optimize.py             # Optimization suggestions
│   │   └── library.py              # Prompt library CRUD
│   ├── models/
│   │   ├── model_specs.py          # Model specifications database
│   │   └── infrastructure.py       # PUE/WUE/CIF data
│   ├── calculations/
│   │   ├── energy.py               # Energy calculation engine
│   │   ├── water.py                # Water calculation engine
│   │   ├── carbon.py               # Carbon calculation engine
│   │   └── conversions.py          # Relatable conversions
│   └── database/
│       ├── models.py               # Database models
│       └── migrations/             # Database migrations
├── data/
│   ├── model_benchmarks.json       # TPS, latency data from paper
│   ├── infrastructure.json         # PUE, WUE, CIF by provider
│   └── conversion_factors.json     # Relatable conversion data
├── assets/
│   ├── icons/
│   │   ├── energy.svg
│   │   ├── water.svg
│   │   ├── carbon.svg
│   │   ├── coffee.svg
│   │   ├── lightbulb.svg
│   │   └── car.svg
│   └── branding/
│       ├── logo.svg
│       └── color-palette.json
└── docs/
    ├── API.md
    ├── CALCULATIONS.md
    └── USER_GUIDE.md
```

---

## 5. Core Features

### 5.1 Prompt Coach Interface

**User Flow:**
1. User enters prompt in text area
2. User selects task type: text / image / video generation
3. User selects or AI suggests appropriate model
4. System analyzes prompt and shows:
   - Estimated tokens (input/output)
   - Environmental impact (energy, water, carbon)
   - Relatable conversions
   - Optimization suggestions
5. User can:
   - Accept prompt as-is
   - Apply suggested optimizations
   - Save to library
   - Compare with alternative models

**Key UI Elements:**
- Clean, minimalist text input
- Real-time character/token counter
- Model selector dropdown
- "Calculate Impact" button
- Animated metric cards
- Suggestion cards with "Apply" buttons
- "Save to Library" button

### 5.2 Environmental Impact Display

**Metrics Shown:**

```
┌─────────────────────────────────────┐
│ ENVIRONMENTAL IMPACT                │
├─────────────────────────────────────┤
│ ⚡ Energy: 0.42 Wh                  │
│    = 25 min of LED lightbulb        │
│                                     │
│ 💧 Water: 1.5 mL                   │
│    = 1-2 drops                      │
│                                     │
│ 🌍 Carbon: 0.15 gCO2e              │
│    = Driving a car 0.75 m          │
└─────────────────────────────────────┘
```

**Visualization Types:**
- Progress bars with color coding (green → yellow → red)
- Animated icons (pulsing, filling)
- Comparison charts (your prompt vs. alternatives)
- Trend lines (usage over time)

### 5.3 Optimization Suggestions

**Types of Suggestions:**

1. **Prompt Efficiency**
   - "Your prompt is verbose. Try: [optimized version]"
   - "Remove unnecessary context words"
   - "Use structured format (bullets/numbered lists)"

2. **Model Selection**
   - "GPT-4o mini can handle this task with 50% less energy"
   - "Claude-3.7 Sonnet is more eco-efficient for this task"

3. **Output Length**
   - "Request specific length: 'Answer in 100 words or less'"
   - "Use bullet points instead of paragraphs"

4. **Task Batching**
   - "Combine these 3 queries into one prompt to save 40% energy"

5. **Prompt Library Matches**
   - "Similar prompt found in library: [title] (saved 0.8 Wh)"

### 5.4 Prompt Library

**Features:**
- Save prompts with metadata:
  - Title, description
  - Task type
  - Model used
  - Token counts
  - Environmental metrics
  - Success rating
  - Tags/categories
- Search and filter
- Sort by eco-efficiency
- Share with team
- Import/export

**UI:**
```
┌────────────────────────────────────────┐
│ MY PROMPT LIBRARY                      │
├────────────────────────────────────────┤
│ 🔍 Search...              ⚙️ Filters  │
├────────────────────────────────────────┤
│ ✓ Code Review Checklist               │
│   Text Generation · GPT-4o mini        │
│   ⚡ 0.3 Wh · 💧 1.2 mL · 🌍 0.1 gCO2 │
│   Tags: code, review, efficient        │
├────────────────────────────────────────┤
│ ✓ Meeting Summary Template             │
│   Text Generation · Claude-3.7 Sonnet  │
│   ⚡ 0.5 Wh · 💧 1.8 mL · 🌍 0.2 gCO2 │
│   Tags: meetings, summary              │
└────────────────────────────────────────┘
```

### 5.5 Model Comparison Tool

**Side-by-Side Comparison:**

| Metric | GPT-4o | GPT-4o mini | Claude-3.7 Sonnet |
|--------|---------|-------------|-------------------|
| Energy (Wh) | 0.42 | 0.42 | 0.84 |
| Water (mL) | 1.5 | 1.5 | 2.9 |
| Carbon (gCO2e) | 0.15 | 0.15 | 0.32 |
| Quality Score | 95/100 | 85/100 | 92/100 |
| Cost ($) | $0.005 | $0.0015 | $0.006 |
| **Eco-Efficiency** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

### 5.6 Dashboard / Analytics

**Personal Metrics:**
- Total queries this week/month/year
- Total energy/water/carbon saved
- Most efficient prompts
- Model usage breakdown
- Trend graphs

**Team/Department Metrics** (if applicable):
- Departmental totals
- Leaderboard (gamification)
- Goal progress (e.g., "Reduce energy by 20% this quarter")

---

## 6. Task Type Detection

### 6.1 Task Categories

| Task Type | Energy Multiplier | Typical Models | Notes |
|-----------|------------------|----------------|--------|
| **Text Generation** | 1x (baseline) | GPT-4o, Claude-3.7 | Standard queries |
| **Code Generation** | 1.2x | GPT-4o, Claude-3.7 | Longer outputs |
| **Image Generation** | 10-50x | DALL-E, Midjourney | Much higher compute |
| **Video Generation** | 100-500x | Sora, RunwayML | Extremely intensive |
| **Reasoning/Chain-of-Thought** | 2-5x | o1, o3, DeepSeek-R1 | Multiple inference steps |

### 6.2 Detection Logic

**Simple Keyword Detection:**
- Image: "generate image", "create picture", "draw", "visualize"
- Code: "write code", "function", "class", "debug"
- Video: "generate video", "animate", "create animation"

**Advanced: Task Type Selector**
- Dropdown menu for explicit selection
- Better accuracy
- User education

---

## 7. Assets & Branding

### 7.1 Brand Identity

**Name Options:**
- ✅ **EcoPrompt**
- ✅ **GreenPrompt**
- ✅ **Prompt Coach** (from feedback)
- ✅ **SustainAI**
- ✅ **AI Impact Coach**

**Color Palette:**
- Primary: Green (#10B981) - sustainability, growth
- Secondary: Blue (#3B82F6) - trust, technology
- Accent: Yellow (#F59E0B) - energy, warning
- Neutral: Gray scale for text and backgrounds
- Success: Light green (#D1FAE5)
- Warning: Light yellow (#FEF3C7)
- Danger: Light red (#FEE2E2)

### 7.2 Icon Set

**Primary Icons:**
- ⚡ Energy (lightning bolt)
- 💧 Water (water droplet)
- 🌍 Carbon (earth/globe)
- ☕ Coffee cup
- 💡 Lightbulb
- 🚗 Car
- 🌱 Plant/sprout (growth/sustainability)
- 📚 Library (book stack)
- 🎯 Target (optimization)
- 📊 Chart (analytics)

**Style:**
- Line icons (outline style)
- Consistent stroke width (2px)
- Rounded corners
- SVG format for scalability

### 7.3 Logo Concept

```
  🌱
 ┌─┐
 │A│  EcoPrompt
 │I│  Sustainable AI Coaching
 └─┘
```

Or simplified:
```
[🌿💬] EcoPrompt
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [x] Create project structure
- [ ] Set up frontend React app
- [ ] Set up backend API (FastAPI)
- [ ] Implement core calculation engine
  - [ ] Energy calculation
  - [ ] Water calculation
  - [ ] Carbon calculation
- [ ] Create model specifications database
- [ ] Create infrastructure multipliers database

### Phase 2: Core Features (Week 3-4)
- [ ] Build prompt input interface
- [ ] Implement impact calculation and display
- [ ] Add relatable conversions
- [ ] Create model selector
- [ ] Build basic optimization suggestions

### Phase 3: Prompt Library (Week 5)
- [ ] Database schema for prompt library
- [ ] CRUD API endpoints
- [ ] Frontend library interface
- [ ] Search and filter functionality
- [ ] Import/export features

### Phase 4: Advanced Features (Week 6-7)
- [ ] Model comparison tool
- [ ] Dashboard/analytics
- [ ] Task type detection
- [ ] Advanced optimization AI
- [ ] Batch query analysis

### Phase 5: Polish & Testing (Week 8)
- [ ] Create all assets (icons, logo)
- [ ] UI/UX refinements
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] User guide

### Phase 6: Deployment (Week 9)
- [ ] Set up hosting (Vercel/Netlify + backend)
- [ ] CI/CD pipeline
- [ ] Monitoring and analytics
- [ ] Beta testing with partners

---

## 9. Key Success Metrics

### User Engagement
- Daily active users
- Prompts analyzed per user
- Prompts saved to library
- Optimization suggestions accepted

### Environmental Impact
- Total energy saved
- Total water saved
- Total carbon saved
- Average prompt efficiency improvement

### Behavior Change
- % users using more efficient models
- % users writing shorter prompts
- % users reusing library prompts
- Return user rate

---

## 10. Technical Specifications

### 10.1 Calculation Precision

**Token Estimation:**
- Rule of thumb: 1 token ≈ 4 characters (English)
- Use tiktoken library for accurate counting
- Buffer: Add 10% for safety margin

**Percentile Handling:**
- Use median (50th percentile) for default calculations
- Provide confidence intervals (25th-75th percentile)
- Show range in advanced mode

### 10.2 Model Specifications Database

**Example Entry:**
```json
{
  "model_id": "gpt-4o",
  "provider": "OpenAI",
  "host": "Microsoft Azure",
  "hardware": "DGX H200/H100",
  "gpu_count": 8,
  "size_class": "Large",
  "critical_power_kw": 10.20,
  "pue": 1.12,
  "wue_onsite": 0.30,
  "wue_offsite": 3.142,
  "cif": 0.3528,
  "performance": {
    "short": {
      "latency_p50": 0.42,
      "tps_p50": 150,
      "energy_wh": 0.42
    },
    "medium": {
      "latency_p50": 0.80,
      "tps_p50": 120,
      "energy_wh": 1.21
    },
    "long": {
      "latency_p50": 1.20,
      "tps_p50": 100,
      "energy_wh": 1.79
    }
  }
}
```

### 10.3 API Endpoints

**POST /api/calculate**
```json
Request:
{
  "prompt": "string",
  "model": "gpt-4o",
  "task_type": "text_generation",
  "expected_output_length": 300
}

Response:
{
  "tokens": {
    "input": 25,
    "output": 300,
    "total": 325
  },
  "prompt_category": "short",
  "energy_wh": 0.42,
  "water_ml": 1.5,
  "carbon_gco2e": 0.15,
  "conversions": {
    "energy": {
      "led_minutes": 25,
      "smartphone_charges": 0.042
    },
    "water": {
      "drops": 1.5,
      "cups": 0.006
    },
    "carbon": {
      "car_meters": 0.75,
      "car_km": 0.00075
    }
  },
  "confidence_interval": {
    "energy_min": 0.29,
    "energy_max": 0.55
  }
}
```

**POST /api/optimize**
```json
Request:
{
  "prompt": "string",
  "current_model": "gpt-4o"
}

Response:
{
  "suggestions": [
    {
      "type": "prompt_efficiency",
      "title": "Simplify prompt",
      "description": "Remove unnecessary words",
      "optimized_prompt": "string",
      "savings": {
        "energy_wh": 0.1,
        "percentage": 24
      }
    },
    {
      "type": "model_selection",
      "title": "Use more efficient model",
      "alternative_model": "gpt-4o-mini",
      "savings": {
        "energy_wh": 0.0,
        "percentage": 0,
        "note": "Similar performance"
      }
    }
  ]
}
```

**GET /api/models/compare**
```json
Request: ?models=gpt-4o,claude-3.7-sonnet,gpt-4o-mini&prompt_category=short

Response:
{
  "comparison": [
    {
      "model": "gpt-4o",
      "energy_wh": 0.42,
      "water_ml": 1.5,
      "carbon_gco2e": 0.15,
      "quality_score": 95,
      "cost_usd": 0.005
    },
    {
      "model": "claude-3.7-sonnet",
      "energy_wh": 0.84,
      "water_ml": 2.9,
      "carbon_gco2e": 0.32,
      "quality_score": 92,
      "cost_usd": 0.006
    }
  ],
  "recommendation": "gpt-4o"
}
```

---

## 11. Partner Feedback Integration

### Key Takeaways from Feedback Report

**✅ Prompt Coach (Ranked #1 by all partners):**

**Matthijs:**
- Likes: Actionable, enables behavior change
- Concern: Trade-off between efficiency and result quality
- Suggestion: Make the quality/efficiency trade-off transparent

**Thomas:**
- Explicit favorite: "This is also my favorite so far"
- Reason: Changes behavior while users pursue better prompts
- Likes: Shows CO2 usage, aligns with existing programs

**Jop:**
- Distinction: Coach (training) + Library (repository)
- Highest impact potential
- Would save time personally
- Suggestion: Combine coach and dashboard elements

### Design Decisions Based on Feedback

1. **Make it actionable** (Matthijs):
   - Clear "Apply Suggestion" buttons
   - One-click optimization
   - Immediate feedback

2. **Show CO2 and metrics** (Thomas):
   - Prominent environmental metrics
   - Real-time calculations
   - Visual comparisons

3. **Combine coach + library + dashboard** (Jop):
   - Integrated interface
   - Dashboard sidebar
   - Library quick-access

4. **Start minimal, iterate** (Matthijs on Dashboard):
   - MVP with core features first
   - Add complexity based on usage
   - Use existing Azure data where possible

5. **Keep creativity** (Thomas):
   - Visual, engaging interface
   - Not just raw data
   - Elements from other prototypes (forest, mirror concepts)

---

## 12. Next Steps

### Immediate Actions (Today)
1. ✅ Create this comprehensive plan
2. Set up project repository structure
3. Initialize frontend (React/Next.js)
4. Initialize backend (FastAPI/Python)
5. Create initial data files with model specs

### This Week
1. Implement calculation engine
2. Build basic UI mockup
3. Create icon assets
4. Test calculations against paper data
5. Create simple API endpoints

### Next Week
1. Full prompt coach interface
2. Optimization suggestion logic
3. Model comparison feature
4. Begin prompt library

---

## 13. References

**Academic:**
- Jegham, N., et al. (2025). "How Hungry is AI? Benchmarking Energy, Water, and Carbon Footprint of LLM Inference."

**Partner Feedback:**
- Prototypes Partner Feedback Detailed Report
- Ranking: Prompt Coach (#1), Dashboard (#2), Digital Forest (#3)

**Data Sources:**
- Artificial Analysis (https://artificialanalysis.ai)
- Model provider documentation (OpenAI, Anthropic, Meta, DeepSeek)
- Infrastructure reports (Azure, AWS sustainability reports)

---

**Document Version:** 1.0
**Last Updated:** 2025-12-02
**Status:** Ready for Implementation
