"""
Energy Calculation Module
Based on "How Hungry is AI?" paper methodology

Formula: Equery (kWh) = [(Output_Length / TPS + Latency) / 3600] × [(PGPU × UGPU) + (Pnon-GPU × Unon-GPU)] × PUE
"""

import json
from pathlib import Path
from typing import Dict, Tuple


class EnergyCalculator:
    def __init__(self, data_dir: str = "../data"):
        """Initialize the energy calculator with model and infrastructure data."""
        self.data_dir = Path(data_dir)
        self.models = self._load_models()
        self.infrastructure = self._load_infrastructure()

    def _load_models(self) -> Dict:
        """Load model benchmarks from JSON."""
        with open(self.data_dir / "model_benchmarks.json", "r") as f:
            return json.load(f)

    def _load_infrastructure(self) -> Dict:
        """Load infrastructure multipliers from JSON."""
        with open(self.data_dir / "infrastructure.json", "r") as f:
            return json.load(f)

    def _get_provider_multipliers(self, model_id: str) -> Dict:
        """Get PUE, WUE, CIF multipliers for a model's provider."""
        model = next((m for m in self.models["models"] if m["model_id"] == model_id), None)
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

    def _determine_prompt_category(self, input_tokens: int, output_tokens: int) -> str:
        """
        Determine prompt category based on token counts.

        Categories from paper:
        - Short: 100 input, 300 output
        - Medium: 1000 input, 1000 output
        - Long: 10000 input, 1500 output
        """
        total_tokens = input_tokens + output_tokens

        if total_tokens <= 500:
            return "short"
        elif total_tokens <= 2500:
            return "medium"
        else:
            return "long"

    def calculate_energy(
        self,
        model_id: str,
        input_tokens: int,
        output_tokens: int,
        use_benchmark: bool = True
    ) -> Dict:
        """
        Calculate energy consumption for a query.

        Args:
            model_id: Model identifier (e.g., "gpt-4o")
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            use_benchmark: If True, use pre-calculated benchmarks; if False, calculate from scratch

        Returns:
            Dictionary with energy metrics and confidence intervals
        """
        model = next((m for m in self.models["models"] if m["model_id"] == model_id), None)
        if not model:
            raise ValueError(f"Model {model_id} not found")

        category = self._determine_prompt_category(input_tokens, output_tokens)

        if use_benchmark:
            # Use pre-calculated benchmark data from paper
            perf = model["performance"][category]
            energy_wh = perf["energy_wh_mean"]
            energy_std = perf["energy_wh_std"]

            return {
                "energy_wh": energy_wh,
                "energy_kwh": energy_wh / 1000,
                "confidence_interval": {
                    "min_wh": max(0, energy_wh - energy_std),
                    "max_wh": energy_wh + energy_std,
                    "std_dev": energy_std
                },
                "prompt_category": category,
                "method": "benchmark"
            }
        else:
            # Calculate from formula (for custom token counts)
            return self._calculate_from_formula(model, input_tokens, output_tokens, category)

    def _calculate_from_formula(
        self,
        model: Dict,
        input_tokens: int,
        output_tokens: int,
        category: str
    ) -> Dict:
        """
        Calculate energy using the paper's formula:
        Equery = [(Output_Length / TPS + Latency) / 3600] × [(PGPU × UGPU) + (Pnon-GPU × Unon-GPU)] × PUE
        """
        perf = model["performance"][category]
        provider = self._get_provider_multipliers(model["model_id"])

        # Get performance metrics
        latency = perf["latency_p50"]  # seconds
        tps = perf["tps_p50"]  # tokens per second

        # Get power specifications
        pgpu = model["critical_power_kw"]  # Total node power in kW
        pue = provider["pue"]

        # Calculate inference time
        output_time = output_tokens / tps  # seconds to generate output
        total_time = latency + output_time  # total time in seconds
        total_time_hours = total_time / 3600  # convert to hours

        # Simplified power calculation (using full node power as approximation)
        # In production, you'd use UGPU and Unon-GPU from infrastructure.json
        power_kw = pgpu

        # Calculate energy
        energy_kwh = total_time_hours * power_kw * pue
        energy_wh = energy_kwh * 1000

        # Estimate uncertainty (±25% as approximation)
        energy_std = energy_wh * 0.25

        return {
            "energy_wh": energy_wh,
            "energy_kwh": energy_kwh,
            "confidence_interval": {
                "min_wh": energy_wh * 0.75,
                "max_wh": energy_wh * 1.25,
                "std_dev": energy_std
            },
            "prompt_category": category,
            "method": "formula",
            "details": {
                "latency_seconds": latency,
                "output_time_seconds": output_time,
                "total_time_seconds": total_time,
                "tps": tps,
                "power_kw": power_kw,
                "pue": pue
            }
        }

    def estimate_tokens(self, text: str) -> int:
        """
        Estimate token count from text.
        Rule of thumb: 1 token ≈ 4 characters for English
        """
        return len(text) // 4

    def compare_models(
        self,
        model_ids: list,
        input_tokens: int,
        output_tokens: int
    ) -> Dict:
        """
        Compare energy consumption across multiple models.

        Returns:
            Dictionary with comparison data and recommendation
        """
        results = []

        for model_id in model_ids:
            try:
                energy_data = self.calculate_energy(model_id, input_tokens, output_tokens)
                model = next((m for m in self.models["models"] if m["model_id"] == model_id), None)

                results.append({
                    "model_id": model_id,
                    "model_name": model["name"],
                    "energy_wh": energy_data["energy_wh"],
                    "energy_kwh": energy_data["energy_kwh"],
                    "confidence_interval": energy_data["confidence_interval"],
                    "provider": model["provider"],
                    "size_class": model["size_class"]
                })
            except Exception as e:
                results.append({
                    "model_id": model_id,
                    "error": str(e)
                })

        # Find most efficient model
        valid_results = [r for r in results if "error" not in r]
        if valid_results:
            most_efficient = min(valid_results, key=lambda x: x["energy_wh"])

            return {
                "comparison": results,
                "recommendation": most_efficient["model_id"],
                "savings": {
                    "best_energy_wh": most_efficient["energy_wh"],
                    "worst_energy_wh": max(valid_results, key=lambda x: x["energy_wh"])["energy_wh"]
                }
            }

        return {"comparison": results, "recommendation": None}


# Example usage
if __name__ == "__main__":
    calculator = EnergyCalculator()

    # Calculate energy for GPT-4o short query
    result = calculator.calculate_energy("gpt-4o", 100, 300)
    print(f"GPT-4o Short Query:")
    print(f"  Energy: {result['energy_wh']:.3f} Wh")
    print(f"  Range: {result['confidence_interval']['min_wh']:.3f} - {result['confidence_interval']['max_wh']:.3f} Wh")

    # Compare models
    comparison = calculator.compare_models(
        ["gpt-4o", "gpt-4o-mini", "claude-3.7-sonnet", "gpt-4.1-nano"],
        100, 300
    )
    print(f"\nMost efficient model: {comparison['recommendation']}")
