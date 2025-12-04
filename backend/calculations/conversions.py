"""
Relatable Conversions Module
Converts energy, water, and carbon metrics into understandable comparisons
"""

import json
from pathlib import Path
from typing import Dict, List


class ConversionCalculator:
    def __init__(self, data_dir: str = "../data"):
        """Initialize the conversion calculator."""
        self.data_dir = Path(data_dir)
        self.conversion_factors = self._load_conversion_factors()

    def _load_conversion_factors(self) -> Dict:
        """Load conversion factors from JSON."""
        with open(self.data_dir / "conversion_factors.json", "r") as f:
            return json.load(f)

    def convert_energy(self, energy_wh: float, top_n: int = 3) -> Dict:
        """
        Convert energy (Wh) to relatable equivalents.

        Args:
            energy_wh: Energy in watt-hours
            top_n: Number of most relevant conversions to return

        Returns:
            Dictionary with conversions and primary comparison
        """
        conversions = {}
        energy_factors = self.conversion_factors["energy_conversions"]

        # LED lightbulb (minutes)
        led_minutes = energy_wh * 60  # 1Wh = 60 minutes of 1W bulb
        conversions["led_lightbulb"] = {
            "value": led_minutes,
            "unit": "minutes",
            "description": f"{led_minutes:.1f} minutes of LED lightbulb (1W)",
            "icon": "💡"
        }

        # Smartphone charge (percentage)
        smartphone_pct = (energy_wh / 10) * 100  # 10Wh = 100%
        conversions["smartphone_charge"] = {
            "value": smartphone_pct,
            "unit": "percentage",
            "description": f"{smartphone_pct:.1f}% of smartphone charge",
            "icon": "📱"
        }

        # Coffee cup
        coffee_cups = energy_wh / 40  # 40Wh per cup
        conversions["coffee_cup"] = {
            "value": coffee_cups,
            "unit": "cups",
            "description": f"{coffee_cups:.3f} cups of coffee",
            "icon": "☕"
        }

        # Laptop runtime (minutes)
        laptop_minutes = (energy_wh / 50) * 60  # 50W laptop
        conversions["laptop_runtime"] = {
            "value": laptop_minutes,
            "unit": "minutes",
            "description": f"{laptop_minutes:.1f} minutes of laptop usage",
            "icon": "💻"
        }

        # TV runtime (minutes)
        tv_minutes = (energy_wh / 130) * 60  # 130W TV
        conversions["tv_runtime"] = {
            "value": tv_minutes,
            "unit": "minutes",
            "description": f"{tv_minutes:.1f} minutes of 65\" TV",
            "icon": "📺"
        }

        # Determine primary comparison (most relatable)
        if energy_wh < 1:
            primary = "led_lightbulb"
        elif energy_wh < 5:
            primary = "smartphone_charge"
        elif energy_wh < 20:
            primary = "laptop_runtime"
        else:
            primary = "coffee_cup"

        return {
            "conversions": conversions,
            "primary": primary,
            "primary_description": conversions[primary]["description"]
        }

    def convert_water(self, water_ml: float, top_n: int = 3) -> Dict:
        """
        Convert water (mL) to relatable equivalents.

        Args:
            water_ml: Water in milliliters
            top_n: Number of most relevant conversions to return

        Returns:
            Dictionary with conversions and primary comparison
        """
        conversions = {}

        # Water drops (approximately 20 drops per mL)
        drops = water_ml * 20  # 1mL ≈ 20 drops (medical/standard dropper)
        conversions["water_drops"] = {
            "value": drops,
            "unit": "drops",
            "description": f"{drops:.0f} drops of water",
            "icon": "💧"
        }

        # Coffee cups
        coffee_cups = water_ml / 250  # 250mL per cup
        conversions["coffee_cups"] = {
            "value": coffee_cups,
            "unit": "cups",
            "description": f"{coffee_cups:.3f} coffee cups",
            "icon": "☕"
        }

        # Water bottles
        bottles = water_ml / 500  # 500mL bottles
        conversions["water_bottles"] = {
            "value": bottles,
            "unit": "bottles",
            "description": f"{bottles:.3f} water bottles (500mL)",
            "icon": "🍶"
        }

        # Daily drinking water (percentage)
        daily_pct = (water_ml / 2000) * 100  # 2L per day
        conversions["daily_drinking_water"] = {
            "value": daily_pct,
            "unit": "percentage",
            "description": f"{daily_pct:.2f}% of daily drinking water",
            "icon": "🚰"
        }

        # Olympic pool (for large amounts)
        pool_pct = (water_ml / 2_500_000_000) * 100  # 2.5M liters
        conversions["olympic_pool"] = {
            "value": pool_pct,
            "unit": "percentage",
            "description": f"{pool_pct:.6f}% of Olympic pool",
            "icon": "🏊"
        }

        # Determine primary comparison
        if water_ml < 10:
            primary = "water_drops"
        elif water_ml < 100:
            primary = "daily_drinking_water"
        elif water_ml < 500:
            primary = "coffee_cups"
        else:
            primary = "water_bottles"

        return {
            "conversions": conversions,
            "primary": primary,
            "primary_description": conversions[primary]["description"]
        }

    def convert_carbon(self, carbon_gco2e: float, top_n: int = 3) -> Dict:
        """
        Convert carbon (gCO2e) to relatable equivalents.

        Args:
            carbon_gco2e: Carbon in grams CO2 equivalent
            top_n: Number of most relevant conversions to return

        Returns:
            Dictionary with conversions and primary comparison
        """
        conversions = {}

        # Car distance (meters)
        car_meters = (carbon_gco2e / 200) * 1000  # 200gCO2e per km
        conversions["car_meters"] = {
            "value": car_meters,
            "unit": "meters",
            "description": f"{car_meters:.1f} meters driven by car",
            "icon": "🚗"
        }

        # Car distance (kilometers)
        car_km = carbon_gco2e / 200  # 200gCO2e per km
        conversions["car_kilometers"] = {
            "value": car_km,
            "unit": "kilometers",
            "description": f"{car_km:.3f} km driven by car",
            "icon": "🚗"
        }

        # Tree absorption (daily)
        trees_daily = carbon_gco2e / 48  # 48gCO2e per tree per day
        conversions["tree_absorption_daily"] = {
            "value": trees_daily,
            "unit": "trees (daily)",
            "description": f"{trees_daily:.3f} trees needed for 1 day",
            "icon": "🌳"
        }

        # Forest area (yearly)
        forest_sqm = carbon_gco2e / 10  # 10gCO2e per m² per year
        conversions["forest_area"] = {
            "value": forest_sqm,
            "unit": "square meters (yearly)",
            "description": f"{forest_sqm:.2f} m² of forest for 1 year",
            "icon": "🌲"
        }

        # Transatlantic flight (percentage)
        flight_pct = (carbon_gco2e / 700_000) * 100  # 700kg per flight
        conversions["transatlantic_flight"] = {
            "value": flight_pct,
            "unit": "percentage",
            "description": f"{flight_pct:.4f}% of transatlantic flight",
            "icon": "✈️"
        }

        # Determine primary comparison
        if carbon_gco2e < 1:
            primary = "car_meters"
        elif carbon_gco2e < 50:
            primary = "car_meters"
        else:
            primary = "car_kilometers"

        return {
            "conversions": conversions,
            "primary": primary,
            "primary_description": conversions[primary]["description"]
        }

    def convert_all(
        self,
        energy_wh: float,
        water_ml: float,
        carbon_gco2e: float
    ) -> Dict:
        """
        Convert all metrics at once.

        Returns:
            Dictionary with all conversions organized by category
        """
        return {
            "energy": self.convert_energy(energy_wh),
            "water": self.convert_water(water_ml),
            "carbon": self.convert_carbon(carbon_gco2e),
            "summary": {
                "energy_primary": self.convert_energy(energy_wh)["primary_description"],
                "water_primary": self.convert_water(water_ml)["primary_description"],
                "carbon_primary": self.convert_carbon(carbon_gco2e)["primary_description"]
            }
        }

    def format_for_display(
        self,
        energy_wh: float,
        water_ml: float,
        carbon_gco2e: float
    ) -> str:
        """
        Format conversions for user-friendly display.

        Returns:
            Formatted string with all primary comparisons
        """
        conversions = self.convert_all(energy_wh, water_ml, carbon_gco2e)

        return f"""
🌍 ENVIRONMENTAL IMPACT

⚡ Energy: {energy_wh:.2f} Wh
   = {conversions['energy']['primary_description']}

💧 Water: {water_ml:.2f} mL
   = {conversions['water']['primary_description']}

🌱 Carbon: {carbon_gco2e:.2f} gCO2e
   = {conversions['carbon']['primary_description']}
        """.strip()


# Example usage
if __name__ == "__main__":
    converter = ConversionCalculator()

    # GPT-4o short query example
    energy_wh = 0.42
    water_ml = 1.5
    carbon_gco2e = 0.15

    print("GPT-4o Short Query Conversions:")
    print(converter.format_for_display(energy_wh, water_ml, carbon_gco2e))

    # DeepSeek-R1 long query example
    print("\n" + "="*50)
    print("\nDeepSeek-R1 Long Query Conversions:")
    energy_wh = 33.634
    water_ml = 150
    carbon_gco2e = 14

    print(converter.format_for_display(energy_wh, water_ml, carbon_gco2e))

    # Detailed conversion breakdown
    print("\n" + "="*50)
    print("\nDetailed Energy Conversions:")
    energy_conv = converter.convert_energy(0.42)
    for name, data in energy_conv["conversions"].items():
        print(f"  {data['icon']} {data['description']}")
