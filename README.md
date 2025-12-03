# 🌱 EcoPrompt Coach

**Making AI Sustainability Visible and Actionable**

An eco-prompt coach that helps users visualize the environmental cost of AI queries (energy, water, carbon emissions) while providing alternatives, optimization suggestions, and a prompt library for saving sustainable prompts.

![Version](https://img.shields.io/badge/version-1.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 🎯 Project Overview

EcoPrompt Coach is based on the scientific research paper **"How Hungry is AI? Benchmarking Energy, Water, and Carbon Footprint of LLM Inference"** and partner feedback that ranked the Prompt Coach concept as the #1 prototype for:

- ✅ **Actionability**: Directly enables behavior change
- ✅ **Impact**: Highest organizational potential
- ✅ **Alignment**: Fits with existing initiatives
- ✅ **Value**: Combines coaching + library + environmental awareness

### Key Features

1. **Prompt Analysis**: Calculate environmental impact before submission
2. **Relatable Conversions**: Coffee cups, lightbulb minutes, car kilometers
3. **Optimization Suggestions**: AI-powered recommendations to reduce footprint
4. **Prompt Library**: Save and reuse proven sustainable prompts
5. **Model Comparison**: Side-by-side environmental impact analysis
6. **Real-time Feedback**: Instant visualization of environmental costs

---

## 📊 Environmental Impact Examples

### GPT-4o Short Query (100 input, 300 output tokens)
- ⚡ Energy: **0.42 Wh** = 25 minutes of LED lightbulb
- 💧 Water: **1.5 mL** = 1-2 drops
- 🌍 Carbon: **0.15 gCO2e** = Driving a car 0.75 meters

### Deep Seek-R1 Long Query (10k input, 1.5k output tokens)
- ⚡ Energy: **33.63 Wh** = 20-30 minutes of 65" TV
- 💧 Water: **150+ mL** = 2/3 of a coffee cup
- 🌍 Carbon: **14 gCO2e** = Driving a car 70 meters

**Key Insight**: DeepSeek-R1 consumes **70x more energy** than GPT-4.1 nano!

### Annual Scale (GPT-4o: 700M queries/day)
- ⚡ Energy: **391,509 MWh/year** = 35,000 U.S. homes
- 💧 Water: **1.3M kL/year** = 1.2 million people's annual drinking needs
- 🌍 Carbon: **138,000 tons CO2e/year** = 30,000 cars OR Chicago-sized forest to offset

---

## 🏗️ Project Structure

```
promptcoach/
├── PLAN.md                    # Comprehensive implementation plan
├── README.md                  # This file
├── backend/
│   ├── calculations/
│   │   ├── __init__.py       # Main EcoImpactCalculator
│   │   ├── energy.py         # Energy calculations
│   │   ├── water.py          # Water calculations
│   │   ├── carbon.py         # Carbon calculations
│   │   └── conversions.py    # Relatable conversions
│   ├── api/                  # API endpoints (to be implemented)
│   ├── models/               # Database models (to be implemented)
│   └── database/             # Database setup (to be implemented)
├── frontend/                 # React/Next.js UI (to be implemented)
│   ├── components/
│   ├── pages/
│   └── utils/
├── data/
│   ├── model_benchmarks.json         # Model performance data
│   ├── infrastructure.json           # PUE, WUE, CIF multipliers
│   └── conversion_factors.json       # Relatable conversion data
├── assets/                   # Icons, logos, branding
│   ├── Energy Consumptions.png
│   ├── Water Consumption.png
│   ├── Carbon Emissions.png
│   ├── Optimise Prompt.png
│   ├── Alternative Available.png
│   ├── Save to Library.png
│   ├── Prompt Library.png
│   └── ICON_MAPPING.md      # Icon usage documentation
├── docs/                     # Additional documentation
└── Context/                  # Research papers and feedback
    ├── How Hungry is AI.pdf
    ├── Prototypes PartnerFeedback DetailedReport.pdf
    └── Eco-Friendly Alternatives (Dashboard).xlsx
```

---

## 🔬 Scientific Foundation

### Core Formulas

**Energy Per Query (kWh):**
```
Equery = [(Output_Length / TPS + Latency) / 3600] × [(PGPU × UGPU) + (Pnon-GPU × Unon-GPU)] × PUE
```

**Water Consumption (Liters):**
```
Water = (Equery / PUE) × WUEsite + Equery × WUEsource
```

**Carbon Emissions (kgCO2e):**
```
Carbon = Equery × CIF
```

Where:
- **TPS**: Tokens Per Second
- **Latency**: Time to first token
- **PUE**: Power Usage Effectiveness (data center overhead)
- **WUE**: Water Usage Effectiveness (cooling + electricity)
- **CIF**: Carbon Intensity Factor (regional electricity mix)

### Prompt Categories

| Category | Input | Output | Use Case |
|----------|-------|--------|----------|
| **Short** | 100 | 300 | Quick questions |
| **Medium** | 1,000 | 1,000 | Analysis |
| **Long** | 10,000 | 1,500 | Document processing |

### Infrastructure Multipliers

| Provider | PUE | WUE (on-site) | CIF |
|----------|-----|---------------|-----|
| **Google Cloud** (Gemini) | 1.10 | 0.25 L/kWh | 0.32 kgCO2e/kWh |
| **Microsoft Azure** (OpenAI) | 1.12 | 0.30 L/kWh | 0.3528 kgCO2e/kWh |
| **AWS** (Anthropic/Meta) | 1.14 | 0.18 L/kWh | 0.385 kgCO2e/kWh |
| **DeepSeek** (China) | 1.27 | 1.20 L/kWh | 0.6 kgCO2e/kWh |

---

## 🚀 Getting Started

### Prerequisites

- Python 3.8+
- Node.js 16+ (for frontend)
- Basic understanding of AI/LLMs

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd promptcoach

# Install Python dependencies
pip install -r requirements.txt

# Install Node dependencies (when frontend is ready)
cd frontend
npm install
```

### Quick Usage Example

```python
from backend.calculations import EcoImpactCalculator

# Initialize calculator
calculator = EcoImpactCalculator()

# Calculate impact for a query
impact = calculator.calculate_complete_impact(
    model_id="gpt-4o",
    input_tokens=100,
    output_tokens=300
)

print(f"Energy: {impact['environmental_impact']['energy']['wh']:.3f} Wh")
print(f"Water: {impact['environmental_impact']['water']['ml']:.2f} mL")
print(f"Carbon: {impact['environmental_impact']['carbon']['gco2e']:.3f} gCO2e")

# Get relatable comparisons
print(f"\n{impact['summary']['energy']}")
print(f"{impact['summary']['water']}")
print(f"{impact['summary']['carbon']}")

# Compare models
comparison = calculator.compare_models_complete(
    model_ids=["gpt-4o", "gpt-4o-mini", "claude-3.7-sonnet"],
    input_tokens=100,
    output_tokens=300
)

print(f"\nBest model: {comparison['recommendation']}")
print(f"Potential savings: {comparison['potential_savings']['percentage']:.1f}%")

# Get optimization suggestions
suggestions = calculator.get_optimization_suggestions(
    model_id="gpt-4o",
    input_tokens=500,
    output_tokens=1000
)

for suggestion in suggestions["suggestions"]:
    print(f"\n💡 {suggestion['title']}")
    print(f"   {suggestion['description']}")
    print(f"   Savings: {suggestion['savings']['percentage']:.1f}%")
```

---

## 📈 Supported Models

Currently supports 10 models with benchmarks:

- **OpenAI**: GPT-4o, GPT-4o mini, GPT-4.1 nano
- **Google**: Gemini 2.0 Flash, Gemini 1.5 Flash, Gemini 1.5 Pro
- **Anthropic**: Claude-3.7 Sonnet
- **Meta**: LLaMA-3.3 70B, LLaMA-3.2 1B
- **DeepSeek**: DeepSeek-R1

### Model Eco-Efficiency Ranking (Short Queries)

1. 🥇 **LLaMA-3.2 1B** - 0.070 Wh
2. 🥈 **Gemini 2.0 Flash** - 0.095 Wh
3. 🥉 **GPT-4.1 nano** - 0.103 Wh
4. **Gemini 1.5 Flash** - 0.115 Wh
5. **LLaMA-3.3 70B** - 0.247 Wh
6. **GPT-4o / GPT-4o mini** - 0.421 Wh
7. **Gemini 1.5 Pro** - 0.580 Wh
8. **Claude-3.7 Sonnet** - 0.836 Wh
9. **DeepSeek-R1** - 23.815 Wh (240x worse than best!)

---

## 🎨 Design Principles (from Partner Feedback)

### What Partners Loved

**Matthijs:**
- "I like it - actionable and enables behavior change"
- "Show the trade-off between efficiency and quality"

**Thomas:**
- "This is my favorite so far"
- "Changes behavior while users pursue better prompts"
- "Shows CO2 usage and aligns with existing programs"

**Jop:**
- "Highest impact potential"
- "Would save me time personally"
- "Combine coach + dashboard elements"

### Implementation Approach

✅ **Actionable First**: Clear "Apply" buttons, one-click optimization
✅ **Visual Impact**: Prominent environmental metrics, real-time calculations
✅ **Integrated**: Coach + Library + Dashboard in one interface
✅ **Start Minimal**: MVP with core features, iterate based on usage
✅ **Keep Creative**: Engaging interface, not just raw data

---

## 🔮 Roadmap

### Phase 1: Foundation ✅ COMPLETED
- [x] Project structure
- [x] Calculation engine (energy, water, carbon)
- [x] Relatable conversions
- [x] Model specifications database
- [x] Comprehensive documentation

### Phase 2: Core Features (Next)
- [ ] FastAPI backend with REST endpoints
- [ ] React/Next.js frontend
- [ ] Prompt input interface
- [ ] Impact visualization
- [ ] Model selector

### Phase 3: Prompt Library
- [ ] Database schema (PostgreSQL)
- [ ] CRUD API endpoints
- [ ] Library UI with search/filter
- [ ] Import/export functionality

### Phase 4: Advanced Features
- [ ] Model comparison tool
- [ ] Dashboard/analytics
- [ ] Task type detection (text/image/video)
- [ ] AI-powered optimization suggestions
- [ ] Batch query analysis

### Phase 5: Polish & Deploy
- [ ] Icon assets and branding
- [ ] UI/UX refinements
- [ ] Comprehensive testing
- [ ] Deployment (Vercel + backend)
- [ ] User guide and tutorials

---

## 📖 API Documentation

### Main Calculator Class

```python
class EcoImpactCalculator:
    def calculate_complete_impact(model_id, input_tokens, output_tokens, prompt_text=None)
    # Returns: Complete environmental impact with conversions

    def compare_models_complete(model_ids, input_tokens, output_tokens)
    # Returns: Side-by-side comparison with eco-scores

    def get_optimization_suggestions(model_id, input_tokens, output_tokens, prompt_text=None)
    # Returns: Actionable suggestions to reduce impact
```

See `PLAN.md` for detailed API specifications and examples.

---

## 🤝 Contributing

This project was developed based on:

1. **Scientific Research**: "How Hungry is AI?" paper (Jegham et al., 2025)
2. **Partner Feedback**: Ministry stakeholder input (Matthijs, Thomas, Jop)
3. **Eco-Friendly Alternatives**: Dashboard concepts and data

### How to Contribute

1. Review the `PLAN.md` for comprehensive implementation details
2. Check the roadmap for current priorities
3. Follow the scientific methodologies from the paper
4. Keep the partner feedback principles in mind

---

## 📚 References

**Academic:**
- Jegham, N., et al. (2025). "How Hungry is AI? Benchmarking Energy, Water, and Carbon Footprint of LLM Inference." arXiv:2505.09598v4

**Partner Feedback:**
- Prototypes Partner Feedback Detailed Report
- Final Ranking: Prompt Coach (#1)

**Data Sources:**
- Artificial Analysis (https://artificialanalysis.ai)
- Model provider sustainability reports (Microsoft, AWS)
- Infrastructure multipliers from published research

---

## 📜 License

MIT License - See LICENSE file for details

---

## 🙏 Acknowledgments

- Research team: Nidhal Jegham, Marwan Abdelatti, Lassad Elmoubarki, Abdeltawab Hendawi
- Partner stakeholders: Matthijs, Thomas, Jop
- Ministry team for feedback and validation

---

## 📧 Contact

For questions about implementation or to provide feedback, please open an issue or contact the development team.

---

**Built with 🌱 for a sustainable AI future**

*Last Updated: 2025-12-02*
