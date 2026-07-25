import { discoverExtractedInventory } from "./extracted-inventory";
import type { Preferences } from "./schemas";

const CONFIG = {
  id: "rentalsinc",
  inventoryUrl: "https://www.rentalsinc.com/markets/san-francisco",
  instructions:
    "Extract every currently available residential apartment in San Francisco, up to 50. Use the exact public detail-page URL, numeric monthly rent, bedrooms, bathrooms, address and all visible image URLs. Exclude rooms, SROs, navigation, and properties outside San Francisco. Do not invent missing values.",
  caveat:
    "Live Rentals Inc. inventory. Verify availability before applying.",
  requireSanFranciscoAddress: true,
} as const;

export function discoverRentalsIncListings(
  preferences: Preferences,
  apiKey: string,
) {
  return discoverExtractedInventory(CONFIG, preferences, apiKey);
}
