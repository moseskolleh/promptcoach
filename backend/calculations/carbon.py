"""
Carbon Calculation Module
Based on "How Hungry is AI?" paper methodology

Formula: Carbon (kgCO2e) = Equery × CIF
"""

import json
from pathlib import Path
from typing import Dict
from .energy import EnergyCalculator


class CarbonCalculator:
    def __init__(self, data_dir: str = "../data"):
        """Initialize the carbon calculator."""
        self.data_dir = Path(data_dir)
        self.energy_calculator = EnergyCalculator(data_dir)
        self.infrastructure = self._load_infrastructure()

    def _load_infrastructure(self) -> Dict:
        """Load infrastructure multipliers from JSON."""
        with open(self.data_dir / "infrastructure.json", "r") as f:
            return json.load(f)

    def _get_provider_multipliers(self, model_id: str) -> Dict:
        """Get CIF for a model's provider."""
        model = next((m for m in self.energy_calculator.models["models"] if m["model_id"] == model_id), None)
        if not model:
            raise ValueError(f"Model {model_id} not found")

        provider_map = {
            "Microsoft Azure": "microsoft_azure",
            "AWS": "aws",
            "DeepSeek": "deepseek"
        }

        provider_key = provider_map.get(model["host"])
        if not provider_key:
            raise ValueError(f"Unknown provider: {model['host']}")

        return self.infrastructure["providers"][provider_key]

    def calculate_carbon(
        self,
        model_id: str,
        input_tokens: int,
        output_tokens: int,
        energy_wh: float = None
    ) -> Dict:
        """
        Calculate carbon emissions for a query.

        Formula from paper:
        Carbon (kgCO2e) = Equery × CIF

        Where:
        - Equery = Energy consumption in kWh
        - CIF = Carbon Intensity Factor (kgCO2e/kWh)

        Args:
            model_id: Model identifier
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            energy_wh: Pre-calculated energy (if None, will calculate)

        Returns:
            Dictionary with carbon metrics in grams and kilograms
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
        cif = provider["cif_kgco2e_per_kwh"]

        # Calculate carbon emissions
        carbon_kgco2e = energy_kwh * cif
        carbon_gco2e = carbon_kgco2e * 1000

        return {
            "carbon_gco2e": carbon_gco2e,
            "carbon_kgco2e": carbon_kgco2e,
            "multipliers": {
                "cif_kgco2e_per_kwh": cif
            },
            "energy_used": {
                "wh": energy_wh,
                "kwh": energy_kwh
            },
            "provider": provider["name"]
        }

    def compare_models(
        self,
        model_ids: list,
        input_tokens: int,
        output_tokens: int
    ) -> Dict:
        """
        Compare carbon emissions across multiple models.

        Returns:
            Dictionary with comparison data and recommendation
        """
        results = []

        for model_id in model_ids:
            try:
                carbon_data = self.calculate_carbon(model_id, input_tokens, output_tokens)
                model = next((m for m in self.energy_calculator.models["models"] if m["model_id"] == model_id), None)

                results.append({
                    "model_id": model_id,
                    "model_name": model["name"],
                    "carbon_gco2e": carbon_data["carbon_gco2e"],
                    "carbon_kgco2e": carbon_data["carbon_kgco2e"],
                    "provider": carbon_data["provider"]
                })
            except Exception as e:
                results.append({
                    "model_id": model_id,
                    "error": str(e)
                })

        # Find most efficient model
        valid_results = [r for r in results if "error" not in r]
        if valid_results:
            most_efficient = min(valid_results, key=lambda x: x["carbon_gco2e"])

            return {
                "comparison": results,
                "recommendation": most_efficient["model_id"],
                "savings": {
                    "best_carbon_gco2e": most_efficient["carbon_gco2e"],
                    "worst_carbon_gco2e": max(valid_results, key=lambda x: x["carbon_gco2e"])["carbon_gco2e"]
                }
            }

        return {"comparison": results, "recommendation": None}

    def calculate_annual_impact(
        self,
        daily_queries: int,
        carbon_per_query_gco2e: float,
        growth_rate: float = 0.0
    ) -> Dict:
        """
        Calculate annual carbon impact with optional growth rate.

        Args:
            daily_queries: Number of queries per day
            carbon_per_query_gco2e: Carbon per query in gCO2e
            growth_rate: Monthly growth rate (e.g., 0.20 for 20%)

        Returns:
            Dictionary with annual projections
        """
        annual_queries = 0
        annual_carbon_gco2e = 0

        current_daily = daily_queries

        for month in range(12):
            # Queries this month
            days_in_month = 30  # Simplified
            monthly_queries = current_daily * days_in_month

            # Carbon this month
            monthly_carbon = monthly_queries * carbon_per_query_gco2e

            annual_queries += monthly_queries
            annual_carbon_gco2e += monthly_carbon

            # Apply growth for next month
            if month < 11:  # Don't grow after the last month
                current_daily *= (1 + growth_rate)

        annual_carbon_kgco2e = annual_carbon_gco2e / 1000
        annual_carbon_tco2e = annual_carbon_kgco2e / 1000

        return {
            "annual_queries": int(annual_queries),
            "annual_carbon_gco2e": annual_carbon_gco2e,
            "annual_carbon_kgco2e": annual_carbon_kgco2e,
            "annual_carbon_tons": annual_carbon_tco2e,
            "daily_queries_start": daily_queries,
            "daily_queries_end": int(current_daily),
            "growth_rate": growth_rate
        }


# Example usage
if __name__ == "__main__":
    calculator = CarbonCalculator()

    # Calculate carbon for GPT-4o short query
    result = calculator.calculate_carbon("gpt-4o", 100, 300)
    print(f"GPT-4o Short Query:")
    print(f"  Carbon: {result['carbon_gco2e']:.3f} gCO2e ({result['carbon_kgco2e']:.6f} kgCO2e)")
    print(f"  Provider: {result['provider']}")

    # Compare models
    comparison = calculator.compare_models(
        ["gpt-4o", "deepseek-r1", "gpt-4.1-nano"],
        100, 300
    )
    print(f"\nMost carbon-efficient model: {comparison['recommendation']}")
    print(f"  Best: {comparison['savings']['best_carbon_gco2e']:.3f} gCO2e")
    print(f"  Worst: {comparison['savings']['worst_carbon_gco2e']:.3f} gCO2e")

    # Annual impact calculation (GPT-4o case study from paper)
    annual = calculator.calculate_annual_impact(
        daily_queries=700_000_000,  # 700 million/day
        carbon_per_query_gco2e=0.15,  # GPT-4o short query
        growth_rate=0.20  # 20% monthly growth (Jan-May)
    )
    print(f"\nAnnual Impact (GPT-4o style):")
    print(f"  Total queries: {annual['annual_queries']:,.0f}")
    print(f"  Total carbon: {annual['annual_carbon_tons']:,.0f} tons CO2e")
