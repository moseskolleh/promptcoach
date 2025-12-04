"""
Water Calculation Module
Based on "How Hungry is AI?" paper methodology

Formula: Water (L) = (Equery / PUE) × WUEsite + Equery × WUEsource
"""

import json
from pathlib import Path
from typing import Dict
from .energy import EnergyCalculator


class WaterCalculator:
    def __init__(self, data_dir: str = "../data"):
        """Initialize the water calculator."""
        self.data_dir = Path(data_dir)
        self.energy_calculator = EnergyCalculator(data_dir)
        self.infrastructure = self._load_infrastructure()

    def _load_infrastructure(self) -> Dict:
        """Load infrastructure multipliers from JSON."""
        with open(self.data_dir / "infrastructure.json", "r") as f:
            return json.load(f)

    def _get_provider_multipliers(self, model_id: str) -> Dict:
        """Get WUE and PUE multipliers for a model's provider."""
        model = next((m for m in self.energy_calculator.models["models"] if m["model_id"] == model_id), None)
        if not model:
            raise ValueError(f"Model {model_id} not found")

        provider_map = {
            "Microsoft Azure": "microsoft_azure",
            "AWS": "aws",
            "DeepSeek": "deepseek",
            "Google Cloud": "google_cloud"
        }

        provider_key = provider_map.get(model["host"])
        if not provider_key:
            raise ValueError(f"Unknown provider: {model['host']}")

        return self.infrastructure["providers"][provider_key]

    def calculate_water(
        self,
        model_id: str,
        input_tokens: int,
        output_tokens: int,
        energy_wh: float = None
    ) -> Dict:
        """
        Calculate water consumption for a query.

        Formula from paper:
        Water (L) = (Equery / PUE) × WUEsite + Equery × WUEsource

        Where:
        - WUEsite = On-site cooling water (L/kWh)
        - WUEsource = Off-site electricity generation water (L/kWh)

        Args:
            model_id: Model identifier
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            energy_wh: Pre-calculated energy (if None, will calculate)

        Returns:
            Dictionary with water metrics in milliliters and liters
        """
        # Get energy consumption if not provided
        if energy_wh is None:
            energy_data = self.energy_calculator.calculate_energy(
                model_id, input_tokens, output_tokens
            )
            energy_wh = energy_data["energy_wh"]
            energy_kwh = energy_data["energy_kwh"]
        else:
            energy_kwh = energy_wh / 1000

        # Get provider multipliers
        provider = self._get_provider_multipliers(model_id)
        pue = provider["pue"]
        wue_onsite = provider["wue_onsite_l_per_kwh"]
        wue_offsite = provider["wue_offsite_l_per_kwh"]

        # Calculate water consumption
        # On-site cooling
        water_onsite_l = (energy_kwh / pue) * wue_onsite

        # Off-site electricity generation
        water_offsite_l = energy_kwh * wue_offsite

        # Total water
        water_total_l = water_onsite_l + water_offsite_l
        water_total_ml = water_total_l * 1000

        return {
            "water_ml": water_total_ml,
            "water_l": water_total_l,
            "breakdown": {
                "onsite_cooling_ml": water_onsite_l * 1000,
                "offsite_electricity_ml": water_offsite_l * 1000,
                "onsite_cooling_l": water_onsite_l,
                "offsite_electricity_l": water_offsite_l
            },
            "multipliers": {
                "pue": pue,
                "wue_onsite_l_per_kwh": wue_onsite,
                "wue_offsite_l_per_kwh": wue_offsite
            },
            "energy_used": {
                "wh": energy_wh,
                "kwh": energy_kwh
            }
        }

    def compare_models(
        self,
        model_ids: list,
        input_tokens: int,
        output_tokens: int
    ) -> Dict:
        """
        Compare water consumption across multiple models.

        Returns:
            Dictionary with comparison data and recommendation
        """
        results = []

        for model_id in model_ids:
            try:
                water_data = self.calculate_water(model_id, input_tokens, output_tokens)
                model = next((m for m in self.energy_calculator.models["models"] if m["model_id"] == model_id), None)

                results.append({
                    "model_id": model_id,
                    "model_name": model["name"],
                    "water_ml": water_data["water_ml"],
                    "water_l": water_data["water_l"],
                    "breakdown": water_data["breakdown"],
                    "provider": model["provider"]
                })
            except Exception as e:
                results.append({
                    "model_id": model_id,
                    "error": str(e)
                })

        # Find most efficient model
        valid_results = [r for r in results if "error" not in r]
        if valid_results:
            most_efficient = min(valid_results, key=lambda x: x["water_ml"])

            return {
                "comparison": results,
                "recommendation": most_efficient["model_id"],
                "savings": {
                    "best_water_ml": most_efficient["water_ml"],
                    "worst_water_ml": max(valid_results, key=lambda x: x["water_ml"])["water_ml"]
                }
            }

        return {"comparison": results, "recommendation": None}


# Example usage
if __name__ == "__main__":
    calculator = WaterCalculator()

    # Calculate water for GPT-4o short query
    result = calculator.calculate_water("gpt-4o", 100, 300)
    print(f"GPT-4o Short Query:")
    print(f"  Total Water: {result['water_ml']:.2f} mL ({result['water_l']:.4f} L)")
    print(f"  On-site cooling: {result['breakdown']['onsite_cooling_ml']:.2f} mL")
    print(f"  Off-site electricity: {result['breakdown']['offsite_electricity_ml']:.2f} mL")

    # Compare models
    comparison = calculator.compare_models(
        ["gpt-4o", "deepseek-r1", "gpt-4.1-nano"],
        100, 300
    )
    print(f"\nMost water-efficient model: {comparison['recommendation']}")
    print(f"  Best: {comparison['savings']['best_water_ml']:.2f} mL")
    print(f"  Worst: {comparison['savings']['worst_water_ml']:.2f} mL")
