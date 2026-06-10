# Icon Asset Mapping

This document maps the icon files in the `assets/` folder to their usage throughout the EcoPrompt Coach application.

## Available Icons

All icons are in PNG format and located in `/assets/` directory.

### Environmental Impact Icons

| Icon File | Usage | Description | Location in UI |
|-----------|-------|-------------|----------------|
| `Energy Consumptions.png` | Energy metrics display | Shows energy consumption in Wh/kWh | Main impact card, Dashboard |
| `Water Consumption.png` | Water metrics display | Shows water consumption in mL/L | Main impact card, Dashboard |
| `Carbon Emissions.png` | Carbon metrics display | Shows carbon emissions in gCO2e | Main impact card, Dashboard |

### Feature Icons

| Icon File | Usage | Description | Location in UI |
|-----------|-------|-------------|----------------|
| `Optimise Prompt.png` | Optimization suggestions | Indicates AI-powered prompt optimization | Suggestions panel, Action buttons |
| `Alternative Available.png` | Model alternatives | Shows available model alternatives | Model comparison view |
| `Save to Library.png` | Save prompt action | Button to save prompts to library | Prompt input interface |
| `Prompt Library.png` | Prompt library feature | Navigation to saved prompts library | Navigation menu, Library page |

## Icon Usage Guidelines

### Frontend Integration

When implementing the UI, use these icons in the following components:

#### 1. Impact Display Component
```javascript
// Example usage in React/Next.js
import EnergyIcon from '@/assets/Energy Consumptions.png'
import WaterIcon from '@/assets/Water Consumption.png'
import CarbonIcon from '@/assets/Carbon Emissions.png'

<ImpactCard>
  <img src={EnergyIcon} alt="Energy" />
  <MetricValue>{energy_wh} Wh</MetricValue>
</ImpactCard>
```

#### 2. Optimization Suggestions
```javascript
import OptimizeIcon from '@/assets/Optimise Prompt.png'

<SuggestionCard>
  <img src={OptimizeIcon} alt="Optimize" />
  <SuggestionText>Switch to more efficient model</SuggestionText>
</SuggestionCard>
```

#### 3. Library Features
```javascript
import SaveIcon from '@/assets/Save to Library.png'
import LibraryIcon from '@/assets/Prompt Library.png'

<ActionButton>
  <img src={SaveIcon} alt="Save" />
  Save to Library
</ActionButton>

<NavItem>
  <img src={LibraryIcon} alt="Library" />
  My Prompts
</NavItem>
```

#### 4. Model Comparison
```javascript
import AlternativeIcon from '@/assets/Alternative Available.png'

<ComparisonView>
  <img src={AlternativeIcon} alt="Alternatives" />
  <ModelList>{alternatives}</ModelList>
</ComparisonView>
```

## Icon Specifications

- **Format**: PNG
- **Recommended Display Size**: 24x24px to 48x48px depending on context
- **Color**: Icons should maintain their original colors for consistency
- **Accessibility**: Always include descriptive alt text when using icons

## File Naming Convention

The icon filenames use title case with spaces:
- `Energy Consumptions.png`
- `Water Consumption.png`
- etc.

When importing in code, ensure proper path handling for spaces in filenames.

## Future Icon Additions

When adding new icons to the assets folder:
1. Use PNG format for consistency
2. Follow the same naming convention (Title Case With Spaces)
3. Update this mapping document
4. Ensure icons are sized appropriately (recommended: 256x256px or higher)
5. Maintain visual consistency with existing icon style

## Integration Checklist

- [x] Icons available in `/assets/` folder
- [x] Icon mapping documented
- [ ] Frontend components updated to use icons
- [ ] Icon paths configured in build system
- [ ] Alt text added for accessibility
- [ ] Icons tested across different screen sizes
- [ ] Dark mode compatibility verified (if applicable)

---

**Last Updated**: 2025-12-03
**Version**: 1.0
