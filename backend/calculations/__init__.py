"""
Eco-Prompt Coach Calculation Engine
Complete environmental impact calculator for AI queries
"""

from .energy import EnergyCalculator
from .water import WaterCalculator
from .carbon import CarbonCalculator
from .conversions import ConversionCalculator
from typing import Dict


class EcoImpactCalculator:
    """
    Main calculator class that combines energy, water, carbon, and conversions.
    This is the primary interface for the API.
    """

    def __init__(self, data_dir: str = "../data"):
        """Initialize all sub-calculators."""
        self.energy_calc = EnergyCalculator(data_dir)
        self.water_calc = WaterCalculator(data_dir)
        self.carbon_calc = CarbonCalculator(data_dir)
        self.conversion_calc = ConversionCalculator(data_dir)

    def calculate_complete_impact(
        self,
        model_id: str,
        input_tokens: int,
        output_tokens: int,
        prompt_text: str = None
    ) -> Dict:
        """
        Calculate complete environmental impact for a query.

        Args:
            model_id: Model identifier (e.g., "gpt-4o")
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            prompt_text: Optional prompt text for token estimation

        Returns:
            Complete environmental impact data with conversions
        """
        # If prompt text provided but no tokens, estimate tokens
        if prompt_text and (input_tokens == 0 or output_tokens == 0):
            input_tokens = self.energy_calc.estimate_tokens(prompt_text)
            # Default output length if not specified
            if output_tokens == 0:
                output_tokens = 300  # Default to short response

        # Calculate energy
        energy_data = self.energy_calc.calculate_energy(model_id, input_tokens, output_tokens)
        energy_wh = energy_data["energy_wh"]

        # Calculate water (using calculated energy)
        water_data = self.water_calc.calculate_water(
            model_id, input_tokens, output_tokens, energy_wh
        )

        # Calculate carbon (using calculated energy)
        carbon_data = self.carbon_calc.calculate_carbon(
            model_id, input_tokens, output_tokens, energy_wh
        )

        # Get conversions
        conversions = self.conversion_calc.convert_all(
            energy_wh,
            water_data["water_ml"],
            carbon_data["carbon_gco2e"]
        )

        # Get model info
        model = next((m for m in self.energy_calc.models["models"] if m["model_id"] == model_id), None)

        return {
            "model": {
                "id": model_id,
                "name": model["name"],
                "provider": model["provider"],
                "host": model["host"],
                "size_class": model["size_class"]
            },
            "tokens": {
                "input": input_tokens,
                "output": output_tokens,
                "total": input_tokens + output_tokens
            },
            "prompt_category": energy_data["prompt_category"],
            "environmental_impact": {
                "energy": {
                    "wh": energy_wh,
                    "kwh": energy_data["energy_kwh"],
                    "confidence_interval": energy_data["confidence_interval"]
                },
                "water": {
                    "ml": water_data["water_ml"],
                    "l": water_data["water_l"],
                    "breakdown": water_data["breakdown"]
                },
                "carbon": {
                    "gco2e": carbon_data["carbon_gco2e"],
                    "kgco2e": carbon_data["carbon_kgco2e"]
                }
            },
            "relatable_comparisons": conversions,
            "summary": {
                "energy": conversions["energy"]["primary_description"],
                "water": conversions["water"]["primary_description"],
                "carbon": conversions["carbon"]["primary_description"]
            }
        }

    def compare_models_complete(
        self,
        model_ids: list,
        input_tokens: int,
        output_tokens: int
    ) -> Dict:
        """
        Compare multiple models across all environmental metrics.

        Returns:
            Complete comparison with recommendations
        """
        results = []

        for model_id in model_ids:
            try:
                impact = self.calculate_complete_impact(model_id, input_tokens, output_tokens)
                results.append({
                    "model_id": model_id,
                    "model_name": impact["model"]["name"],
                    "provider": impact["model"]["provider"],
                    "energy_wh": impact["environmental_impact"]["energy"]["wh"],
                    "water_ml": impact["environmental_impact"]["water"]["ml"],
                    "carbon_gco2e": impact["environmental_impact"]["carbon"]["gco2e"],
                    "conversions": impact["summary"]
                })
            except Exception as e:
                results.append({
                    "model_id": model_id,
                    "error": str(e)
                })

        # Find best model overall (weighted by all factors)
        valid_results = [r for r in results if "error" not in r]
        if valid_results:
            # Normalize scores (0-1 scale, lower is better)
            max_energy = max(r["energy_wh"] for r in valid_results)
            max_water = max(r["water_ml"] for r in valid_results)
            max_carbon = max(r["carbon_gco2e"] for r in valid_results)

            for r in valid_results:
                # Equal weighting for simplicity
                r["eco_score"] = (
                    (r["energy_wh"] / max_energy) * 0.33 +
                    (r["water_ml"] / max_water) * 0.33 +
                    (r["carbon_gco2e"] / max_carbon) * 0.34
                )

            # Sort by eco score (lower is better)
            valid_results.sort(key=lambda x: x["eco_score"])

            best_model = valid_results[0]
            worst_model = valid_results[-1]

            return {
                "comparison": results,
                "recommendation": best_model["model_id"],
                "best": {
                    "model": best_model["model_id"],
                    "eco_score": best_model["eco_score"],
                    "energy_wh": best_model["energy_wh"],
                    "water_ml": best_model["water_ml"],
                    "carbon_gco2e": best_model["carbon_gco2e"]
                },
                "worst": {
                    "model": worst_model["model_id"],
                    "eco_score": worst_model["eco_score"],
                    "energy_wh": worst_model["energy_wh"],
                    "water_ml": worst_model["water_ml"],
                    "carbon_gco2e": worst_model["carbon_gco2e"]
                },
                "potential_savings": {
                    "energy_wh": worst_model["energy_wh"] - best_model["energy_wh"],
                    "water_ml": worst_model["water_ml"] - best_model["water_ml"],
                    "carbon_gco2e": worst_model["carbon_gco2e"] - best_model["carbon_gco2e"],
                    "percentage": ((worst_model["eco_score"] - best_model["eco_score"]) / worst_model["eco_score"]) * 100
                }
            }

        return {"comparison": results, "recommendation": None}

    def get_optimization_suggestions(
        self,
        model_id: str,
        input_tokens: int,
        output_tokens: int,
        prompt_text: str = None
    ) -> Dict:
        """
        Generate optimization suggestions to reduce environmental impact.

        Returns:
            List of actionable suggestions with estimated savings
        """
        current_impact = self.calculate_complete_impact(model_id, input_tokens, output_tokens, prompt_text)
        suggestions = []

        # Suggestion 1: Model selection
        # Compare with more efficient models in same size class or smaller
        all_models = ["gpt-4.1-nano", "llama-3.2-1b", "gpt-4o-mini", "gpt-4o", "claude-3.7-sonnet"]
        comparison = self.compare_models_complete(all_models, input_tokens, output_tokens)

        if comparison["recommendation"] != model_id:
            best = comparison["best"]
            savings = comparison["potential_savings"]

            suggestions.append({
                "type": "model_selection",
                "title": f"Switch to {best['model']}",
                "description": f"This model is more eco-efficient for similar tasks",
                "savings": {
                    "energy_wh": savings["energy_wh"],
                    "water_ml": savings["water_ml"],
                    "carbon_gco2e": savings["carbon_gco2e"],
                    "percentage": savings["percentage"]
                },
                "action": f"Use {best['model']} instead of {model_id}"
            })

        # Suggestion 2: Reduce output length
        if output_tokens > 300:
            reduced_impact = self.calculate_complete_impact(model_id, input_tokens, 300)
            energy_saved = current_impact["environmental_impact"]["energy"]["wh"] - reduced_impact["environmental_impact"]["energy"]["wh"]

            suggestions.append({
                "type": "output_length",
                "title": "Request shorter responses",
                "description": "Add 'Answer in 300 words or less' to your prompt",
                "savings": {
                    "energy_wh": energy_saved,
                    "water_ml": current_impact["environmental_impact"]["water"]["ml"] - reduced_impact["environmental_impact"]["water"]["ml"],
                    "carbon_gco2e": current_impact["environmental_impact"]["carbon"]["gco2e"] - reduced_impact["environmental_impact"]["carbon"]["gco2e"],
                    "percentage": (energy_saved / current_impact["environmental_impact"]["energy"]["wh"]) * 100
                },
                "action": "Limit output tokens to 300"
            })

        # Suggestion 3: Prompt efficiency
        if prompt_text and input_tokens > 200:
            suggestions.append({
                "type": "prompt_efficiency",
                "title": "Simplify your prompt",
                "description": "Remove unnecessary words and context",
                "savings": {
                    "energy_wh": current_impact["environmental_impact"]["energy"]["wh"] * 0.15,  # Estimate 15% savings
                    "percentage": 15
                },
                "action": "Review and shorten your prompt"
            })

        return {
            "current_impact": current_impact,
            "suggestions": suggestions,
            "total_potential_savings": {
                "energy_wh": sum(s["savings"]["energy_wh"] for s in suggestions if "energy_wh" in s["savings"]),
                "percentage": sum(s["savings"]["percentage"] for s in suggestions)
            }
        }


# Example usage
if __name__ == "__main__":
    calculator = EcoImpactCalculator()

    print("=" * 60)
    print("GPT-4o Complete Impact Analysis")
    print("=" * 60)

    impact = calculator.calculate_complete_impact("gpt-4o", 100, 300)

    print(f"\nModel: {impact['model']['name']}")
    print(f"Provider: {impact['model']['provider']}")
    print(f"Tokens: {impact['tokens']['total']} ({impact['tokens']['input']} in, {impact['tokens']['output']} out)")
    print(f"\n⚡ Energy: {impact['environmental_impact']['energy']['wh']:.3f} Wh")
    print(f"   = {impact['summary']['energy']}")
    print(f"\n💧 Water: {impact['environmental_impact']['water']['ml']:.2f} mL")
    print(f"   = {impact['summary']['water']}")
    print(f"\n🌱 Carbon: {impact['environmental_impact']['carbon']['gco2e']:.3f} gCO2e")
    print(f"   = {impact['summary']['carbon']}")

    print("\n" + "=" * 60)
    print("Model Comparison")
    print("=" * 60)

    comparison = calculator.compare_models_complete(
        ["gpt-4o", "gpt-4o-mini", "gpt-4.1-nano", "deepseek-r1"],
        100, 300
    )

    print(f"\nBest Model: {comparison['best']['model']}")
    print(f"  Eco Score: {comparison['best']['eco_score']:.3f}")
    print(f"  Energy: {comparison['best']['energy_wh']:.3f} Wh")

    print(f"\nWorst Model: {comparison['worst']['model']}")
    print(f"  Eco Score: {comparison['worst']['eco_score']:.3f}")
    print(f"  Energy: {comparison['worst']['energy_wh']:.3f} Wh")

    print(f"\nPotential Savings: {comparison['potential_savings']['percentage']:.1f}%")

    print("\n" + "=" * 60)
    print("Optimization Suggestions")
    print("=" * 60)

    suggestions = calculator.get_optimization_suggestions("deepseek-r1", 500, 1000)
    for i, suggestion in enumerate(suggestions["suggestions"], 1):
        print(f"\n{i}. {suggestion['title']}")
        print(f"   {suggestion['description']}")
        if "percentage" in suggestion['savings']:
            print(f"   Savings: {suggestion['savings']['percentage']:.1f}%")
